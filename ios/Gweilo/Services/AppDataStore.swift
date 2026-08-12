import Foundation
import Observation
import WidgetKit

struct HomeDashboardSnapshot: Codable, Equatable, Sendable {
    let topThreeSinglesPlayers: [RankingEntry]
    let currentUserLatestSessionDelta: Double?
    let currentUserLatestFormScore: Double?
    let currentUserFirstName: String
    let savedAt: Date
}

struct HomeDashboardSnapshotStore {
    private let defaults: UserDefaults
    private let keyPrefix = "home-dashboard-snapshot-v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load(for userID: UUID) -> HomeDashboardSnapshot? {
        guard let data = defaults.data(forKey: key(for: userID)) else {
            return nil
        }
        return try? JSONDecoder().decode(
            HomeDashboardSnapshot.self,
            from: data
        )
    }

    func save(_ snapshot: HomeDashboardSnapshot, for userID: UUID) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key(for: userID))
    }

    private func key(for userID: UUID) -> String {
        "\(keyPrefix)-\(userID.uuidString.lowercased())"
    }
}

struct ExpiringCache<Key: Hashable, Value> {
    private struct Entry {
        let value: Value
        let storedAt: Date
    }

    private var entries: [Key: Entry] = [:]
    let lifetime: TimeInterval

    init(lifetime: TimeInterval) {
        self.lifetime = lifetime
    }

    func cachedValue(for key: Key) -> Value? {
        entries[key]?.value
    }

    func freshValue(for key: Key, at date: Date = .now) -> Value? {
        guard let entry = entries[key],
              date.timeIntervalSince(entry.storedAt) < lifetime else {
            return nil
        }
        return entry.value
    }

    mutating func insert(_ value: Value, for key: Key, at date: Date = .now) {
        entries[key] = Entry(value: value, storedAt: date)
    }

    mutating func removeAll() {
        entries.removeAll(keepingCapacity: true)
    }
}

@Observable
@MainActor
final class AppDataStore {
    private static let profileCacheLifetime: TimeInterval = 5 * 60

    private(set) var sessions: [SessionSummary] = []
    private(set) var singlesRankings: [RankingEntry] = []
    private(set) var doublesPlayerRankings: [RankingEntry] = []
    private(set) var doublesTeamRankings: [RankingEntry] = []
    private(set) var topThreeSinglesPlayers: [RankingEntry] = []
    private(set) var rankingEligibility = RankingEligibility.fallback
    private(set) var cachedAvailableSessionPlayers: [SessionCreationPlayer] = []
    private(set) var hasLoadedAvailableSessionPlayers = false
    private(set) var cachedCalculatorPlayers: [EloCalculatorPlayer] = []
    private(set) var hasLoadedCalculatorPlayers = false
    private(set) var clubActiveSessionID: UUID?
    private(set) var hasCheckedActiveSession = false
    private(set) var canManageSessions: Bool
    private(set) var isAdmin: Bool
    private(set) var missionSnapshot: RivalryMissionSnapshot?
    private(set) var isMissionsLoading = false
    private(set) var hasLoadedMissions = false
    private(set) var missionsErrorMessage: String?
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var hasCompletedInitialHomeLoad = false
    private(set) var errorMessage: String?

    private var client: SupabaseDataClient
    private var apiClient: GweiloAPIClient
    private var missionsClient: RivalryMissionsClient
    private let configuration: AppConfiguration
    private let homeSnapshotStore: HomeDashboardSnapshotStore
    private let widgetSnapshotStore: GweiloWidgetSnapshotStore
    private var homeLatestSessionDelta: Double?
    private var homeLatestSessionFormScore: Double?
    private var homeCurrentUserFirstName: String?
    @ObservationIgnored
    private var playerHistoryCache = ExpiringCache<UUID, PlayerEloHistory>(
        lifetime: profileCacheLifetime
    )
    @ObservationIgnored
    private var headToHeadCache = ExpiringCache<UUID, PlayerHeadToHead>(
        lifetime: profileCacheLifetime
    )
    @ObservationIgnored
    private var doublesProfileCache = ExpiringCache<UUID, DoublesTeamProfile>(
        lifetime: profileCacheLifetime
    )
    @ObservationIgnored
    private var doublesHistoryCache = ExpiringCache<UUID, PlayerEloHistory>(
        lifetime: profileCacheLifetime
    )
    @ObservationIgnored
    private var loadGeneration = 0
    let currentUserID: UUID
    private(set) var authenticatedUserFallbackName: String

