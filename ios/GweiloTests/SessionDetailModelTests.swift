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
    func testHalfSessionResultsCollapsePairsAndAlignReversedPlayers() throws {
        let fixture = makeHalfSessionRounds()

        let matches = try XCTUnwrap(
            SessionHalfResultGrouper.groupedMatches(
                playerCount: 4,
                rounds: fixture.rounds
            )
        )

        XCTAssertEqual(matches.count, 6)
        XCTAssertEqual(Set(matches.map(\.id)), Set(fixture.secondHalfIDs))

        let reversedMatch = try XCTUnwrap(
            matches.first { $0.id == fixture.secondHalfIDs[0] }
        )
        XCTAssertEqual(reversedMatch.playerIDs, [garaID, ivanID])
        XCTAssertEqual(reversedMatch.teamOneScore, 3)
        XCTAssertEqual(reversedMatch.teamTwoScore, 6)
    }

    @MainActor
    func testHalfSessionResultsKeepUnsettledPairAsSeparateMatches() throws {
        let fixture = makeHalfSessionRounds(firstSettlementCompleted: false)

        let matches = try XCTUnwrap(
            SessionHalfResultGrouper.groupedMatches(
                playerCount: 4,
                rounds: fixture.rounds
            )
        )

        XCTAssertEqual(matches.count, 7)
        XCTAssertTrue(matches.contains { $0.id == fixture.firstHalfIDs[0] })
        XCTAssertTrue(matches.contains { $0.id == fixture.secondHalfIDs[0] })
    }

    @MainActor
    func testHalfSessionResultsRequireTheMirroredAllSinglesShape() {
        let fixture = makeHalfSessionRounds()
        var malformedRounds = fixture.rounds
        malformedRounds.removeLast()

        XCTAssertNil(
            SessionHalfResultGrouper.groupedMatches(
                playerCount: 4,
                rounds: malformedRounds
            )
        )
    }

    @MainActor
    func testPlayerMatchFilterKeepsSelectedSinglesPlayerFirst() throws {
        let matchID = UUID()
        let match = SessionMatch(
            id: matchID,
            roundNumber: 2,
            type: .singles,
            order: 0,
            playerIDs: [ivanID, garaID],
            isCompleted: true,
            teamOneScore: 11,
            teamTwoScore: 7,
            eloPrediction: MatchEloPrediction(
                matchId: matchID,
                ratingType: "singles",
                team1: EloSidePrediction(
                    rating: 1_550,
                    win: 8,
                    draw: -4,
                    loss: -16
                ),
                team2: EloSidePrediction(
                    rating: 1_480,
                    win: 16,
                    draw: 4,
                    loss: -8
                )
            )
        )

        let filtered = SessionPlayerMatchFilter.matches(
            for: garaID,
            in: [match]
        )
        XCTAssertEqual(filtered.count, 1)
        let result = try XCTUnwrap(filtered.first)

        XCTAssertEqual(result.playerIDs, [garaID, ivanID])
        XCTAssertEqual(result.teamOneScore, 7)
        XCTAssertEqual(result.teamTwoScore, 11)
        XCTAssertEqual(result.eloPrediction?.team1.rating, 1_480)
        XCTAssertEqual(result.eloPrediction?.team2.rating, 1_550)
    }

    @MainActor
    func testPlayerMatchFilterMovesSelectedDoublesTeamAndPlayerFirst() throws {
        let match = SessionMatch(
            id: UUID(),
            roundNumber: 3,
            type: .doubles,
            order: 1,
            playerIDs: [ivanID, garaID, leoID, miladinID],
            isCompleted: true,
            teamOneScore: 2,
            teamTwoScore: 3
        )

        let filtered = SessionPlayerMatchFilter.matches(
            for: miladinID,
            in: [match]
        )
        XCTAssertEqual(filtered.count, 1)
        let result = try XCTUnwrap(filtered.first)

        XCTAssertEqual(
            result.playerIDs,
            [miladinID, leoID, ivanID, garaID]
        )
        XCTAssertEqual(result.teamOneScore, 3)
        XCTAssertEqual(result.teamTwoScore, 2)

        let profileResult = makeDetail().playerProfileResult(
            for: result,
            selectedPlayerID: miladinID,
            eloAfter: 1_542,
            eloDelta: 12
        )
        XCTAssertEqual(profileResult.opponent, "Ivan + Gara")
        XCTAssertEqual(profileResult.scoreFor, 3)
        XCTAssertEqual(profileResult.scoreAgainst, 2)
        XCTAssertEqual(profileResult.outcome, .win)
        XCTAssertEqual(profileResult.elo, 1_542)
        XCTAssertEqual(profileResult.delta, 12)
    }

    @MainActor
    func testPlayerMatchFilterPreservesHalfSessionGrouping() throws {
        let fixture = makeHalfSessionRounds()
        let displayedMatches = SessionCompletedMatchPresenter.matches(
            playerCount: 4,
            rounds: fixture.rounds
        )

        let filtered = SessionPlayerMatchFilter.matches(
            for: ivanID,
            in: displayedMatches
        )

        XCTAssertEqual(displayedMatches.count, 6)
        XCTAssertEqual(filtered.count, 3)
        XCTAssertTrue(filtered.allSatisfy { $0.playerIDs.first == ivanID })
        XCTAssertTrue(
            filtered.allSatisfy {
                fixture.secondHalfIDs.contains($0.id)
            }
        )
    }

    @MainActor
    func testPlayerProfileResultsUseCommittedEloSnapshotsPerRatingType() throws {
        let singlesOneID = UUID()
        let doublesID = UUID()
        let singlesTwoID = UUID()
        let rounds = [
            SessionRound(
                number: 1,
                matches: [
                    SessionMatch(
                        id: singlesOneID,
                        roundNumber: 1,
                        type: .singles,
                        order: 0,
                        playerIDs: [ivanID, garaID],
                        isCompleted: true,
                        teamOneScore: 11,
                        teamTwoScore: 8
                    ),
                    SessionMatch(
                        id: doublesID,
                        roundNumber: 1,
                        type: .doubles,
                        order: 1,
                        playerIDs: [ivanID, garaID, leoID, miladinID],
                        isCompleted: true,
                        teamOneScore: 2,
                        teamTwoScore: 3
                    )
                ],
                restingPlayers: []
            ),
            SessionRound(
                number: 2,
                matches: [
                    SessionMatch(
                        id: singlesTwoID,
                        roundNumber: 2,
                        type: .singles,
                        order: 0,
                        playerIDs: [garaID, ivanID],
                        isCompleted: true,
                        teamOneScore: 11,
                        teamTwoScore: 7
                    )
                ],
                restingPlayers: []
            )
        ]
        let detail = makeDetail(
            singlesPerformance: [
                makePerformance(
                    playerID: ivanID,
                    eloBefore: 1_500,
                    eloAfter: 1_507
                )
            ],
            doublesPerformance: [
                makePerformance(
                    playerID: ivanID,
                    eloBefore: 1_600,
                    eloAfter: 1_592
                )
            ],
            rounds: rounds,
            snapshots: [
                SessionPlayerEloSnapshot(
                    matchID: singlesOneID,
                    playerID: ivanID,
                    elo: 1_512
                ),
                SessionPlayerEloSnapshot(
                    matchID: doublesID,
                    playerID: ivanID,
                    elo: 1_592
                ),
                SessionPlayerEloSnapshot(
                    matchID: singlesTwoID,
                    playerID: ivanID,
                    elo: 1_507
                )
            ]
        )

        let results = detail.playerProfileResults(
            for: rounds.flatMap(\.matches),
            selectedPlayerID: ivanID
        )

        XCTAssertEqual(try XCTUnwrap(results[singlesOneID]).delta, 12)
        XCTAssertEqual(try XCTUnwrap(results[doublesID]).delta, -8)
        XCTAssertEqual(try XCTUnwrap(results[singlesTwoID]).delta, -5)
        XCTAssertEqual(try XCTUnwrap(results[singlesTwoID]).elo, 1_507)
    }

    @MainActor
    func testGroupedHalfResultUsesSettlementMatchCommittedDelta() throws {
        let fixture = makeHalfSessionRounds()
        let displayedMatches = SessionCompletedMatchPresenter.matches(
            playerCount: 4,
            rounds: fixture.rounds
        )
        let settlement = try XCTUnwrap(
            displayedMatches.first { $0.id == fixture.secondHalfIDs[0] }
        )
        let detail = makeDetail(
            singlesPerformance: [
                makePerformance(
                    playerID: ivanID,
                    eloBefore: 1_500,
                    eloAfter: 1_514
                )
            ],
            rounds: fixture.rounds,
            snapshots: [
                SessionPlayerEloSnapshot(
                    matchID: settlement.id,
                    playerID: ivanID,
                    elo: 1_514
                )
            ]
        )

        let result = try XCTUnwrap(
            detail.playerProfileResults(
                for: [settlement],
                selectedPlayerID: ivanID
            )[settlement.id]
        )

        XCTAssertEqual(result.delta, 14)
        XCTAssertEqual(result.elo, 1_514)
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
    func testEloPerformanceBandUsesFivePointThreshold() {
        XCTAssertEqual(EloPerformanceBand(delta: 5.01), .gain)
        XCTAssertEqual(EloPerformanceBand(delta: 5), .steady)
        XCTAssertEqual(EloPerformanceBand(delta: 0), .steady)
        XCTAssertEqual(EloPerformanceBand(delta: -5), .steady)
        XCTAssertEqual(EloPerformanceBand(delta: -5.01), .loss)
        XCTAssertEqual(EloPerformanceBand(delta: nil), .steady)
    }

    func testCalculatorUsesTheSameDynamicKFactorThresholdsAsTheWebApp() {
        XCTAssertEqual(EloCalculator.kFactor(matchesPlayed: 0), 40)
        XCTAssertEqual(EloCalculator.kFactor(matchesPlayed: 9), 40)
        XCTAssertEqual(EloCalculator.kFactor(matchesPlayed: 10), 32)
        XCTAssertEqual(EloCalculator.kFactor(matchesPlayed: 39), 32)
        XCTAssertEqual(EloCalculator.kFactor(matchesPlayed: 40), 24)
    }

    func testCalculatorProducesExpectedEqualRatingOutcomes() {
        XCTAssertEqual(
            EloCalculator.delta(
                playerElo: 1_500,
                opponentElo: 1_500,
                result: .win,
                matchesPlayed: 0
            ),
            20,
            accuracy: 0.000_001
        )
        XCTAssertEqual(
            EloCalculator.delta(
                playerElo: 1_500,
                opponentElo: 1_500,
                result: .draw,
                matchesPlayed: 10
            ),
            0,
            accuracy: 0.000_001
        )
        XCTAssertEqual(
            EloCalculator.delta(
                playerElo: 1_500,
                opponentElo: 1_500,
                result: .loss,
                matchesPlayed: 40
            ),
            -12,
            accuracy: 0.000_001
        )
    }

    func testCalculatorPreservesDecimalPrecision() {
        let delta = EloCalculator.delta(
            playerElo: 1_717.51,
            opponentElo: 1_626.17,
            result: .win,
            matchesPlayed: 219
        )

        XCTAssertEqual(delta, 8.915_954_374, accuracy: 0.000_001)
    }

    @MainActor
    func testExpiringCacheReturnsStaleValueOnlyAsCachedContent() {
        let playerID = UUID()
        let storedAt = Date(timeIntervalSince1970: 1_000)
        let staleDate = storedAt.addingTimeInterval(301)
        var cache = ExpiringCache<UUID, String>(lifetime: 300)

        cache.insert("history", for: playerID, at: storedAt)

        XCTAssertEqual(
            cache.freshValue(
                for: playerID,
                at: storedAt.addingTimeInterval(299)
            ),
            "history"
        )
        XCTAssertNil(cache.freshValue(for: playerID, at: staleDate))
        XCTAssertEqual(cache.cachedValue(for: playerID), "history")
    }

    @MainActor
    func testHistoryPointResolvesOutcomeFromScoreWhenResultFieldIsMissing() {
        let point = PlayerEloHistoryPoint(
            match: 1,
            elo: 1_510,
            date: .now,
            opponent: "Gara",
            delta: 10,
            scoreFor: 3,
            scoreAgainst: 1
        )

        XCTAssertEqual(point.resolvedOutcome, .win)
        XCTAssertEqual(point.formattedScore, "3–1")
    }

    @MainActor
    func testEloChartViewportClampsZoomAndKeepsFocusVisible() {
        let viewport = EloChartViewport(
            points: makeEloHistoryPoints(matches: 1...20)
        )

        XCTAssertEqual(viewport.totalSpan, 19)
        XCTAssertEqual(viewport.visibleSpan(from: 19, magnification: 10), 4)
        XCTAssertEqual(viewport.visibleSpan(from: 8, magnification: 1), 8)
        XCTAssertEqual(viewport.visibleSpan(from: 8, magnification: 0.1), 19)
        XCTAssertEqual(
            viewport.leadingPosition(centeredOn: 10, visibleSpan: 4),
            8
        )
        XCTAssertEqual(
            viewport.leadingPosition(centeredOn: 1, visibleSpan: 4),
            1
        )
        XCTAssertEqual(
            viewport.leadingPosition(centeredOn: 20, visibleSpan: 4),
            16
        )
    }

    @MainActor
    func testEloCurveIsSmoothWithoutOvershootingMatchRatings() throws {
        let points = [
            PlayerEloHistoryPoint(
                match: 1,
                elo: 1_500,
                date: .now,
                opponent: "Gara",
                delta: nil
            ),
            PlayerEloHistoryPoint(
                match: 2,
                elo: 1_520,
                date: .now,
                opponent: "Leo",
                delta: 20
            ),
            PlayerEloHistoryPoint(
                match: 3,
                elo: 1_510,
                date: .now,
                opponent: "Miladin",
                delta: -10
            )
        ]

        let segments = EloCurveSampler.segments(
            points: points,
            samplesPerSegment: 4
        )
        let first = try XCTUnwrap(segments.first)
        let second = try XCTUnwrap(segments.last)

        XCTAssertEqual(segments.count, 2)
        XCTAssertEqual(first.samples.count, 5)
        XCTAssertEqual(first.samples.first?.elo, 1_500)
        XCTAssertEqual(first.samples.last?.elo, 1_520)
        XCTAssertGreaterThan(first.samples[2].elo, 1_510)
        XCTAssertTrue(first.samples.allSatisfy { (1_500...1_520).contains($0.elo) })
        XCTAssertTrue(second.samples.allSatisfy { (1_510...1_520).contains($0.elo) })
        XCTAssertEqual(first.performanceBand, .gain)
        XCTAssertEqual(second.performanceBand, .loss)
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
    func testSessionManagementRoleComesFromSupabaseAppMetadata() throws {
        let moderatorJSON = """
        {
          "id": "00000000-0000-4000-8000-000000000001",
          "email": "mod@example.com",
          "app_metadata": { "role": "mod", "roles": ["mod"] }
        }
        """
        let memberJSON = """
        {
          "id": "00000000-0000-4000-8000-000000000002",
          "email": "member@example.com",
          "app_metadata": { "role": "user" }
        }
        """

        let moderator = try JSONDecoder().decode(
            AuthenticatedUser.self,
            from: Data(moderatorJSON.utf8)
        )
        let member = try JSONDecoder().decode(
            AuthenticatedUser.self,
            from: Data(memberJSON.utf8)
        )

        XCTAssertTrue(moderator.canManageSessions)
        XCTAssertFalse(moderator.isAdmin)
        XCTAssertFalse(member.canManageSessions)
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
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "X-Gweilo-Client"),
            "ios"
        )
        XCTAssertEqual(scores.count, 2)
        XCTAssertEqual(
            scores[0]["matchId"] as? String,
            matches[0].id.uuidString.lowercased()
        )
        XCTAssertEqual(scores[1]["team2Score"] as? Int, 11)
    }

    @MainActor
    func testRoundSubmissionSurfacesDetailedServerFailure() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RoundSubmissionErrorURLProtocol.self]
        let client = GweiloAPIClient(
            configuration: AppConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co")!,
                supabaseAnonKey: "public-anon-key",
                apiBaseURL: URL(string: "https://www.gweilo.lol")!
            ),
            accessToken: "member-access-token",
            session: URLSession(configuration: configuration)
        )

        do {
            _ = try await client.submitRound(
                sessionID: UUID(),
                roundNumber: 1,
                scores: [
                    RoundMatchScoreSubmission(
                        matchId: UUID(),
                        team1Score: 11,
                        team2Score: 7
                    )
                ]
            )
            XCTFail("Expected the server failure to be surfaced.")
        } catch let BackendAPIError.rejected(message) {
            XCTAssertEqual(
                message,
                "Atomic ELO commit failed: ROUND_STATE_CONFLICT"
            )
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    @MainActor
    func testRoundSubmissionIdentifiesDeletedSession() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RoundSubmissionErrorURLProtocol.self]
        let client = GweiloAPIClient(
            configuration: AppConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co")!,
                supabaseAnonKey: "public-anon-key",
                apiBaseURL: URL(string: "https://www.gweilo.lol")!
            ),
            accessToken: "member-access-token",
            session: URLSession(configuration: configuration)
        )

        do {
            _ = try await client.submitRound(
                sessionID: UUID(),
                roundNumber: 2,
                scores: [
                    RoundMatchScoreSubmission(
                        matchId: UUID(),
                        team1Score: 11,
                        team2Score: 7
                    )
                ]
            )
            XCTFail("Expected the missing session to be surfaced.")
        } catch let error as BackendAPIError {
            XCTAssertTrue(error.isSessionNotFound)
            XCTAssertEqual(error.localizedDescription, "Session not found")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    @MainActor
    private func makeEloHistoryPoints(
        matches: ClosedRange<Int>
    ) -> [PlayerEloHistoryPoint] {
        matches.map { match in
            PlayerEloHistoryPoint(
                match: match,
                elo: 1_500 + Double(match),
                date: .now,
                opponent: "Opponent \(match)",
                delta: 1
            )
        }
    }

    @MainActor
    func testPlayerHistoryRequestUsesAuthenticatedProductionRoute() throws {
        let playerID = UUID(
            uuidString: "ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB"
        )!
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
            playerID.uuidString.lowercased()
        )
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
    }

    @MainActor
    func testTopThreeRequestUsesAuthenticatedServerEligibilityRoute() {
        let request = makeAPIClient().makeTopThreeSinglesRequest()

        XCTAssertEqual(request.url?.path, "/api/statistics/top3")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
    }

    @MainActor
    func testStatisticsResponseDrivesEligibilityAndRecentForm() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StatisticsResponseURLProtocol.self]
        let client = GweiloAPIClient(
            configuration: AppConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co")!,
                supabaseAnonKey: "public-anon-key",
                apiBaseURL: URL(string: "https://www.gweilo.lol")!
            ),
            accessToken: "member-access-token",
            session: URLSession(configuration: configuration)
        )

        let rankings = try await client.fetchRankings()

        XCTAssertEqual(rankings.singles.map(\.name), ["Ivan"])
        XCTAssertEqual(rankings.singles.first?.recentForm, [8, -7, 3])
        XCTAssertEqual(rankings.doublesTeams.first?.name, "Ivan + Gara")
        XCTAssertEqual(rankings.eligibility.singles.minimumMatches, 15)
        XCTAssertEqual(rankings.eligibility.singles.maximumInactivityDays, 28)
        XCTAssertEqual(rankings.eligibility.doublesTeams.minimumMatches, 6)
    }

    @MainActor
    func testStatisticsRequestUsesAuthenticatedSharedRankingRoute() {
        let request = makeAPIClient().makeStatisticsRequest()

        XCTAssertEqual(request.url?.path, "/api/statistics")
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
    }

    @MainActor
    func testHeadToHeadRequestUsesBothPlayerIDs() throws {
        let playerID = UUID(
            uuidString: "ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB"
        )!
        let opponentID = UUID(
            uuidString: "FEDCBAFE-DCBA-FEDC-BAFE-DCBAFEDCBAFE"
        )!
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
            "/api/player/\(playerID.uuidString.lowercased())/head-to-head"
        )
        XCTAssertEqual(
            components.queryItems?.first(where: { $0.name == "opponentId" })?.value,
            opponentID.uuidString.lowercased()
        )
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer member-access-token"
        )
    }

    @MainActor
    func testHeadToHeadResponseDecodesProductionFieldNames() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HeadToHeadResponseURLProtocol.self]
        let client = GweiloAPIClient(
            configuration: AppConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co")!,
                supabaseAnonKey: "public-anon-key",
                apiBaseURL: URL(string: "https://www.gweilo.lol")!
            ),
            accessToken: "member-access-token",
            session: URLSession(configuration: configuration)
        )

        let result = try await client.fetchHeadToHead(
            playerID: ivanID,
            opponentID: garaID
        )

        XCTAssertEqual(result.player.name, "Ivan")
        XCTAssertEqual(result.player.wins, 18)
        XCTAssertEqual(result.player.setsWon, 67)
        XCTAssertEqual(result.opponent.losses, 18)
        XCTAssertEqual(result.totalMatches, 30)
    }

    @MainActor
    func testDoublesTeamRequestsUseAuthenticatedProductionRoutes() {
        let teamID = UUID(
            uuidString: "ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB"
        )!
        let client = makeAPIClient()

        let profileRequest = client.makeDoublesTeamProfileRequest(teamID: teamID)
        let historyRequest = client.makeDoublesTeamEloHistoryRequest(teamID: teamID)

        XCTAssertEqual(
            profileRequest.url?.path,
            "/api/team/\(teamID.uuidString.lowercased())"
        )
        XCTAssertEqual(
            historyRequest.url?.path,
            "/api/team/\(teamID.uuidString.lowercased())/elo-history"
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
    func testSixPlayerDraftBuildsDoublesTeamsFromSelectionOrder() {
        var draft = SessionCreationDraft()
        draft.setPlayerCount(6)
        let players = makeCreationPlayers(count: 6)

        players.forEach { draft.toggle($0) }

        XCTAssertEqual(
            draft.doublesTeams.map { $0.map(\.id) },
            [
                [players[0].id, players[1].id],
                [players[2].id, players[3].id],
                [players[4].id, players[5].id]
            ]
        )

        draft.removeSelectedPlayer(at: 1)

        XCTAssertEqual(
            draft.doublesTeams[0].map(\.id),
            [players[0].id, players[2].id]
        )
    }

    @MainActor
    func testSixPlayerSinglesDraftDoesNotBuildDoublesTeams() {
        var draft = SessionCreationDraft()
        draft.setPlayerCount(6)
        draft.sixPlayerFormat = .singles

        makeCreationPlayers(count: 6).forEach { draft.toggle($0) }

        XCTAssertTrue(draft.canPreview)
        XCTAssertFalse(draft.usesDoublesTeams)
        XCTAssertTrue(draft.doublesTeams.isEmpty)
        XCTAssertEqual(draft.selectedFormat, .singles)
    }

    @MainActor
    func testSixPlayerRandomizerPreservesTeamsAndDynamicRounds() {
        let players = makeCreationPlayers(count: 6)
        let preview = makeSixPlayerSchedulePreview(players: players)

        let randomized = SessionScheduleRandomizer.preservingFixedTeams(
            in: preview
        )

        XCTAssertEqual(randomized.players.map(\.id), players.map(\.id))
        XCTAssertEqual(
            randomized.rounds.filter { $0.roundNumber >= 5 },
            preview.rounds.filter { $0.roundNumber >= 5 }
        )

        let partnerKeys = stride(from: 0, to: 6, by: 2).map {
            matchupKey(players[$0].id, players[$0 + 1].id)
        }
        let singlesKeys = randomized.rounds
            .filter { $0.roundNumber <= 4 }
            .flatMap(\.matches)
            .map {
                matchupKey($0.players[0].id, $0.players[1].id)
            }

        XCTAssertEqual(Set(singlesKeys).count, 12)
        XCTAssertTrue(Set(singlesKeys).isDisjoint(with: Set(partnerKeys)))
        XCTAssertEqual(randomized.rounds[5].dynamicNote?.title, "Dynamic")
    }

    @MainActor
    func testCreateSessionRequestSendsPreviewedScheduleAndIdempotencyKey() throws {
        var draft = SessionCreationDraft()
        draft.setPlayerCount(2)
        let ivan = SessionCreationPlayer(
            id: ivanID,
            name: "Ivan",
            avatarURL: URL(string: "https://example.com/ivan.jpg"),
            elo: 1_700
        )
        let gara = SessionCreationPlayer(
            id: garaID,
            name: "Gara",
            avatarURL: nil,
            elo: 1_600
        )
        draft.toggle(ivan)
        draft.toggle(gara)
        let preview = SessionSchedulePreview(
            playerCount: 2,
            players: [gara, ivan],
            rounds: [
                SessionScheduleRound(
                    id: "1",
                    roundNumber: 1,
                    matches: [
                        SessionScheduleMatch(
                            type: .singles,
                            players: [gara, ivan]
                        )
                    ],
                    isDynamic: nil
                )
            ],
            fourPlayerFormat: .mixed
        )

        let request = try makeAPIClient().makeCreateSessionRequest(
            from: draft,
            preview: preview
        )
        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )
        let players = try XCTUnwrap(json["players"] as? [[String: Any]])
        let rounds = try XCTUnwrap(json["rounds"] as? [[String: Any]])

        XCTAssertEqual(request.url?.path, "/api/sessions")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Idempotency-Key"),
            draft.idempotencyKey.uuidString.lowercased()
        )
        XCTAssertEqual(json["fourPlayerFormat"] as? String, "mixed")
        XCTAssertNil(json["createdAt"])
        XCTAssertEqual(rounds.count, 1)
        XCTAssertEqual(players.map { $0["id"] as? String }, [
            garaID.uuidString,
            ivanID.uuidString
        ])
    }

    @MainActor
    func testSixPlayerPreviewRequestSendsSinglesFormat() throws {
        let players = makeCreationPlayers(count: 6)
        let request = try makeAPIClient().makeSessionPreviewRequest(
            players: players,
            format: .singles
        )
        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )

        XCTAssertEqual(json["sixPlayerFormat"] as? String, "singles")
        XCTAssertEqual(json["fourPlayerFormat"] as? String, "singles")
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

    @MainActor
    func testCreatedSessionSummaryCanOpenBeforeRefreshCompletes() {
        var draft = SessionCreationDraft()
        draft.setPlayerCount(3)
        let startedAt = Date.now
        let result = CreatedSessionResult(
            sessionId: UUID(),
            message: "Created",
            rounds: [
                SessionScheduleRound(
                    id: "1",
                    roundNumber: 1,
                    matches: [],
                    isDynamic: nil
                ),
                SessionScheduleRound(
                    id: "2",
                    roundNumber: 2,
                    matches: [],
                    isDynamic: nil
                ),
                SessionScheduleRound(
                    id: "3",
                    roundNumber: 3,
                    matches: [],
                    isDynamic: nil
                )
            ]
        )

        let summary = result.makeSummary(for: draft)

        XCTAssertEqual(summary.id, result.sessionId)
        XCTAssertEqual(summary.playerCount, 3)
        XCTAssertEqual(summary.currentRound, 1)
        XCTAssertEqual(summary.totalRounds, 3)
        XCTAssertEqual(summary.status, .active)
        XCTAssertGreaterThanOrEqual(summary.createdAt, startedAt)
        XCTAssertLessThanOrEqual(summary.createdAt, .now)
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

    private func makeCreationPlayers(
        count: Int
    ) -> [SessionCreationPlayer] {
        (1...count).map { index in
            SessionCreationPlayer(
                id: UUID(
                    uuidString: String(
                        format: "00000000-0000-0000-0000-%012d",
                        index
                    )
                )!,
                name: "Player \(index)",
                avatarURL: nil,
                elo: 1_500 + index
            )
        }
    }

    @MainActor
    private func makeSixPlayerSchedulePreview(
        players: [SessionCreationPlayer]
    ) -> SessionSchedulePreview {
        let placeholderRounds = (1...4).map {
            SessionScheduleRound(
                id: "\($0)",
                roundNumber: $0,
                matches: [
                    SessionScheduleMatch(
                        type: .singles,
                        players: [players[0], players[2]]
                    )
                ],
                isDynamic: nil
            )
        }
        let mixedRounds = [
            SessionScheduleRound(
                id: "5",
                roundNumber: 5,
                matches: [
                    SessionScheduleMatch(
                        type: .doubles,
                        players: Array(players[0...3])
                    ),
                    SessionScheduleMatch(
                        type: .singles,
                        players: Array(players[4...5])
                    )
                ],
                isDynamic: nil
            ),
            SessionScheduleRound(
                id: "6",
                roundNumber: 6,
                matches: [
                    SessionScheduleMatch(
                        type: .doubles,
                        players: [
                            players[0], players[1],
                            players[4], players[5]
                        ]
                    ),
                    SessionScheduleMatch(
                        type: .singles,
                        players: Array(players[2...3])
                    )
                ],
                isDynamic: true,
                dynamicNote: SessionScheduleDynamicNote(
                    title: "Dynamic",
                    description: "Round five decides this round."
                )
            ),
            SessionScheduleRound(
                id: "7",
                roundNumber: 7,
                matches: [
                    SessionScheduleMatch(
                        type: .doubles,
                        players: [
                            players[2], players[3],
                            players[4], players[5]
                        ]
                    ),
                    SessionScheduleMatch(
                        type: .singles,
                        players: Array(players[0...1])
                    )
                ],
                isDynamic: true
            )
        ]

        return SessionSchedulePreview(
            playerCount: 6,
            players: players,
            rounds: placeholderRounds + mixedRounds,
            fourPlayerFormat: .mixed
        )
    }

    private func matchupKey(_ first: UUID, _ second: UUID) -> String {
        [first.uuidString, second.uuidString]
            .sorted()
            .joined(separator: ":")
    }

    private func makeHalfSessionRounds(
        firstSettlementCompleted: Bool = true
    ) -> (
        rounds: [SessionRound],
        firstHalfIDs: [UUID],
        secondHalfIDs: [UUID]
    ) {
        let pairings = [
            [ivanID, garaID],
            [leoID, miladinID],
            [ivanID, leoID],
            [garaID, miladinID],
            [ivanID, miladinID],
            [garaID, leoID]
        ]
        let firstHalfIDs = pairings.map { _ in UUID() }
        let secondHalfIDs = pairings.map { _ in UUID() }

        let firstHalfRounds = (0..<3).map { roundIndex in
            SessionRound(
                number: roundIndex + 1,
                matches: (0..<2).map { matchOrder in
                    let index = roundIndex * 2 + matchOrder
                    return SessionMatch(
                        id: firstHalfIDs[index],
                        roundNumber: roundIndex + 1,
                        type: .singles,
                        order: matchOrder,
                        playerIDs: pairings[index],
                        isCompleted: true,
                        teamOneScore: 3,
                        teamTwoScore: 1
                    )
                },
                restingPlayers: []
            )
        }

        let secondHalfRounds = (0..<3).map { roundIndex in
            SessionRound(
                number: roundIndex + 4,
                matches: (0..<2).map { matchOrder in
                    let index = roundIndex * 2 + matchOrder
                    let isFirstSettlement = index == 0
                    return SessionMatch(
                        id: secondHalfIDs[index],
                        roundNumber: roundIndex + 4,
                        type: .singles,
                        order: matchOrder,
                        playerIDs: isFirstSettlement
                            ? Array(pairings[index].reversed())
                            : pairings[index],
                        isCompleted: isFirstSettlement
                            ? firstSettlementCompleted
                            : true,
                        teamOneScore: isFirstSettlement
                            && !firstSettlementCompleted ? nil : 2,
                        teamTwoScore: isFirstSettlement
                            && !firstSettlementCompleted ? nil : 3
                    )
                },
                restingPlayers: []
            )
        }

        return (
            firstHalfRounds + secondHalfRounds,
            firstHalfIDs,
            secondHalfIDs
        )
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

    @MainActor
    private func makeDetail(
        singlesPerformance: [SessionPlayerPerformance] = [],
        doublesPerformance: [SessionPlayerPerformance] = [],
        rounds: [SessionRound] = [],
        snapshots: [SessionPlayerEloSnapshot] = []
    ) -> SessionDetail {
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
            singlesPerformance: singlesPerformance,
            doublesPlayerPerformance: doublesPerformance,
            doublesTeamPerformance: [],
            rounds: rounds,
            playerEloSnapshots: snapshots
        )
    }

    private func makePerformance(
        playerID: UUID,
        eloBefore: Double,
        eloAfter: Double
    ) -> SessionPlayerPerformance {
        SessionPlayerPerformance(
            playerID: playerID,
            matchesPlayed: 1,
            wins: 1,
            losses: 0,
            draws: 0,
            eloBefore: eloBefore,
            eloAfter: eloAfter,
            eloChange: eloAfter - eloBefore
        )
    }
}

