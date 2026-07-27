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
    }

    let sessionID: String
    let playerCount: Int
}