    init(
        configuration: AppConfiguration,
        session: AuthSession,
        homeSnapshotStore: HomeDashboardSnapshotStore =
            HomeDashboardSnapshotStore(),
        widgetSnapshotStore: GweiloWidgetSnapshotStore =
            GweiloWidgetSnapshotStore()
    ) {
        self.configuration = configuration
        self.homeSnapshotStore = homeSnapshotStore
        self.widgetSnapshotStore = widgetSnapshotStore
        currentUserID = session.user.id
        authenticatedUserFallbackName = Self.fallbackName(for: session.user.email)
        canManageSessions = session.user.canManageSessions
        isAdmin = session.user.isAdmin
        client = SupabaseDataClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        apiClient = GweiloAPIClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        missionsClient = RivalryMissionsClient(
            configuration: configuration,
            accessToken: session.accessToken
        )

        if let snapshot = homeSnapshotStore.load(for: session.user.id) {
            topThreeSinglesPlayers = snapshot.topThreeSinglesPlayers
            homeLatestSessionDelta =
                snapshot.currentUserLatestSessionDelta
            homeLatestSessionFormScore = snapshot.currentUserLatestFormScore
            homeCurrentUserFirstName = snapshot.currentUserFirstName
            hasLoaded = true
        }
    }

    func updateSession(_ session: AuthSession) {
        authenticatedUserFallbackName = Self.fallbackName(for: session.user.email)
        canManageSessions = session.user.canManageSessions
        isAdmin = session.user.isAdmin
        cachedAvailableSessionPlayers = []
        hasLoadedAvailableSessionPlayers = false
        cachedCalculatorPlayers = []
        hasLoadedCalculatorPlayers = false
        client = SupabaseDataClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        apiClient = GweiloAPIClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        missionsClient = RivalryMissionsClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        hasLoadedMissions = false
    }

    var activeSession: SessionSummary? {
        sessions.first { $0.status == .active }
    }

    var canStartNewSession: Bool {
        canManageSessions
            && activeSession == nil
            && clubActiveSessionID == nil
    }

    var recentCompletedSessions: [SessionSummary] {
        Array(
            sessions.lazy
                .filter { $0.status == .completed }
                .prefix(3)
        )
    }

    var currentUserLatestSessionDelta: Double? {
        homeLatestSessionDelta
    }

    var currentUserLatestSessionFormScore: Double? {
        homeLatestSessionFormScore
    }

    var currentUserFirstName: String {
        let displayName = homeCurrentUserFirstName ??
            singlesRankings.first { $0.id == currentUserID }?.name ??
            doublesPlayerRankings.first { $0.id == currentUserID }?.name ??
            authenticatedUserFallbackName

        return displayName
            .split(whereSeparator: \.isWhitespace)
            .first
            .map(String.init) ?? "Igrač"
    }

    private static func fallbackName(for email: String?) -> String {
        guard
            let localPart = email?.split(separator: "@").first,
            let firstComponent = localPart.split(whereSeparator: {
                $0 == "." || $0 == "_" || $0 == "-"
            }).first,
            !firstComponent.isEmpty
        else {
            return "Igrač"
        }

        return String(firstComponent).capitalized
    }

    func rankings(for category: RankingCategory) -> [RankingEntry] {
        switch category {
        case .singles: singlesRankings
        case .doublesPlayers: doublesPlayerRankings
        case .doublesTeams: doublesTeamRankings
        }
    }

    func sessionDetail(for session: SessionSummary) async throws -> SessionDetail {
        try await client.fetchSessionDetail(session: session)
    }

    func submitRound(
        sessionID: UUID,
        roundNumber: Int,
        scores: [RoundMatchScoreSubmission]
    ) async throws -> RoundSubmissionResult {
        do {
            let result = try await apiClient.submitRound(
                sessionID: sessionID,
                roundNumber: roundNumber,
                scores: scores
            )
            invalidateProfileCaches()
            await load(forceRefresh: true)
            await loadMissions(forceRefresh: true)
            if sessions.contains(where: {
                $0.id == sessionID && $0.status == .completed
            }) {
                clubActiveSessionID = nil
                hasCheckedActiveSession = true
            }
            return result
        } catch let error as BackendAPIError where error.isSessionNotFound {
            sessions.removeAll { $0.id == sessionID }
            if clubActiveSessionID == sessionID {
                clubActiveSessionID = nil
            }
            await load(forceRefresh: true)
            errorMessage = error.localizedDescription
            throw error
        } catch {
            throw error
        }
    }

