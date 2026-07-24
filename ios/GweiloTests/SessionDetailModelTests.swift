import XCTest
@testable import Gweilo

final class SessionDetailModelTests: XCTestCase {
    private let ivanID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    private let garaID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
    private let leoID = UUID(uuidString: "00000000-0000-0000-0000-000000000003")!
    private let miladinID = UUID(uuidString: "00000000-0000-0000-0000-000000000004")!

    @MainActor
    func testSinglesNamesFollowStoredPlayerOrder() {
        let detail = makeDetail()

        let names = detail.teamNames(for: [garaID, ivanID])

        XCTAssertEqual(names.0, "Gara")
        XCTAssertEqual(names.1, "Ivan")
    }

    @MainActor
    func testDoublesNamesPreserveStoredTeamPairings() {
        let detail = makeDetail()

        let names = detail.teamNames(
            for: [ivanID, garaID, leoID, miladinID]
        )

        XCTAssertEqual(names.0, "Ivan + Gara")
        XCTAssertEqual(names.1, "Leo + Miladin")
    }

    @MainActor
    func testRoundDraftRequiresEveryScoreIncludingExplicitZero() {
        let matches = makeMatches()
        var draft = RoundScoreDraft(matches: matches)

        XCTAssertFalse(draft.isComplete)

        draft.setScore(11, for: matches[0].id, team: 1)
        draft.setScore(8, for: matches[0].id, team: 2)
        draft.setScore(11, for: matches[1].id, team: 1)
        draft.setScore(0, for: matches[1].id, team: 2)

        XCTAssertTrue(draft.isComplete)
        XCTAssertEqual(
            draft.submissions(for: matches)?.last?.team2Score,
            0
        )
    }

    @MainActor
    func testRoundDraftKeepsBackendPayloadInMatchOrder() {
        let matches = makeMatches()
        var draft = RoundScoreDraft(matches: Array(matches.reversed()))

        draft.setScore(9, for: matches[0].id, team: 1)
        draft.setScore(11, for: matches[0].id, team: 2)
        draft.setScore(12, for: matches[1].id, team: 1)
        draft.setScore(10, for: matches[1].id, team: 2)

        let submissions = draft.submissions(for: matches)

        XCTAssertEqual(submissions?.map(\.matchId), matches.map(\.id))
        XCTAssertEqual(submissions?.first?.team1Score, 9)
        XCTAssertEqual(submissions?.last?.team2Score, 10)
    }

    @MainActor
    func testRoundDraftClampsScoresToBackendSafeRange() {
        let match = makeMatches()[0]
        var draft = RoundScoreDraft(matches: [match])

        draft.setScore(-4, for: match.id, team: 1)
        draft.setScore(1_400, for: match.id, team: 2)

        XCTAssertEqual(draft.score(for: match.id, team: 1), 0)
        XCTAssertEqual(draft.score(for: match.id, team: 2), 999)
    }

    @MainActor
    func testAuthSessionRefreshLeeway() {
        let session = AuthSession(
            accessToken: "access",
            refreshToken: "refresh",
            expiresIn: 3_600,
            expiresAt: 10_000,
            user: AuthenticatedUser(id: UUID(), email: "member@example.com")
        )

        XCTAssertFalse(
            session.needsRefresh(
                at: Date(timeIntervalSince1970: 9_800),
                leeway: 90
            )
        )
        XCTAssertTrue(
            session.needsRefresh(
                at: Date(timeIntervalSince1970: 9_920),
                leeway: 90
            )
        )
    }

    @MainActor
    func testRoundSubmissionRequestCarriesWholeRoundToProductionAPI() throws {
        let sessionID = UUID()
        let matches = makeMatches()
        let submissions = [
            RoundMatchScoreSubmission(
                matchId: matches[0].id,
                team1Score: 11,
                team2Score: 7
            ),
            RoundMatchScoreSubmission(
                matchId: matches[1].id,
                team1Score: 9,
                team2Score: 11
            )
        ]
        let configuration = AppConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            supabaseAnonKey: "public-anon-key",
            apiBaseURL: URL(string: "https://www.gweilo.lol")!
        )
        let client = GweiloAPIClient(
            configuration: configuration,
            accessToken: "member-access-token"
        )

