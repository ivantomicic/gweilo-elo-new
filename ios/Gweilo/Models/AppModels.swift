import Foundation

enum RankingCategory: String, CaseIterable, Identifiable, Sendable {
    case singles = "Singles"
    case doublesPlayers = "Doubles players"
    case doublesTeams = "Doubles teams"

    var id: Self { self }

    var minimumMatches: Int {
        switch self {
        case .singles: 15
        case .doublesPlayers, .doublesTeams: 6
        }
    }
}

struct RankingEntry: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?
    let elo: Int
    let matches: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let rankDays: Int?

    var initials: String {
        name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}

enum SessionStatus: String, Codable, Hashable, Sendable {
    case active
    case completed

    var label: String { rawValue.uppercased() }
}

struct SessionSummary: Identifiable, Hashable, Sendable {
    let id: UUID
    let createdAt: Date
    let playerCount: Int
    let status: SessionStatus
    let currentRound: Int?
    let totalRounds: Int
    let singlesMatches: Int
    let doublesMatches: Int
    let bestPlayer: String?
    let bestDelta: Int?
    let worstPlayer: String?
    let worstDelta: Int?

    var dateLabel: String {
        createdAt.formatted(
            .dateTime
                .weekday(.abbreviated)
                .day()
                .month(.abbreviated)
                .hour()
                .minute()
        )
    }
}

struct SessionParticipant: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?
    let team: String?

    var initials: String {
        name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}

enum SessionMatchType: String, Codable, Hashable, Sendable {
    case singles
    case doubles

    var label: String { rawValue.uppercased() }
}

struct SessionMatch: Identifiable, Hashable, Sendable {
    let id: UUID
    let roundNumber: Int
    let type: SessionMatchType
    let order: Int
    let playerIDs: [UUID]
    let isCompleted: Bool
    let teamOneScore: Int?
    let teamTwoScore: Int?
}

struct SessionRound: Identifiable, Hashable, Sendable {
    var id: Int { number }

    let number: Int
    let matches: [SessionMatch]
    let restingPlayers: [SessionParticipant]
}

struct SessionDetail: Hashable, Sendable {
    let session: SessionSummary
    let participants: [SessionParticipant]
    let rounds: [SessionRound]

    func participant(for playerID: UUID) -> SessionParticipant? {
        participants.first { $0.id == playerID }
    }

    func name(for playerID: UUID) -> String {
        participant(for: playerID)?.name ?? "Unknown player"
    }

    func teamNames(for playerIDs: [UUID]) -> (String, String) {
        if playerIDs.count >= 4 {
            return (
                playerIDs.prefix(2).map(name(for:)).joined(separator: " + "),
                playerIDs.dropFirst(2).prefix(2).map(name(for:)).joined(separator: " + ")
            )
        }

        return (
            playerIDs.first.map(name(for:)) ?? "Unknown player",
            playerIDs.dropFirst().first.map(name(for:)) ?? "Unknown player"
        )
    }
}
