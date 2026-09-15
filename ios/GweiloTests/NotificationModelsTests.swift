import XCTest
@testable import Gweilo

@MainActor
private var startupConfiguration: AppConfiguration {
    AppConfiguration(supabaseURL: URL(string: "https://startup.test")!, supabaseAnonKey: "test",
                     apiBaseURL: URL(string: "https://startup.test")!)
}

@MainActor
private func startupSession(userID: UUID = UUID(), token: String = "old", expired: Bool = false) -> AuthSession {
    AuthSession(accessToken: token, refreshToken: "refresh-\(token)", expiresIn: 3600,
                expiresAt: Int(Date.now.timeIntervalSince1970) + (expired ? -1 : 3600),
                user: AuthenticatedUser(id: userID, email: "test@example.com", role: "member"))
}

@MainActor
private func startupNetwork() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StartupURLProtocol.self]
    return URLSession(configuration: configuration)
}

@MainActor
private final class MemorySessionVault: AuthSessionPersisting {
    var value: AuthSession?
    var saveCount = 0
    var deleteCount = 0
    init(_ value: AuthSession?) { self.value = value }
    func load() throws -> AuthSession? { value }
    func save(_ session: AuthSession) throws { value = session; saveCount += 1 }
    func delete() { value = nil; deleteCount += 1 }
}

@MainActor
private final class StartupAccountState {
    var isCurrent = true
}

/// All traffic in startup regressions stays inside this protocol, never production.
private final class StartupURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var handler: @Sendable (URLRequest) -> (Int, Data, TimeInterval) = { _ in (500, Data(), 0) }
    nonisolated(unsafe) private static var count = 0
    private var pending: DispatchWorkItem?

    static var requestCount: Int { lock.withLock { count } }
    static func reset(_ response: @escaping @Sendable (URLRequest) -> (Int, Data, TimeInterval)) {
        lock.withLock { count = 0; handler = response }
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data, delay) = Self.lock.withLock {
            Self.count += 1
            return Self.handler(request)
        }
        let work = DispatchWorkItem { [self] in
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
        pending = work
        DispatchQueue.global().asyncAfter(deadline: .now() + delay, execute: work)
    }
    override func stopLoading() { pending?.cancel() }
}


