import XCTest
@testable import Gweilo

final class NotificationModelsTests: XCTestCase {
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
