import XCTest
@testable import Gweilo

final class NotificationModelsTests: XCTestCase {
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
            currentUserFirstName: "Ivan",
            savedAt: Date(timeIntervalSince1970: 123)
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
                currentUserFirstName: "Ivan",
                savedAt: .now
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
                email: "ivan@example.com"
            )
        )

        let dataStore = AppDataStore(
            configuration: configuration,
            session: session,
            homeSnapshotStore: snapshotStore
        )

        XCTAssertTrue(dataStore.hasLoaded)
        XCTAssertEqual(dataStore.topThreeSinglesPlayers, players)
        XCTAssertEqual(dataStore.currentUserLatestSessionDelta, 9)
        XCTAssertEqual(dataStore.currentUserFirstName, "Ivan")
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
}
