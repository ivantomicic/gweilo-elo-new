import Foundation
import Observation
import WidgetKit

struct HomeDashboardSnapshot: Codable, Equatable, Sendable {
    let topThreeSinglesPlayers: [RankingEntry]
    let currentUserLatestSessionDelta: Double?
    let currentUserLatestFormScore: Double?
    let currentUserFirstName: String
    let savedAt: Date
    var sessions: [SessionSummary]? = nil
    var singlesRankings: [RankingEntry]? = nil
    var doublesPlayerRankings: [RankingEntry]? = nil
    var doublesTeamRankings: [RankingEntry]? = nil
    var rankingEligibility: RankingEligibility? = nil
    var availableSessionPlayers: [SessionCreationPlayer]? = nil
    var missionSnapshot: RivalryMissionSnapshot? = nil
    var primaryLoadedAt: Date? = nil
    var missionLoadedAt: Date? = nil
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

    mutating func removeValue(for key: Key) {
        entries.removeValue(forKey: key)
    }
}

@Observable
@MainActor
final class AppDataStore {
    private static let profileCacheLifetime: TimeInterval = 5 * 60
    private static let sessionDetailCacheLifetime: TimeInterval = 2 * 60
    private static let primaryRefreshLifetime: TimeInterval = 90
    private static let missionRefreshLifetime: TimeInterval = 5 * 60

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
    private var sessionDetailCache = ExpiringCache<UUID, SessionDetail>(
        lifetime: sessionDetailCacheLifetime
    )
    @ObservationIgnored
    private var sessionDetailRequests: [UUID: Task<SessionDetail, Error>] = [:]
    @ObservationIgnored
    private var availablePlayersRequest: Task<
        [SessionCreationPlayer], Error
    >?
    @ObservationIgnored
    private var loadWaiters: [CheckedContinuation<Void, Never>] = []
    @ObservationIgnored
    private var needsFollowupRefresh = false
    @ObservationIgnored
    private var isCurrentLoadForced = false
    @ObservationIgnored
    private var isRefreshingAuxiliaryData = false
    @ObservationIgnored
    private var lastSuccessfulLoadAt: Date?
    @ObservationIgnored
    private var lastMissionLoadAt: Date?
    @ObservationIgnored
    private var loadGeneration = 0
    @ObservationIgnored
    private var locallyStartedSessionID: UUID?
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
            sessions = snapshot.sessions ?? []
            singlesRankings = snapshot.singlesRankings ?? []
            doublesPlayerRankings = snapshot.doublesPlayerRankings ?? []
            doublesTeamRankings = snapshot.doublesTeamRankings ?? []
            rankingEligibility = snapshot.rankingEligibility ?? .fallback
            cachedAvailableSessionPlayers =
                snapshot.availableSessionPlayers ?? []
            hasLoadedAvailableSessionPlayers =
                snapshot.availableSessionPlayers != nil
            missionSnapshot = snapshot.missionSnapshot
            hasLoadedMissions = snapshot.missionLoadedAt != nil
                || snapshot.missionSnapshot != nil
            homeLatestSessionDelta =
                snapshot.currentUserLatestSessionDelta
            homeLatestSessionFormScore = snapshot.currentUserLatestFormScore
            homeCurrentUserFirstName = snapshot.currentUserFirstName
            lastSuccessfulLoadAt = snapshot.primaryLoadedAt
                ?? snapshot.savedAt
            lastMissionLoadAt = snapshot.missionLoadedAt
                ?? (snapshot.missionSnapshot == nil ? nil : snapshot.savedAt)
            hasLoaded = true
        }
    }

    func updateSession(_ session: AuthSession) {
        loadGeneration += 1
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
        lastSuccessfulLoadAt = nil
        lastMissionLoadAt = nil
        sessionDetailRequests.values.forEach { $0.cancel() }
        sessionDetailRequests.removeAll()
        sessionDetailCache.removeAll()
        availablePlayersRequest?.cancel()
        availablePlayersRequest = nil
    }

    var activeSession: SessionSummary? {
        sessions.first { $0.status == .active }
    }

    var canStartNewSession: Bool {
        hasCheckedActiveSession
            && canManageSessions
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

    func sessionDetail(
        for session: SessionSummary,
        forceRefresh: Bool = false
    ) async throws -> SessionDetail {
        if !forceRefresh,
           let detail = sessionDetailCache.freshValue(for: session.id) {
            return detail
        }
        if let request = sessionDetailRequests[session.id] {
            return try await request.value
        }

        let client = client
        let request = Task {
            try await client.fetchSessionDetail(session: session)
        }
        sessionDetailRequests[session.id] = request
        defer { sessionDetailRequests[session.id] = nil }
        let detail = try await request.value
        sessionDetailCache.insert(detail, for: session.id)
        return detail
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
            sessionDetailCache.removeValue(for: sessionID)
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

    func editMatchResult(
        sessionID: UUID,
        matchID: UUID,
        teamOneScore: Int,
        teamTwoScore: Int,
        reason: String?
    ) async throws -> MatchResultEditResult {
        guard isAdmin else {
            throw BackendAPIError.rejected(
                "Samo administrator može da menja sačuvane rezultate."
            )
        }

        let result = try await apiClient.editMatchResult(
            sessionID: sessionID,
            matchID: matchID,
            teamOneScore: teamOneScore,
            teamTwoScore: teamTwoScore,
            reason: reason
        )
        sessionDetailCache.removeValue(for: sessionID)
        invalidateProfileCaches()
        await load(forceRefresh: true)
        await loadMissions(forceRefresh: true)
        return result
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
        if let availablePlayersRequest {
            return try await availablePlayersRequest.value
        }

        let apiClient = apiClient
        let request = Task {
            let players = try await apiClient.fetchAvailableSessionPlayers()
            return prepareAvailableSessionPlayers(players)
        }
        availablePlayersRequest = request
        defer { availablePlayersRequest = nil }
        let preparedPlayers = try await request.value
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
        let hasFreshSnapshot = lastMissionLoadAt.map {
            Date.now.timeIntervalSince($0) < Self.missionRefreshLifetime
        } ?? false
        guard forceRefresh || !hasLoadedMissions || !hasFreshSnapshot else {
            return
        }

        isMissionsLoading = true
        missionsErrorMessage = nil
        defer {
            isMissionsLoading = false
            hasLoadedMissions = true
        }

        do {
            missionSnapshot = try await missionsClient.playerSnapshot()
            lastMissionLoadAt = .now
            saveHomeSnapshotIfPossible()
        } catch {
            missionsErrorMessage = error.localizedDescription
        }
    }

    func loadHome(forceRefresh: Bool = false) async {
        async let missions: Void = loadMissions(forceRefresh: forceRefresh)
        await load(forceRefresh: forceRefresh)
        hasCompletedInitialHomeLoad = true
        await missions
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
        locallyStartedSessionID = result.sessionId
        clubActiveSessionID = result.sessionId
        let createdRounds = result.rounds.isEmpty
            ? preview.rounds
            : result.rounds
        if let activeSession = makeWatchActiveSession(
            sessionID: result.sessionId,
            rounds: createdRounds
        ) {
            syncWatchActiveSession(activeSession)
        }
        IPhoneWorkoutLaunchService.shared.requestWorkoutPromptOnWatch()
        await load(forceRefresh: true)
        return sessions.first { $0.id == result.sessionId }
            ?? result.makeSummary(for: draft)
    }

    func cancelSession(sessionID: UUID) async throws {
        try await apiClient.cancelSession(sessionID: sessionID)
        sessionDetailCache.removeValue(for: sessionID)
        locallyStartedSessionID = nil
        clubActiveSessionID = nil
        invalidateProfileCaches()
        await load(forceRefresh: true)
    }

    func forceCloseSession(sessionID: UUID) async throws {
        try await apiClient.forceCloseSession(sessionID: sessionID)
        sessionDetailCache.removeValue(for: sessionID)
        locallyStartedSessionID = nil
        clubActiveSessionID = nil
        invalidateProfileCaches()
        await load(forceRefresh: true)
        await loadMissions(forceRefresh: true)
    }

    func load(forceRefresh: Bool = false) async {
        let hasFreshPrimaryData = lastSuccessfulLoadAt.map {
            Date.now.timeIntervalSince($0) < Self.primaryRefreshLifetime
        } ?? false
        if !forceRefresh,
           hasLoaded,
           hasFreshPrimaryData,
           hasCheckedActiveSession {
            return
        }

        if isLoading {
            needsFollowupRefresh = needsFollowupRefresh
                || (forceRefresh && !isCurrentLoadForced)
            await withCheckedContinuation { continuation in
                loadWaiters.append(continuation)
            }
            return
        }

        var nextLoadIsForced = forceRefresh
        repeat {
            isCurrentLoadForced = nextLoadIsForced
            needsFollowupRefresh = false
            isLoading = true
            await performPrimaryLoad()
            isLoading = false
            hasLoaded = true
            nextLoadIsForced = needsFollowupRefresh
        } while needsFollowupRefresh
        isCurrentLoadForced = false

        let waiters = loadWaiters
        loadWaiters.removeAll(keepingCapacity: true)
        waiters.forEach { $0.resume() }

        Task { [weak self] in
            await self?.refreshAuxiliaryData()
        }
    }

    private func performPrimaryLoad() async {
        loadGeneration += 1
        let generation = loadGeneration
        if !hasLoaded {
            hasCheckedActiveSession = false
        }
        errorMessage = nil

        async let sessionsRequest = client.fetchSessions()
        async let rankingsRequest = apiClient.fetchRankings()
        async let activeSessionRequest = apiClient.fetchActiveSessionID()
        var firstError: Error?
        var didRefreshSessions = false

        do {
            sessions = try await sessionsRequest
            didRefreshSessions = true
        } catch {
            firstError = error
        }
        guard generation == loadGeneration else { return }

        do {
            let rankings = try await rankingsRequest
            singlesRankings = rankings.singles
            doublesPlayerRankings = rankings.doublesPlayers
            doublesTeamRankings = rankings.doublesTeams
            rankingEligibility = rankings.eligibility

            let freshTopThree = Array(rankings.singles.prefix(3))
            if freshTopThree.count == 3 || topThreeSinglesPlayers.isEmpty {
                topThreeSinglesPlayers = freshTopThree
            }

            if let currentUser = rankings.singles.first(where: {
                $0.id == currentUserID
            }) {
                homeLatestSessionDelta = currentUser.recentForm.last
                homeLatestSessionFormScore =
                    currentUser.resolvedRecentFormScores.last
                homeCurrentUserFirstName = currentUser.name
                    .split(whereSeparator: \.isWhitespace)
                    .first
                    .map(String.init)
            }
        } catch {
            firstError = firstError ?? error
        }
        guard generation == loadGeneration else { return }

        do {
            let fetchedActiveSessionID = try await activeSessionRequest
            let listedActiveSessionID = didRefreshSessions
                ? sessions.first { $0.status == .active }?.id
                : nil
            if let confirmedSessionID = fetchedActiveSessionID
                ?? listedActiveSessionID {
                clubActiveSessionID = confirmedSessionID
                if locallyStartedSessionID == confirmedSessionID {
                    locallyStartedSessionID = nil
                }
            } else {
                locallyStartedSessionID = nil
                clubActiveSessionID = nil
            }
            hasCheckedActiveSession = true
        } catch {
            firstError = firstError ?? error
        }
        guard generation == loadGeneration else { return }

        errorMessage = firstError?.localizedDescription
        if firstError == nil {
            lastSuccessfulLoadAt = .now
        }
        saveHomeSnapshotIfPossible()
    }

    private func refreshAuxiliaryData() async {
        guard !isRefreshingAuxiliaryData else { return }
        isRefreshingAuxiliaryData = true
        defer { isRefreshingAuxiliaryData = false }

        async let sessionPlayersRequest =
            availableSessionPlayers(forceRefresh: true)
        async let widgetHistoryRequest =
            apiClient.fetchPlayerEloHistory(playerID: currentUserID)

        var widgetActiveSession = widgetSnapshotStore.load()?.activeSession
        if let activeSessionID = clubActiveSessionID,
           let activeSummary = sessions.first(where: {
               $0.id == activeSessionID
           }),
           let detail = try? await sessionDetail(for: activeSummary) {
            widgetActiveSession = makeWatchActiveSession(from: detail)
        } else if clubActiveSessionID == nil {
            widgetActiveSession = nil
        }

        do {
            let players = try await sessionPlayersRequest
            cachedAvailableSessionPlayers = players
            saveHomeSnapshotIfPossible()
        } catch {
            // Keep persisted players available while offline.
        }

        let widgetHistory: PlayerEloHistory?
        do {
            let history = try await widgetHistoryRequest
            playerHistoryCache.insert(history, for: currentUserID)
            widgetHistory = history
        } catch {
            widgetHistory = playerHistoryCache.cachedValue(for: currentUserID)
        }

        saveWidgetSnapshot(
            history: widgetHistory,
            activeSession: widgetActiveSession
        )
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
                savedAt: .now,
                sessions: sessions,
                singlesRankings: singlesRankings,
                doublesPlayerRankings: doublesPlayerRankings,
                doublesTeamRankings: doublesTeamRankings,
                rankingEligibility: rankingEligibility,
                availableSessionPlayers: hasLoadedAvailableSessionPlayers
                    ? cachedAvailableSessionPlayers
                    : nil,
                missionSnapshot: missionSnapshot,
                primaryLoadedAt: lastSuccessfulLoadAt,
                missionLoadedAt: lastMissionLoadAt
            ),
            for: currentUserID
        )
    }

    func syncWatchActiveSession(detail: SessionDetail) {
        guard detail.session.id == clubActiveSessionID else { return }

        guard let activeSession = makeWatchActiveSession(from: detail) else {
            return
        }
        syncWatchActiveSession(activeSession)
    }

    private func syncWatchActiveSession(
        _ activeSession: GweiloWatchActiveSession
    ) {

        let existing = widgetSnapshotStore.load()
        let snapshot = GweiloWidgetSnapshot(
            savedAt: .now,
            player: existing?.player,
            standings: existing?.standings ?? [],
            activeSessionID: activeSession.id,
            activeSession: activeSession
        )
        persistWidgetSnapshot(snapshot)
    }

    private func saveWidgetSnapshot(
        history: PlayerEloHistory?,
        activeSession: GweiloWatchActiveSession?
    ) {
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
                recentForm: entry.recentForm.suffix(7).map {
                    Int($0.rounded())
                },
                recentFormScores: Array(
                    entry.resolvedRecentFormScores.suffix(7)
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
                },
                recentElo: Array(
                    (history?.points ?? [])
                        .filter { $0.match > 0 }
                        .suffix(7)
                ).map { Int($0.elo.rounded()) },
                eloHistory: (history?.points ?? [])
                    .filter { $0.match > 0 }
                    .suffix(80)
                    .map {
                        GweiloWidgetEloPoint(
                            elo: Int($0.elo.rounded()),
                            delta: $0.delta.map { Int($0.rounded()) }
                        )
                    }
            )
        }

        let snapshot = GweiloWidgetSnapshot(
            savedAt: .now,
            player: currentPlayer,
            standings: standings,
            activeSessionID: clubActiveSessionID,
            activeSession: activeSession
        )
        persistWidgetSnapshot(snapshot)
    }

    private func persistWidgetSnapshot(_ snapshot: GweiloWidgetSnapshot) {
        if let existing = widgetSnapshotStore.load(),
           existing.hasSameContent(as: snapshot) {
            return
        }
        widgetSnapshotStore.save(snapshot)
        IPhoneWatchSyncService.shared.send(snapshot)
        WidgetCenter.shared.reloadTimelines(
            ofKind: GweiloWidgetSnapshot.widgetKind
        )
    }

    private func makeWatchActiveSession(
        from detail: SessionDetail
    ) -> GweiloWatchActiveSession? {
        guard detail.session.status == .active else { return nil }

        let pendingMatches = detail.rounds
            .flatMap(\.matches)
            .filter { !$0.isCompleted }
            .sorted {
                if $0.roundNumber != $1.roundNumber {
                    return $0.roundNumber < $1.roundNumber
                }
                return $0.order < $1.order
            }
        guard let firstPendingMatch = pendingMatches.first else { return nil }

        let currentRound = detail.session.currentRound
            ?? firstPendingMatch.roundNumber
        let nextRound = pendingMatches
            .map(\.roundNumber)
            .first { $0 > currentRound }
        let playingNow = pendingMatches.filter {
            $0.roundNumber == currentRound
        }
        let upNext = nextRound.map { round in
            pendingMatches.filter { $0.roundNumber == round }
        } ?? []

        return GweiloWatchActiveSession(
            id: detail.session.id,
            currentRound: currentRound,
            nextRound: nextRound,
            playingNow: playingNow.map {
                makeWatchMatchup(from: $0, detail: detail)
            },
            upNext: upNext.map {
                makeWatchMatchup(from: $0, detail: detail)
            }
        )
    }

    private func makeWatchActiveSession(
        sessionID: UUID,
        rounds: [SessionScheduleRound]
    ) -> GweiloWatchActiveSession? {
        let sortedRounds = rounds.sorted {
            $0.roundNumber < $1.roundNumber
        }
        guard let currentRound = sortedRounds.first else { return nil }
        let nextRound = sortedRounds.dropFirst().first

        func watchMatchups(
            in round: SessionScheduleRound
        ) -> [GweiloWatchMatchup] {
            round.matches.map { match in
                let sideSize = match.type == .doubles ? 2 : 1

                func players(
                    _ values: ArraySlice<SessionCreationPlayer>
                ) -> [GweiloWatchSessionPlayer] {
                    values.map { player in
                        GweiloWatchSessionPlayer(
                            id: player.id,
                            name: player.name,
                            avatarURL: player.avatarURL?.absoluteString
                        )
                    }
                }

                return GweiloWatchMatchup(
                    id: UUID(),
                    leftPlayers: players(match.players.prefix(sideSize)),
                    rightPlayers: players(
                        match.players.dropFirst(sideSize).prefix(sideSize)
                    )
                )
            }
        }

        return GweiloWatchActiveSession(
            id: sessionID,
            currentRound: currentRound.roundNumber,
            nextRound: nextRound?.roundNumber,
            playingNow: watchMatchups(in: currentRound),
            upNext: nextRound.map(watchMatchups(in:)) ?? []
        )
    }

    private func makeWatchMatchup(
        from match: SessionMatch,
        detail: SessionDetail
    ) -> GweiloWatchMatchup {
        let sideSize = match.type == .doubles ? 2 : 1
        let leftIDs = match.playerIDs.prefix(sideSize)
        let rightIDs = match.playerIDs.dropFirst(sideSize).prefix(sideSize)

        func watchPlayers(
            _ playerIDs: some Sequence<UUID>
        ) -> [GweiloWatchSessionPlayer] {
            playerIDs.map { playerID in
                let participant = detail.participant(for: playerID)
                return GweiloWatchSessionPlayer(
                    id: playerID,
                    name: participant?.name ?? "Unknown player",
                    avatarURL: participant?.avatarURL?.absoluteString
                )
            }
        }

        return GweiloWatchMatchup(
            id: match.id,
            leftPlayers: watchPlayers(leftIDs),
            rightPlayers: watchPlayers(rightIDs)
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
