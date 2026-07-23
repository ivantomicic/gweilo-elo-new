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

    init(configuration: AppConfiguration, session: AuthSession) {
        self.configuration = configuration
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
