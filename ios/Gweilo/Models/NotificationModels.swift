import Foundation

struct PushNotificationPreferences: Codable, Equatable, Sendable {
    var enabled: Bool
    var liveActivitiesEnabled: Bool
    var sessionsEnabled: Bool
    var roundsEnabled: Bool
    var resultsEnabled: Bool
    var pollsEnabled: Bool
    var announcementsEnabled: Bool

    static let defaults = PushNotificationPreferences(
        enabled: true,
        liveActivitiesEnabled: true,
        sessionsEnabled: true,
        roundsEnabled: true,
        resultsEnabled: true,
        pollsEnabled: true,
        announcementsEnabled: true
    )

    private enum CodingKeys: String, CodingKey {
        case enabled
        case liveActivitiesEnabled
        case sessionsEnabled
        case roundsEnabled
        case resultsEnabled
        case pollsEnabled
        case announcementsEnabled
    }

    init(
        enabled: Bool,
        liveActivitiesEnabled: Bool,
        sessionsEnabled: Bool,
        roundsEnabled: Bool,
        resultsEnabled: Bool,
        pollsEnabled: Bool,
        announcementsEnabled: Bool
    ) {
        self.enabled = enabled
        self.liveActivitiesEnabled = liveActivitiesEnabled
        self.sessionsEnabled = sessionsEnabled
        self.roundsEnabled = roundsEnabled
        self.resultsEnabled = resultsEnabled
        self.pollsEnabled = pollsEnabled
        self.announcementsEnabled = announcementsEnabled
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try container.decode(Bool.self, forKey: .enabled)
        liveActivitiesEnabled = try container.decodeIfPresent(
            Bool.self,
            forKey: .liveActivitiesEnabled
        ) ?? true
        sessionsEnabled = try container.decode(
            Bool.self,
            forKey: .sessionsEnabled
        )
        roundsEnabled = try container.decode(Bool.self, forKey: .roundsEnabled)
        resultsEnabled = try container.decode(
            Bool.self,
            forKey: .resultsEnabled
        )
        pollsEnabled = try container.decode(Bool.self, forKey: .pollsEnabled)
        announcementsEnabled = try container.decode(
            Bool.self,
            forKey: .announcementsEnabled
        )
    }
}

struct PushNotificationPreferencesResponse: Decodable, Sendable {
    let preferences: PushNotificationPreferences
}

struct PushNotificationPreferencesPatch: Encodable, Sendable {
    var enabled: Bool?
    var liveActivitiesEnabled: Bool?
    var sessionsEnabled: Bool?
    var roundsEnabled: Bool?
    var resultsEnabled: Bool?
    var pollsEnabled: Bool?
    var announcementsEnabled: Bool?
}

enum PushNotificationPreference: String, CaseIterable, Identifiable, Sendable {
    case liveActivities
    case sessions
    case rounds
    case results
    case polls
    case announcements

    var id: Self { self }

    var title: String {
        switch self {
        case .liveActivities: "Live Activities"
        case .sessions: "Sessions"
        case .rounds: "Rounds"
        case .results: "Results and Elo"
        case .polls: "Polls"
        case .announcements: "Announcements"
        }
    }

    var detail: String {
        switch self {
        case .liveActivities:
            "Prati aktivnu sesiju na zaključanom ekranu i Dynamic Island-u."
        case .sessions:
            "Session starts, cancellations, and important changes."
        case .rounds:
            "A new round is ready and your next match is available."
        case .results:
            "A session finished and updated ratings are available."
        case .polls:
            "A new club poll needs your answer."
        case .announcements:
            "Occasional messages sent by a Gweilo admin."
        }
    }

    var systemImage: String {
        switch self {
        case .liveActivities: "rectangle.inset.filled.and.person.filled"
        case .sessions: "calendar"
        case .rounds: "list.number"
        case .results: "trophy"
        case .polls: "checklist"
        case .announcements: "megaphone"
        }
    }

    func value(in preferences: PushNotificationPreferences) -> Bool {
        switch self {
        case .liveActivities: preferences.liveActivitiesEnabled
        case .sessions: preferences.sessionsEnabled
        case .rounds: preferences.roundsEnabled
        case .results: preferences.resultsEnabled
        case .polls: preferences.pollsEnabled
        case .announcements: preferences.announcementsEnabled
        }
    }

    func patch(value: Bool) -> PushNotificationPreferencesPatch {
        switch self {
        case .liveActivities:
            PushNotificationPreferencesPatch(liveActivitiesEnabled: value)
        case .sessions:
            PushNotificationPreferencesPatch(sessionsEnabled: value)
        case .rounds:
            PushNotificationPreferencesPatch(roundsEnabled: value)
        case .results:
            PushNotificationPreferencesPatch(resultsEnabled: value)
        case .polls:
            PushNotificationPreferencesPatch(pollsEnabled: value)
        case .announcements:
            PushNotificationPreferencesPatch(announcementsEnabled: value)
        }
    }
}

struct PushDeviceRegistration: Encodable, Sendable {
    let token: String
    let environment: String
    let platform = "ios"
    let bundleId: String
    let appVersion: String?
}

struct PushDeviceUnregistration: Encodable, Sendable {
    let token: String
    let environment: String
    let bundleId: String
}

struct PushNotificationTestResponse: Decodable, Sendable {
    struct Result: Decodable, Sendable {
        let status: String
        let recipients: Int
        let sent: Int
        let failed: Int
    }

    let result: Result
}
