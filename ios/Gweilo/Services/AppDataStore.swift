import Foundation
import Observation

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
    private(set) var clubActiveSessionID: UUID?
    private(set) var hasCheckedActiveSession = false
    private(set) var canManageSessions: Bool
    private(set) var isAdmin: Bool
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?

    private var client: SupabaseDataClient
    private var apiClient: GweiloAPIClient
    private let configuration: AppConfiguration
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
    let currentUserID: UUID

    init(configuration: AppConfiguration, session: AuthSession) {
        self.configuration = configuration
        currentUserID = session.user.id
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
    }

    func updateSession(_ session: AuthSession) {
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
    }

    var activeSession: SessionSummary? {
        sessions.first { $0.status == .active }
    }

    var canStartNewSession: Bool {
        canManageSessions && hasCheckedActiveSession && clubActiveSessionID == nil
    }

    var latestCompletedSession: SessionSummary? {
        sessions.first { $0.status == .completed }
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
        let result = try await apiClient.submitRound(
            sessionID: sessionID,
            roundNumber: roundNumber,
            scores: scores
        )
        invalidateProfileCaches()
        await load()
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

    func availableSessionPlayers() async throws -> [SessionCreationPlayer] {
        let players = try await apiClient.fetchAvailableSessionPlayers()
        let eloByPlayerID = Dictionary(
            uniqueKeysWithValues: singlesRankings.map { ($0.id, $0.elo) }
        )
        return players
            .map {
                SessionCreationPlayer(
                    id: $0.id,
                    name: $0.name,
                    avatarURL: $0.avatarURL,
                    elo: eloByPlayerID[$0.id]
                )
            }
            .sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
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
        await load()
        return sessions.first { $0.id == result.sessionId }
            ?? result.makeSummary(for: draft)
    }

    func cancelSession(sessionID: UUID) async throws {
        try await apiClient.cancelSession(sessionID: sessionID)
        clubActiveSessionID = nil
        invalidateProfileCaches()
        await load()
    }

    func forceCloseSession(sessionID: UUID) async throws {
        try await apiClient.forceCloseSession(sessionID: sessionID)
        clubActiveSessionID = nil
        invalidateProfileCaches()
        await load()
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        hasCheckedActiveSession = false
        errorMessage = nil
        defer {
            isLoading = false
            hasLoaded = true
        }

        do {
            async let sessionsRequest = client.fetchSessions()
            async let rankingsRequest = apiClient.fetchRankings()
            async let activeSessionRequest = apiClient.fetchActiveSessionID()

            let (loadedSessions, rankings, activeSessionID) = try await (
                sessionsRequest,
                rankingsRequest,
                activeSessionRequest
            )
            sessions = loadedSessions
            singlesRankings = rankings.singles
            doublesPlayerRankings = rankings.doublesPlayers
            doublesTeamRankings = rankings.doublesTeams
            rankingEligibility = rankings.eligibility
            topThreeSinglesPlayers = Array(rankings.singles.prefix(3))
            clubActiveSessionID = activeSessionID
            hasCheckedActiveSession = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func invalidateProfileCaches() {
        playerHistoryCache.removeAll()
        headToHeadCache.removeAll()
        doublesProfileCache.removeAll()
        doublesHistoryCache.removeAll()
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
        hasLoaded = true
    }
}
#endif