    func cachedPlayerEloHistory(for playerID: UUID) -> PlayerEloHistory? {
        playerHistoryCache.cachedValue(for: playerID)
    }

    func playerEloHistory(
        for playerID: UUID,
        forceRefresh: Bool = false
    ) async throws -> PlayerEloHistory {
        if !forceRefresh,
           let cached = playerHistoryCache.freshValue(for: playerID) {
            return cached
        }
        let history = try await apiClient.fetchPlayerEloHistory(playerID: playerID)
        playerHistoryCache.insert(history, for: playerID)
        return history
    }

    func cachedHeadToHead(for playerID: UUID) -> PlayerHeadToHead? {
        headToHeadCache.cachedValue(for: playerID)
    }

    func headToHead(
        for playerID: UUID,
        forceRefresh: Bool = false
    ) async throws -> PlayerHeadToHead {
        if !forceRefresh,
           let cached = headToHeadCache.freshValue(for: playerID) {
            return cached
        }
        let comparison = try await apiClient.fetchHeadToHead(
            playerID: playerID,
            opponentID: currentUserID
        )
        headToHeadCache.insert(comparison, for: playerID)
        return comparison
    }

    func cachedDoublesTeamProfile(for teamID: UUID) -> DoublesTeamProfile? {
        doublesProfileCache.cachedValue(for: teamID)
    }

    func doublesTeamProfile(
        for teamID: UUID,
        forceRefresh: Bool = false
    ) async throws -> DoublesTeamProfile {
        if !forceRefresh,
           let cached = doublesProfileCache.freshValue(for: teamID) {
            return cached
        }
        let profile = try await apiClient.fetchDoublesTeamProfile(teamID: teamID)
        doublesProfileCache.insert(profile, for: teamID)
        return profile
    }

    func cachedDoublesTeamEloHistory(for teamID: UUID) -> PlayerEloHistory? {
        doublesHistoryCache.cachedValue(for: teamID)
    }

    func doublesTeamEloHistory(
        for teamID: UUID,
        forceRefresh: Bool = false
    ) async throws -> PlayerEloHistory {
        if !forceRefresh,
           let cached = doublesHistoryCache.freshValue(for: teamID) {
            return cached
        }
        let history = try await apiClient.fetchDoublesTeamEloHistory(teamID: teamID)
        doublesHistoryCache.insert(history, for: teamID)
        return history
    }

    func availableSessionPlayers(
        forceRefresh: Bool = false
    ) async throws -> [SessionCreationPlayer] {
        if hasLoadedAvailableSessionPlayers, !forceRefresh {
            return cachedAvailableSessionPlayers
        }

        let players = try await apiClient.fetchAvailableSessionPlayers()
        let preparedPlayers = prepareAvailableSessionPlayers(players)
        cachedAvailableSessionPlayers = preparedPlayers
        hasLoadedAvailableSessionPlayers = true
        return preparedPlayers
    }

    func calculatorPlayers(
        forceRefresh: Bool = false
    ) async throws -> [EloCalculatorPlayer] {
        if hasLoadedCalculatorPlayers, !forceRefresh {
            return cachedCalculatorPlayers
        }

        let players = try await apiClient.fetchCalculatorPlayers()
        cachedCalculatorPlayers = players.sorted {
            if $0.elo != $1.elo {
                return $0.elo > $1.elo
            }
            return $0.name.localizedCaseInsensitiveCompare($1.name)
                == .orderedAscending
        }
        hasLoadedCalculatorPlayers = true
        return cachedCalculatorPlayers
    }

    func loadMissions(forceRefresh: Bool = false) async {
        guard !isMissionsLoading else { return }
        guard forceRefresh || !hasLoadedMissions else { return }

        isMissionsLoading = true
        missionsErrorMessage = nil
        defer {
            isMissionsLoading = false
            hasLoadedMissions = true
        }

        do {
            missionSnapshot = try await missionsClient.playerSnapshot()
        } catch {
            missionsErrorMessage = error.localizedDescription
        }
    }