final class NotificationModelsTests: XCTestCase {
    @MainActor
    func testHomepageUsesSinglesOnlyStatisticsEndpoint() async throws {
        StartupURLProtocol.reset { request in
            XCTAssertEqual(request.url?.query, "view=singles")
            return (200, Data(#"{"singles":[]}"#.utf8), 0)
        }
        let client = GweiloAPIClient(configuration: startupConfiguration, accessToken: "test", session: startupNetwork())
        let result = try await client.fetchRankings(singlesOnly: true)
        XCTAssertTrue(result.singles.isEmpty)
        XCTAssertTrue(result.doublesTeams.isEmpty)
    }

    @MainActor
    func testResponseIsDiscardedAfterAccountChanges() async throws {
        StartupURLProtocol.reset { _ in (200, Data(), 0.1) }
        let state = StartupAccountState()
        let executor = AuthenticatedRequestExecutor(token: { _ in "test" }, isCurrentUser: { state.isCurrent })
        let request = Task {
            try await executor.data(for: URLRequest(url: startupConfiguration.apiBaseURL), session: startupNetwork())
        }
        try await Task.sleep(for: .milliseconds(20))
        state.isCurrent = false
        do { _ = try await request.value; XCTFail("Old account data must be discarded") }
        catch is CancellationError { }
    }

    @MainActor
    func testRestoreIsLocalAndTokenRefreshIsSingleFlight() async throws {
        let original = startupSession(expired: true)
        let vault = MemorySessionVault(original)
        let refreshed = startupSession(userID: original.user.id, token: "new")
        let data = try JSONEncoder().encode(refreshed)
        StartupURLProtocol.reset { _ in (200, data, 0.1) }
        let auth = AuthStore(configuration: startupConfiguration, vault: vault, networkSession: startupNetwork())
        await auth.restoreSession()
        XCTAssertFalse(auth.isRestoringSession)
        XCTAssertEqual(StartupURLProtocol.requestCount, 0)
        async let first: Void = auth.refreshIfNeeded()
        async let second: Void = auth.refreshIfNeeded(force: true)
        _ = await (first, second)
        XCTAssertEqual(StartupURLProtocol.requestCount, 1)
        XCTAssertEqual(vault.saveCount, 1)
        XCTAssertEqual(auth.session?.accessToken, "new")
    }

    @MainActor
    func testTemporaryRefreshFailuresDoNotDeleteSession() async {
        for status in [401, 429, 503] {
            StartupURLProtocol.reset { _ in (status, Data(#"{"message":"temporary failure"}"#.utf8), 0) }
            let original = startupSession(expired: true)
            let vault = MemorySessionVault(original)
            let auth = AuthStore(configuration: startupConfiguration, vault: vault, networkSession: startupNetwork())
            await auth.restoreSession()
            await auth.refreshIfNeeded()
            XCTAssertEqual(auth.session?.accessToken, original.accessToken)
            XCTAssertNotNil(vault.value)
            XCTAssertEqual(vault.deleteCount, 0)
        }
    }

    @MainActor
    func testRevokedRefreshTokenIsClassifiedAsExpired() async {
        StartupURLProtocol.reset { _ in
            (400, Data(#"{"code":"refresh_token_not_found","message":"Invalid Refresh Token"}"#.utf8), 0)
        }
        do {
            _ = try await SupabaseAuthClient(configuration: startupConfiguration, session: startupNetwork())
                .refreshSession(refreshToken: "revoked")
            XCTFail("Revoked credentials should fail.")
        } catch AuthenticationError.sessionExpired {
            // Only a definitive credential failure should ask for a new login.
        } catch { XCTFail("Unexpected error: \(error)") }
    }

    @MainActor
    func testLogoutCannotBeUndoneByLateRefresh() async throws {
        let original = startupSession(expired: true)
        let data = try JSONEncoder().encode(startupSession(userID: original.user.id, token: "late"))
        StartupURLProtocol.reset { _ in (200, data, 0.3) }
        let vault = MemorySessionVault(original)
        let auth = AuthStore(configuration: startupConfiguration, vault: vault, networkSession: startupNetwork())
        await auth.restoreSession()
        let refresh = Task { await auth.refreshIfNeeded() }
        for _ in 0..<20 {
            if StartupURLProtocol.requestCount > 0 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        auth.signOut()
        await refresh.value
        XCTAssertNil(auth.session)
        XCTAssertNil(vault.value)
        XCTAssertEqual(vault.saveCount, 0)
    }

    @MainActor
    func testRefreshTimerPreservesFractionalSeconds() throws {
        let original = startupSession()
        let expiry = try XCTUnwrap(original.expiresAt)
        let now = Date(timeIntervalSince1970: Double(expiry) - 99.75)
        let delay = try XCTUnwrap(AuthStore.refreshDelay(for: original, now: now))
        XCTAssertEqual(delay, 9.75, accuracy: 0.001)
        XCTAssertTrue(original.needsRefresh(at: now.addingTimeInterval(delay)))
    }

    @MainActor
    func testUnauthorizedRequestRefreshesAndReplaysOnlyOnce() async throws {
        StartupURLProtocol.reset { _ in (401, Data(), 0) }
        var tokens: [String?] = []
        let executor = AuthenticatedRequestExecutor { rejected in
            tokens.append(rejected)
            return rejected == nil ? "old" : "new"
        }
        let result = try await executor.data(for: URLRequest(url: startupConfiguration.apiBaseURL), session: startupNetwork())
        XCTAssertEqual((result.1 as? HTTPURLResponse)?.statusCode, 401)
        XCTAssertEqual(StartupURLProtocol.requestCount, 2)
        XCTAssertEqual(tokens.count, 2)
        XCTAssertNil(tokens[0])
        XCTAssertEqual(tokens[1], "old")
    }

    @MainActor
    func testTransportRetriesReadsButNeverScoreWrites() async throws {
        StartupURLProtocol.reset { _ in (503, Data(), 0) }
        var request = URLRequest(url: startupConfiguration.apiBaseURL)
        request.httpMethod = "POST"
        _ = try await AppNetwork.data(for: request, session: startupNetwork())
        XCTAssertEqual(StartupURLProtocol.requestCount, 1)
        StartupURLProtocol.reset { _ in (503, Data(), 0) }
        request.httpMethod = "GET"
        _ = try await AppNetwork.data(for: request, session: startupNetwork())
        XCTAssertEqual(StartupURLProtocol.requestCount, 2)
    }

    @MainActor
    func testRoundSubmissionDoesNotWaitForSlowBackgroundRefreshes() async throws {
        StartupURLProtocol.reset { request in
            if request.httpMethod == "POST",
               request.url?.path.contains("/rounds/1/submit") == true {
                return (200, Data(#"{"success":true}"#.utf8), 0)
            }
            return (200, Data("[]".utf8), 1)
        }
        let store = AppDataStore(
            configuration: startupConfiguration,
            session: startupSession(),
            networkSession: startupNetwork()
        )
        defer { store.deactivate() }

        let startedAt = ContinuousClock.now
        let result = try await store.submitRound(
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
        let elapsed = startedAt.duration(to: .now)

        XCTAssertTrue(result.success)
        XCTAssertLessThan(elapsed, .milliseconds(500))
    }

    @MainActor
    func testCancelledRequestIsNotRetried() async throws {
        StartupURLProtocol.reset { _ in (503, Data(), 0.3) }
        let task = Task {
            try await AppNetwork.data(for: URLRequest(url: startupConfiguration.apiBaseURL), session: startupNetwork())
        }
        task.cancel()
        do { _ = try await task.value; XCTFail("Expected cancellation") }
        catch { XCTAssertLessThanOrEqual(StartupURLProtocol.requestCount, 1) }
    }

    @MainActor
    func testHomepagePublishesRankingsBeforeSlowSessionsAndCachesEmptyTable() async throws {
        StartupURLProtocol.reset { request in
            switch request.url!.path {
            case "/api/statistics":
                return (200, Data(#"{"singles":[],"doublesPlayers":[],"doublesTeams":[]}"#.utf8), 0)
            case "/rest/v1/sessions": return (200, Data("[]".utf8), 1)
            case "/api/sessions/active": return (200, Data(#"{"sessionId":null}"#.utf8), 0)
            default: return (200, Data("[]".utf8), 0)
            }
        }
        let suite = "StartupTests-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let snapshots = HomeDashboardSnapshotStore(defaults: defaults)
        let authSession = startupSession()
        let store = AppDataStore(configuration: startupConfiguration, session: authSession,
                                 homeSnapshotStore: snapshots, networkSession: startupNetwork())
        let loading = Task { await store.load() }
        for _ in 0..<30 {
            if store.hasLoadedRankings { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertTrue(store.hasLoadedRankings)
        XCTAssertFalse(store.hasLoadedSessions)
        XCTAssertNotNil(snapshots.load(for: authSession.user.id))
        await loading.value
        store.deactivate()
        let restored = AppDataStore(configuration: startupConfiguration, session: authSession,
                                    homeSnapshotStore: snapshots, networkSession: startupNetwork())
        XCTAssertTrue(restored.hasLoadedSessions)
        XCTAssertTrue(restored.hasLoadedRankings)
        XCTAssertTrue(restored.topThreeSinglesPlayers.isEmpty)
        restored.deactivate()
    }

    @MainActor
    func testMissionSnapshotDecodesBackendShape() throws {
        let playerID = UUID()
        let opponentID = UUID()
        let data = Data(
            """
            {
              "playerId": "\(playerID.uuidString)",
              "playerName": "Ivan",
              "playerAvatarUrl": null,
              "playerElo": 1780,
              "playerRank": 1,
              "matchesPlayed": 42,
              "playerTier": "top",
              "generatedAt": "2026-07-31T12:34:56.789Z",
              "generatedReason": "auto",
              "generatedBy": null,
              "missions": [
                {
                  "id": "defend_rank:\(playerID.uuidString):\(opponentID.uuidString)",
                  "type": "defend_rank",
                  "priorityBucket": "competitive",
                  "title": "Sačuvaj poziciju",
                  "body": "Imaš prednost od 18 Elo poena.",
                  "opponentId": "\(opponentID.uuidString)",
                  "opponentName": "Leo",
                  "basePriority": 88,
                  "score": 112,
                  "scoreBreakdown": {
                    "basePriority": 88,
                    "closeness": 12,
                    "recency": 4,
                    "realism": 4,
                    "tierFit": 4,
                    "total": 112
                  },
                  "reasoning": [],
                  "metrics": {
                    "gapElo": 18,
                    "direction": "iza",
                    "featured": true,
                    "lastPlayedAt": null
                  }
                }
              ],
              "candidates": [],
              "context": {
                "closestAbove": null,
                "closestBelow": {
                  "id": "\(opponentID.uuidString)",
                  "name": "Leo",
                  "gapElo": 18
                }
              }
            }
            """.utf8
        )

        let snapshot = try JSONDecoder().decode(
            RivalryMissionSnapshot.self,
            from: data
        )

        XCTAssertEqual(snapshot.playerId, playerID)
        XCTAssertEqual(snapshot.playerTier, .top)
        XCTAssertNotNil(snapshot.generatedDate)
        XCTAssertEqual(snapshot.missions.first?.opponentId, opponentID)
        XCTAssertEqual(snapshot.missions.first?.numberMetric("gapElo"), 18)
        XCTAssertEqual(snapshot.missions.first?.stringMetric("direction"), "iza")
    }

    @MainActor
    func testHomeSnapshotRoundTripsForTheSameUser() throws {
        let suiteName = "HomeDashboardSnapshotTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(
            UserDefaults(suiteName: suiteName)
        )
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let userID = UUID()
        let player = RankingEntry(
            id: UUID(),
            name: "Ivan",
            avatarURL: URL(string: "https://example.com/ivan.png"),
            elo: 1_741,
            matches: 20,
            wins: 12,
            losses: 7,
            draws: 1,
            rankDays: 5,
            recentForm: [4, -2, 11]
        )
        let snapshot = HomeDashboardSnapshot(
            topThreeSinglesPlayers: [player, player, player],
            currentUserLatestSessionDelta: 11,
            currentUserLatestFormScore: 0.75,
            currentUserFirstName: "Ivan",
            savedAt: Date(timeIntervalSince1970: 123),
            currentUserVocativeName: "Ivane"
        )
        let store = HomeDashboardSnapshotStore(defaults: defaults)

        store.save(snapshot, for: userID)

        XCTAssertEqual(store.load(for: userID), snapshot)
    }

    @MainActor
    func testHomeSnapshotsAreSeparatedByUser() throws {
        let suiteName = "HomeDashboardSnapshotTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(
            UserDefaults(suiteName: suiteName)
        )
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let store = HomeDashboardSnapshotStore(defaults: defaults)
        let snapshot = HomeDashboardSnapshot(
            topThreeSinglesPlayers: [],
            currentUserLatestSessionDelta: -7,
            currentUserLatestFormScore: -0.8,
            currentUserFirstName: "Ivan",
            savedAt: .now
        )

        store.save(snapshot, for: UUID())

        XCTAssertNil(store.load(for: UUID()))
    }

    @MainActor
    func testAppDataStoreHydratesHomeBeforeNetworkLoad() throws {
        let suiteName = "HomeDashboardSnapshotTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(
            UserDefaults(suiteName: suiteName)
        )
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let userID = UUID()
        let players = (1...3).map { rank in
            RankingEntry(
                id: UUID(),
                name: "Player \(rank)",
                avatarURL: nil,
                elo: 1_800 - rank,
                matches: 20,
                wins: 12,
                losses: 7,
                draws: 1,
                rankDays: rank,
                recentForm: []
            )
        }
        let snapshotStore = HomeDashboardSnapshotStore(defaults: defaults)
        snapshotStore.save(
            HomeDashboardSnapshot(
                topThreeSinglesPlayers: players,
                currentUserLatestSessionDelta: 9,
                currentUserLatestFormScore: 1,
                currentUserFirstName: "Ivan",
                savedAt: .now,
                currentUserVocativeName: "Ivane",
                currentUserEloHistory: PlayerEloHistory(points: [], currentElo: 1800)
            ),
            for: userID
        )
        let configuration = AppConfiguration(
            supabaseURL: try XCTUnwrap(URL(string: "https://example.com")),
            supabaseAnonKey: "test",
            apiBaseURL: try XCTUnwrap(URL(string: "https://example.com"))
        )
        let session = AuthSession(
            accessToken: "test",
            refreshToken: "test",
            expiresIn: 3_600,
            expiresAt: nil,
            user: AuthenticatedUser(
                id: userID,
                email: "ivan@example.com",
                role: "admin"
            )
        )

        let dataStore = AppDataStore(
            configuration: configuration,
            session: session,
            homeSnapshotStore: snapshotStore
        )

        XCTAssertTrue(dataStore.hasLoaded)
        XCTAssertFalse(dataStore.hasCompletedInitialHomeLoad)
        XCTAssertTrue(dataStore.canManageSessions)
        XCTAssertFalse(dataStore.canStartNewSession)
        XCTAssertEqual(dataStore.topThreeSinglesPlayers, players)
        XCTAssertEqual(dataStore.currentUserLatestSessionDelta, 9)
        XCTAssertEqual(dataStore.currentUserFirstName, "Ivan")
        XCTAssertEqual(dataStore.currentUserGreetingName, "Ivane")
        XCTAssertEqual(dataStore.currentUserEloHistory?.currentElo, 1800)
        dataStore.updateSession(AuthSession(
            accessToken: "rotated", refreshToken: "rotated-refresh", expiresIn: 3600, expiresAt: nil,
            user: session.user
        ))
        XCTAssertTrue(dataStore.hasLoaded)
        XCTAssertEqual(dataStore.topThreeSinglesPlayers, players)
        XCTAssertEqual(dataStore.currentUserGreetingName, "Ivane")
        dataStore.deactivate()
    }

    @MainActor
    func testPreferencesDecodeFromBackendShape() throws {
        let data = Data(
            """
            {
              "enabled": true,
              "sessionsEnabled": true,
              "roundsEnabled": false,
              "resultsEnabled": true,
              "pollsEnabled": false,
              "announcementsEnabled": true
            }
            """.utf8
        )

        let preferences = try JSONDecoder().decode(
            PushNotificationPreferences.self,
            from: data
        )

        XCTAssertTrue(preferences.enabled)
        XCTAssertTrue(preferences.liveActivitiesEnabled)
        XCTAssertFalse(preferences.roundsEnabled)
        XCTAssertFalse(preferences.pollsEnabled)
        XCTAssertTrue(preferences.announcementsEnabled)
    }

    @MainActor
    func testCategoryPatchOnlyEncodesChangedPreference() throws {
        let patch = PushNotificationPreference.rounds.patch(value: false)
        let data = try JSONEncoder().encode(patch)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Bool]
        )

        XCTAssertEqual(object, ["roundsEnabled": false])
    }

    @MainActor
    func testLiveActivityPatchOnlyEncodesChangedPreference() throws {
        let patch = PushNotificationPreference.liveActivities.patch(
            value: false
        )
        let data = try JSONEncoder().encode(patch)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Bool]
        )

        XCTAssertEqual(object, ["liveActivitiesEnabled": false])
    }

    @MainActor
    func testDeviceRegistrationUsesAPNsEnvironmentAndBundle() throws {
        let registration = PushDeviceRegistration(
            token: "abc123",
            environment: "development",
            bundleId: "com.ivantomicic.gweilo",
            appVersion: "0.1.0"
        )
        let data = try JSONEncoder().encode(registration)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data)
                as? [String: Any]
        )

        XCTAssertEqual(object["token"] as? String, "abc123")
        XCTAssertEqual(object["platform"] as? String, "ios")
        XCTAssertEqual(object["environment"] as? String, "development")
        XCTAssertEqual(
            object["bundleId"] as? String,
            "com.ivantomicic.gweilo"
        )
    }

    @MainActor
    func testWidgetSnapshotContentComparisonIgnoresSaveTime() {
        let first = GweiloWidgetSnapshot(
            savedAt: Date(timeIntervalSince1970: 100),
            player: nil,
            standings: [],
            activeSessionID: nil,
            activeSession: nil
        )
        let second = GweiloWidgetSnapshot(
            savedAt: Date(timeIntervalSince1970: 200),
            player: nil,
            standings: [],
            activeSessionID: nil,
            activeSession: nil
        )

        XCTAssertTrue(first.hasSameContent(as: second))
    }
}
