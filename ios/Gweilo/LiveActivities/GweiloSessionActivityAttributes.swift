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
        let latestResult: String?
    }

    nonisolated struct Matchup: Codable, Hashable, Sendable {
        let left: String
        let right: String
        let kind: String
    }

    let sessionID: String
    let playerCount: Int
}