    func loadHome(forceRefresh: Bool = false) async {
        async let appData: Void = load(forceRefresh: forceRefresh)
        async let missions: Void = loadMissions(forceRefresh: forceRefresh)
        _ = await (appData, missions)
        hasCompletedInitialHomeLoad = true
    }

    private func prepareAvailableSessionPlayers(
        _ players: [SessionCreationPlayer]
    ) -> [SessionCreationPlayer] {
        let rankingByPlayerID = Dictionary(
            uniqueKeysWithValues: singlesRankings.map { ($0.id, $0) }
        )
        return players
            .map {
                SessionCreationPlayer(
                    id: $0.id,
                    name: $0.name,
                    avatarURL: $0.avatarURL,
                    elo: rankingByPlayerID[$0.id]?.elo
                )
            }
            .sorted {
                let leftMatches = rankingByPlayerID[$0.id]?.matches ?? 0
                let rightMatches = rankingByPlayerID[$1.id]?.matches ?? 0
                if leftMatches != rightMatches {
                    return leftMatches > rightMatches
                }
                return $0.name.localizedCaseInsensitiveCompare($1.name)
                    == .orderedAscending
            }
    }

    func previewSession(
        players: [SessionCreationPlayer],
        format: FourPlayerSessionFormat
    ) async throws -> SessionSchedulePreview {
        try await apiClient.previewSession(players: players, format: format)
    }

    func createSession(
        from draft: SessionCreationDraft,
        preview: SessionSchedulePreview
    ) async throws -> SessionSummary {
        let result = try await apiClient.createSession(
            from: draft,
            preview: preview
        )
        clubActiveSessionID = result.sessionId
        await load(forceRefresh: true)
        return sessions.first { $0.id == result.sessionId }
            ?? result.makeSummary(for: draft)
    }

    func cancelSession(sessionID: UUID) async throws {
        try await apiClient.cancelSession(sessionID: sessionID)
        clubActiveSessionID = nil
        invalidateProfileCaches()
        await load(forceRefresh: true)
    }

    func forceCloseSession(sessionID: UUID) async throws {
        try await apiClient.forceCloseSession(sessionID: sessionID)
        clubActiveSessionID = nil
        invalidateProfileCaches()
        await load(forceRefresh: true)
        await loadMissions(forceRefresh: true)
    }

    func load(forceRefresh: Bool = false) async {
        guard !isLoading || forceRefresh else { return }
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        hasCheckedActiveSession = false
        errorMessage = nil
        defer {
            if generation == loadGeneration {
                isLoading = false
                hasLoaded = true
            }
        }

        async let sessionsRequest = client.fetchSessions()
        async let rankingsRequest = apiClient.fetchRankings()
        async let activeSessionRequest = apiClient.fetchActiveSessionID()
        async let sessionPlayersRequest =
            apiClient.fetchAvailableSessionPlayers()
        async let widgetHistoryRequest =
            apiClient.fetchPlayerEloHistory(playerID: currentUserID)
        var firstError: Error?
        var widgetHistory: PlayerEloHistory?

        do {
            let loadedSessions = try await sessionsRequest
            guard generation == loadGeneration else { return }
            sessions = loadedSessions
        } catch {
            firstError = error
        }

        do {
            let rankings = try await rankingsRequest
            guard generation == loadGeneration else { return }
            singlesRankings = rankings.singles
            doublesPlayerRankings = rankings.doublesPlayers
            doublesTeamRankings = rankings.doublesTeams
            rankingEligibility = rankings.eligibility

            let freshTopThree = Array(rankings.singles.prefix(3))
            if freshTopThree.count == 3
                || topThreeSinglesPlayers.isEmpty {
                topThreeSinglesPlayers = freshTopThree
            }

            if let currentUser = rankings.singles.first(
                where: { $0.id == currentUserID }
            ) {
                homeLatestSessionDelta = currentUser.recentForm.last
                homeLatestSessionFormScore =
                    currentUser.resolvedRecentFormScores.last
                homeCurrentUserFirstName = currentUser.name
                    .split(whereSeparator: \.isWhitespace)
                    .first
                    .map(String.init)
            }
            saveHomeSnapshotIfPossible()
        } catch {
            firstError = firstError ?? error
        }

        do {
            let activeSessionID = try await activeSessionRequest
            guard generation == loadGeneration else { return }
            clubActiveSessionID = activeSessionID
            hasCheckedActiveSession = true
        } catch {
            firstError = firstError ?? error
        }

        do {
            let players = try await sessionPlayersRequest
            guard generation == loadGeneration else { return }
            cachedAvailableSessionPlayers =
                prepareAvailableSessionPlayers(players)
            hasLoadedAvailableSessionPlayers = true
        } catch {
            hasLoadedAvailableSessionPlayers = false
        }

        do {
            let history = try await widgetHistoryRequest
            guard generation == loadGeneration else { return }
            widgetHistory = history
            playerHistoryCache.insert(history, for: currentUserID)
        } catch {
            // Rankings still provide a useful form bar and table.
        }

        if generation == loadGeneration {
            saveWidgetSnapshot(history: widgetHistory)
        }

        if generation == loadGeneration {
            errorMessage = firstError?.localizedDescription
        }
    }