        let request = try client.makeSubmitRoundRequest(
            sessionID: sessionID,
            roundNumber: 4,
            scores: submissions
        )
        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )
        let scores = try XCTUnwrap(json["matchScores"] as? [[String: Any]])

        XCTAssertEqual(
            request.url?.absoluteString,
            "https://www.gweilo.lol/api/sessions/\(sessionID.uuidString)/rounds/4/submit"
        )
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
        XCTAssertEqual(scores.count, 2)
        XCTAssertEqual(scores[0]["matchId"] as? String, matches[0].id.uuidString)
        XCTAssertEqual(scores[1]["team2Score"] as? Int, 11)
    }

    @MainActor
    func testPlayerHistoryRequestUsesAuthenticatedProductionRoute() throws {
        let playerID = UUID()
        let configuration = AppConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            supabaseAnonKey: "public-anon-key",
            apiBaseURL: URL(string: "https://www.gweilo.lol")!
        )
        let client = GweiloAPIClient(
            configuration: configuration,
            accessToken: "member-access-token"
        )

        let request = try client.makePlayerEloHistoryRequest(playerID: playerID)
        let components = try XCTUnwrap(
            URLComponents(url: XCTUnwrap(request.url), resolvingAgainstBaseURL: false)
        )

        XCTAssertEqual(components.path, "/api/player/elo-history")
        XCTAssertEqual(
            components.queryItems?.first(where: { $0.name == "playerId" })?.value,
            playerID.uuidString
        )
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
    }

    @MainActor
    func testHeadToHeadRequestUsesBothPlayerIDs() throws {
        let playerID = UUID()
        let opponentID = UUID()
        let client = makeAPIClient()

        let request = try client.makeHeadToHeadRequest(
            playerID: playerID,
            opponentID: opponentID
        )
        let components = try XCTUnwrap(
            URLComponents(url: XCTUnwrap(request.url), resolvingAgainstBaseURL: false)
        )

        XCTAssertEqual(
            components.path,
            "/api/player/\(playerID.uuidString)/head-to-head"
        )
        XCTAssertEqual(
            components.queryItems?.first(where: { $0.name == "opponentId" })?.value,
            opponentID.uuidString
        )
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
    }

    @MainActor
    func testDoublesTeamRequestsUseAuthenticatedProductionRoutes() {
        let teamID = UUID()
        let client = makeAPIClient()

        let profileRequest = client.makeDoublesTeamProfileRequest(teamID: teamID)
        let historyRequest = client.makeDoublesTeamEloHistoryRequest(teamID: teamID)

        XCTAssertEqual(
            profileRequest.url?.path,
            "/api/team/\(teamID.uuidString)"
        )
        XCTAssertEqual(
            historyRequest.url?.path,
            "/api/team/\(teamID.uuidString)/elo-history"
        )
        XCTAssertEqual(
            profileRequest.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
        XCTAssertEqual(
            historyRequest.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
    }

    @MainActor
    func testSessionDraftKeepsSelectionOrderAndPlayerLimit() {
        var draft = SessionCreationDraft()
        draft.setPlayerCount(2)
        let players = [
            SessionCreationPlayer(
                id: ivanID,
                name: "Ivan",
                avatarURL: nil,
                elo: 1_700
            ),
            SessionCreationPlayer(
                id: garaID,
                name: "Gara",
                avatarURL: nil,
                elo: 1_600
            ),
            SessionCreationPlayer(
                id: leoID,
                name: "Leo",
                avatarURL: nil,
                elo: 1_500
            )
        ]

        players.forEach { draft.toggle($0) }

        XCTAssertEqual(draft.selectedPlayers.map(\.id), [ivanID, garaID])
        XCTAssertTrue(draft.canPreview)
        XCTAssertEqual(draft.selectionNumber(for: garaID), 2)

        draft.toggle(players[0])

        XCTAssertEqual(draft.selectedPlayers.map(\.id), [garaID])
        XCTAssertFalse(draft.canPreview)
    }

    @MainActor
    func testCreateSessionRequestSendsIntentWithoutClientSchedule() throws {
        var draft = SessionCreationDraft()
        draft.setPlayerCount(2)
        draft.scheduledAt = Date(timeIntervalSince1970: 1_800_000_000)
        draft.toggle(
            SessionCreationPlayer(
                id: ivanID,
                name: "Ivan",
                avatarURL: URL(string: "https://example.com/ivan.jpg"),
                elo: 1_700
            )
        )
        draft.toggle(
            SessionCreationPlayer(
                id: garaID,
                name: "Gara",
                avatarURL: nil,
                elo: 1_600
            )
        )

        let request = try makeAPIClient().makeCreateSessionRequest(from: draft)
        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )
        let players = try XCTUnwrap(json["players"] as? [[String: Any]])

        XCTAssertEqual(request.url?.path, "/api/sessions")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(json["fourPlayerFormat"] as? String, "mixed")
        XCTAssertNil(json["rounds"])
        XCTAssertEqual(players.map { $0["id"] as? String }, [
            ivanID.uuidString,
            garaID.uuidString
        ])
    }

    @MainActor
    func testSessionPlayerListExcludesGuests() {
        let request = makeAPIClient().makeAvailableSessionPlayersRequest()
        let components = URLComponents(
            url: request.url!,
            resolvingAgainstBaseURL: false
        )

        XCTAssertEqual(components?.path, "/api/admin/users")
        XCTAssertEqual(
            components?.queryItems?.first {
                $0.name == "excludeGuests"
            }?.value,
            "true"
        )
    }

    private func makeMatches() -> [SessionMatch] {
        [
            SessionMatch(
                id: UUID(),
                roundNumber: 4,
                type: .doubles,
                order: 1,
                playerIDs: [ivanID, garaID, leoID, miladinID],
                isCompleted: false,
                teamOneScore: nil,
                teamTwoScore: nil
            ),
            SessionMatch(
                id: UUID(),
                roundNumber: 4,
                type: .singles,
                order: 2,
                playerIDs: [ivanID, leoID],
                isCompleted: false,
                teamOneScore: nil,
                teamTwoScore: nil
            )
        ]
    }

    private func makeAPIClient() -> GweiloAPIClient {
        GweiloAPIClient(
            configuration: AppConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co")!,
                supabaseAnonKey: "public-anon-key",
                apiBaseURL: URL(string: "https://www.gweilo.lol")!
            ),
            accessToken: "member-access-token"
        )
    }

    private func makeDetail() -> SessionDetail {
        SessionDetail(
            session: SessionSummary(
                id: UUID(),
                createdAt: .now,
                playerCount: 4,
                status: .completed,
                currentRound: nil,
                totalRounds: 1,
                singlesMatches: 0,
                doublesMatches: 1,
                bestPlayer: nil,
                bestDelta: nil,
                worstPlayer: nil,
                worstDelta: nil
            ),
            participants: [
                SessionParticipant(id: ivanID, name: "Ivan", avatarURL: nil, team: nil),
                SessionParticipant(id: garaID, name: "Gara", avatarURL: nil, team: nil),
                SessionParticipant(id: leoID, name: "Leo", avatarURL: nil, team: nil),
                SessionParticipant(id: miladinID, name: "Miladin", avatarURL: nil, team: nil)
            ],
            rounds: []
        )
    }
}
