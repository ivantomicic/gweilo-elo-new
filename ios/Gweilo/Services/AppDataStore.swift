import Foundation
import Observation

@Observable
@MainActor
final class AppDataStore {
    private(set) var sessions: [SessionSummary] = []
    private(set) var singlesRankings: [RankingEntry] = []
    private(set) var doublesPlayerRankings: [RankingEntry] = []
    private(set) var doublesTeamRankings: [RankingEntry] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?

    private var client: SupabaseDataClient
    private var apiClient: GweiloAPIClient
    private let configuration: AppConfiguration
    let currentUserID: UUID

    init(configuration: AppConfiguration, session: AuthSession) {
        self.configuration = configuration
        currentUserID = session.user.id
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
        await load()
        return result
    }

    func playerEloHistory(for playerID: UUID) async throws -> PlayerEloHistory {
        try await apiClient.fetchPlayerEloHistory(playerID: playerID)
    }

    func headToHead(for playerID: UUID) async throws -> PlayerHeadToHead {
        try await apiClient.fetchHeadToHead(
            playerID: playerID,
            opponentID: currentUserID
        )
    }

    func doublesTeamProfile(for teamID: UUID) async throws -> DoublesTeamProfile {
        try await apiClient.fetchDoublesTeamProfile(teamID: teamID)
    }

    func doublesTeamEloHistory(for teamID: UUID) async throws -> PlayerEloHistory {
        try await apiClient.fetchDoublesTeamEloHistory(teamID: teamID)
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
        from draft: SessionCreationDraft
    ) async throws -> SessionSummary {
        let result = try await apiClient.createSession(from: draft)
        await load()
        return sessions.first { $0.id == result.sessionId }
            ?? result.makeSummary(for: draft)
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer {
            isLoading = false
            hasLoaded = true
        }

        do {
            let snapshot = try await client.fetchSnapshot()
            sessions = snapshot.sessions
            singlesRankings = snapshot.singles
            doublesPlayerRankings = snapshot.doublesPlayers
            doublesTeamRankings = snapshot.doublesTeams
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