    private func invalidateProfileCaches() {
        playerHistoryCache.removeAll()
        headToHeadCache.removeAll()
        doublesProfileCache.removeAll()
        doublesHistoryCache.removeAll()
    }

    private func saveHomeSnapshotIfPossible() {
        guard topThreeSinglesPlayers.count == 3 else { return }
        homeSnapshotStore.save(
            HomeDashboardSnapshot(
                topThreeSinglesPlayers: topThreeSinglesPlayers,
                currentUserLatestSessionDelta: homeLatestSessionDelta,
                currentUserLatestFormScore: homeLatestSessionFormScore,
                currentUserFirstName:
                    homeCurrentUserFirstName ?? currentUserFirstName,
                savedAt: .now
            ),
            for: currentUserID
        )
    }

    private func saveWidgetSnapshot(history: PlayerEloHistory?) {
        guard !singlesRankings.isEmpty else { return }

        let standings = singlesRankings.prefix(5).enumerated().map {
            index,
            entry in
            GweiloWidgetStanding(
                rank: index + 1,
                name: entry.name,
                elo: entry.elo,
                recentForm: entry.recentForm.suffix(5).map {
                    Int($0.rounded())
                },
                recentFormScores: Array(
                    entry.resolvedRecentFormScores.suffix(5)
                ),
                isCurrentUser: entry.id == currentUserID
            )
        }

        let currentPlayer = singlesRankings.enumerated().first {
            $0.element.id == currentUserID
        }.map { index, entry in
            GweiloWidgetPlayer(
                name: entry.name,
                elo: entry.elo,
                rank: index + 1,
                recentForm: entry.recentForm.suffix(5).map {
                    Int($0.rounded())
                },
                recentFormScores: Array(
                    entry.resolvedRecentFormScores.suffix(5)
                ),
                recentMatches: Array(
                    (history?.points ?? [])
                        .filter { $0.match > 0 }
                        .suffix(3)
                        .reversed()
                ).map {
                    GweiloWidgetMatch(
                        opponent: $0.opponent ?? "Nepoznat protivnik",
                        score: $0.formattedScore,
                        eloDelta: $0.delta.map { Int($0.rounded()) },
                        outcome: $0.resolvedOutcome?.rawValue
                    )
                }
            )
        }

        let snapshot = GweiloWidgetSnapshot(
            savedAt: .now,
            player: currentPlayer,
            standings: standings
        )
        widgetSnapshotStore.save(snapshot)
        WidgetCenter.shared.reloadTimelines(
            ofKind: GweiloWidgetSnapshot.widgetKind
        )
    }
}

#if DEBUG
extension AppDataStore {
    func seedRankingsPreview(
        singles: [RankingEntry],
        doublesPlayers: [RankingEntry],
        doublesTeams: [RankingEntry]
    ) {
        singlesRankings = singles
        doublesPlayerRankings = doublesPlayers
        doublesTeamRankings = doublesTeams
        topThreeSinglesPlayers = Array(singles.prefix(3))
        if let currentUser = singles.first(
            where: { $0.id == currentUserID }
        ) {
            homeLatestSessionDelta = currentUser.recentForm.last
            homeLatestSessionFormScore =
                currentUser.resolvedRecentFormScores.last
            homeCurrentUserFirstName = currentUser.name
                .split(whereSeparator: \.isWhitespace)
                .first
                .map(String.init)
        }
        hasLoaded = true
    }
}
#endif