private final class RoundSubmissionErrorURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let isMissingSession = request.url?.path.contains("/rounds/2/") == true
        let statusCode = isMissingSession ? 404 : 500
        let body = isMissingSession
            ? #"{"error":"Session not found"}"#
            : #"{"error":"Internal server error","details":"Atomic ELO commit failed: ROUND_STATE_CONFLICT"}"#
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!

        client?.urlProtocol(
            self,
            didReceive: response,
            cacheStoragePolicy: .notAllowed
        )
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private final class HeadToHeadResponseURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let body = """
        {
          "player1": {
            "id": "00000000-0000-0000-0000-000000000001",
            "display_name": "Ivan",
            "avatar": null,
            "elo": 1717.51,
            "wins": 18,
            "losses": 11,
            "draws": 1,
            "setsWon": 67,
            "setsLost": 49
          },
          "player2": {
            "id": "00000000-0000-0000-0000-000000000002",
            "display_name": "Gara",
            "avatar": null,
            "elo": 1626.17,
            "wins": 11,
            "losses": 18,
            "draws": 1,
            "setsWon": 49,
            "setsLost": 67
          },
          "totalMatches": 30
        }
        """
        let data = Data(body.utf8)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!

        client?.urlProtocol(
            self,
            didReceive: response,
            cacheStoragePolicy: .notAllowed
        )
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private final class StatisticsResponseURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let body = """
        {
          "singles": [{
            "player_id": "00000000-0000-0000-0000-000000000001",
            "display_name": "Ivan",
            "avatar": null,
            "matches_played": 219,
            "wins": 132,
            "losses": 77,
            "draws": 10,
            "elo": 1717.51,
            "rank_duration_days": 12,
            "recent_form": [8, -7, 3]
          }],
          "doublesPlayers": [],
          "doublesTeams": [{
            "team_id": "00000000-0000-0000-0000-000000000010",
            "player1": {
              "id": "00000000-0000-0000-0000-000000000001",
              "display_name": "Ivan",
              "avatar": null
            },
            "player2": {
              "id": "00000000-0000-0000-0000-000000000002",
              "display_name": "Gara",
              "avatar": null
            },
            "matches_played": 30,
            "wins": 18,
            "losses": 11,
            "draws": 1,
            "elo": 1642,
            "rank_duration_days": 5,
            "recent_form": [9, -2, 7]
          }],
          "eligibility": {
            "singles": {
              "minimumMatches": 15,
              "maximumInactivityDays": 28
            },
            "doublesPlayers": {
              "minimumMatches": 6,
              "maximumInactivityDays": 56
            },
            "doublesTeams": {
              "minimumMatches": 6,
              "maximumInactivityDays": 56
            }
          }
        }
        """
        let data = Data(body.utf8)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!

        client?.urlProtocol(
            self,
            didReceive: response,
            cacheStoragePolicy: .notAllowed
        )
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
