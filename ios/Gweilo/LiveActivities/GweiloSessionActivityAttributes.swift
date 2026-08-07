import ActivityKit
import Foundation

nonisolated struct GweiloSessionActivityAttributes: ActivityAttributes {
    nonisolated struct ContentState: Codable, Hashable, Sendable {
        let currentRound: Int
        let totalRounds: Int
        let completedMatches: Int
        let totalMatches: Int
        let status: String
        let headline: String
        let matchups: [Matchup]
        let playerNames: [String]?
        let nextMatchups: [Matchup]?
        let latestResult: String?
        let bestPlayerName: String?
        let bestPlayerDelta: Int?
        let worstPlayerName: String?
        let worstPlayerDelta: Int?
    }

    nonisolated struct Matchup: Codable, Hashable, Sendable {
        let left: String
        let right: String
        let kind: String
        let leftPlayers: [Player]?
        let rightPlayers: [Player]?

        init(
            left: String,
            right: String,
            kind: String,
            leftPlayers: [Player]? = nil,
            rightPlayers: [Player]? = nil
        ) {
            self.left = left
            self.right = right
            self.kind = kind
            self.leftPlayers = leftPlayers
            self.rightPlayers = rightPlayers
        }
    }

    nonisolated struct Player: Codable, Hashable, Sendable {
        let name: String
        let avatarURL: String?
        let elo: Int?
    }

    let sessionID: String
    let playerCount: Int
}

#if DEBUG
extension GweiloSessionActivityAttributes {
    static let preview = GweiloSessionActivityAttributes(
        sessionID: "d8ac7c11-fca8-4e1a-a559-6301a57d01f3",
        playerCount: 8
    )
}

extension GweiloSessionActivityAttributes.ContentState {
    static let previewActive = Self(
        currentRound: 3,
        totalRounds: 5,
        completedMatches: 6,
        totalMatches: 12,
        status: "active",
        headline: "Runda 3 je spremna",
        matchups: [
            .init(
                left: "Ivan",
                right: "Leo",
                kind: "SINGL",
                leftPlayers: [.init(name: "Ivan", avatarURL: nil, elo: 1584)],
                rightPlayers: [.init(name: "Leo", avatarURL: nil, elo: 1541)]
            ),
            .init(
                left: "Gara & Andrej",
                right: "Miki & Luka",
                kind: "DUBL",
                leftPlayers: [
                    .init(name: "Gara", avatarURL: nil, elo: 1512),
                    .init(name: "Andrej", avatarURL: nil, elo: 1496)
                ],
                rightPlayers: [
                    .init(name: "Miki", avatarURL: nil, elo: 1538),
                    .init(name: "Luka", avatarURL: nil, elo: 1479)
                ]
            ),
            .init(
                left: "Nikola",
                right: "Nemanja",
                kind: "SINGL",
                leftPlayers: [.init(name: "Nikola", avatarURL: nil, elo: 1507)],
                rightPlayers: [.init(name: "Nemanja", avatarURL: nil, elo: 1488)]
            )
        ],
        playerNames: [
            "Ivan", "Leo", "Gara", "Andrej", "Miki", "Luka", "Nikola", "Nemanja"
        ],
        nextMatchups: [
            .init(left: "Ivan & Miki", right: "Leo & Gara", kind: "DUBL"),
            .init(left: "Andrej", right: "Nikola", kind: "SINGL"),
            .init(left: "Luka", right: "Nemanja", kind: "SINGL")
        ],
        latestResult: "Ivan 3–1 Gara",
        bestPlayerName: nil,
        bestPlayerDelta: nil,
        worstPlayerName: nil,
        worstPlayerDelta: nil
    )

    static let previewCompleted = Self(
        currentRound: 5,
        totalRounds: 5,
        completedMatches: 12,
        totalMatches: 12,
        status: "completed",
        headline: "Termin je završen",
        matchups: [],
        playerNames: [
            "Ivan", "Leo", "Gara", "Andrej", "Miki", "Luka", "Nikola", "Nemanja"
        ],
        nextMatchups: [],
        latestResult: "Ivan 3–1 Leo",
        bestPlayerName: "Ivan",
        bestPlayerDelta: 24,
        worstPlayerName: "Leo",
        worstPlayerDelta: -18
    )
}
#endif
