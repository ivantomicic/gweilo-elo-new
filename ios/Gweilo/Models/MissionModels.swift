import Foundation

enum RivalryMissionType: String, Decodable, Sendable {
    case climbRank = "climb_rank"
    case defendRank = "defend_rank"
    case settleScore = "settle_score"
    case breakStreak = "break_streak"
    case closeGap = "close_gap"
}

enum RivalryPlayerTier: String, Decodable, Sendable {
    case provisional
    case top
    case mid
    case bottom

    var displayName: String {
        switch self {
        case .provisional: "Privremeni"
        case .top: "Vrh"
        case .mid: "Sredina"
        case .bottom: "Izazivači"
        }
    }
}

enum RivalryMissionMetricValue: Hashable, Decodable, Sendable {
    case number(Double)
    case string(String)
    case boolean(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .boolean(value)
        } else if let value = try? container.decode(Int.self) {
            self = .number(Double(value))
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else {
            throw DecodingError.typeMismatch(
                RivalryMissionMetricValue.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Nepodržana vrednost metrike misije."
                )
            )
        }
    }

    var number: Double? {
        switch self {
        case let .number(value): value
        case let .string(value): Double(value)
        case .boolean, .null: nil
        }
    }

    var string: String? {
        switch self {
        case let .string(value): value
        case .number, .boolean, .null: nil
        }
    }
}

struct RivalryMission: Identifiable, Hashable, Decodable, Sendable {
    let id: String
    let type: RivalryMissionType
    let title: String
    let body: String
    let opponentId: UUID?
    let opponentName: String?
    let score: Double
    let metrics: [String: RivalryMissionMetricValue]

    func numberMetric(_ key: String) -> Double? {
        metrics[key]?.number
    }

    func stringMetric(_ key: String) -> String? {
        metrics[key]?.string
    }
}

struct RivalryMissionSnapshot: Identifiable, Hashable, Decodable, Sendable {
    let playerId: UUID
    let playerName: String
    let playerAvatarUrl: URL?
    let playerElo: Double
    let playerRank: Int
    let matchesPlayed: Int
    let playerTier: RivalryPlayerTier
    let generatedAt: String
    let generatedReason: String
    let generatedBy: UUID?
    let missions: [RivalryMission]

    var id: UUID { playerId }

    var generatedDate: Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds
        ]
        return fractionalFormatter.date(from: generatedAt)
            ?? ISO8601DateFormatter().date(from: generatedAt)
    }
}
