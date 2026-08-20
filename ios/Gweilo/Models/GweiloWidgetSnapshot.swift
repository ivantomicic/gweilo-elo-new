import Foundation

struct GweiloWidgetMatch: Codable, Hashable, Sendable {
    let opponent: String
    let score: String?
    let eloDelta: Int?
    let outcome: String?
}

struct GweiloWidgetEloPoint: Codable, Hashable, Sendable {
    let elo: Int
    let delta: Int?
}

struct GweiloWatchSessionPlayer: Codable, Hashable, Identifiable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: String?
}

struct GweiloWatchMatchup: Codable, Hashable, Identifiable, Sendable {
    let id: UUID
    let leftPlayers: [GweiloWatchSessionPlayer]
    let rightPlayers: [GweiloWatchSessionPlayer]
}

struct GweiloWatchActiveSession: Codable, Hashable, Sendable {
    let id: UUID
    let currentRound: Int
    let nextRound: Int?
    let playingNow: [GweiloWatchMatchup]
    let upNext: [GweiloWatchMatchup]
}

struct GweiloWidgetPlayer: Codable, Hashable, Sendable {
    let name: String
    let elo: Int
    let rank: Int
    let recentForm: [Int]
    let recentFormScores: [Double]?
    let recentMatches: [GweiloWidgetMatch]
    let recentElo: [Int]?
    let eloHistory: [GweiloWidgetEloPoint]?

    init(
        name: String,
        elo: Int,
        rank: Int,
        recentForm: [Int],
        recentFormScores: [Double]?,
        recentMatches: [GweiloWidgetMatch],
        recentElo: [Int]? = nil,
        eloHistory: [GweiloWidgetEloPoint]? = nil
    ) {
        self.name = name
        self.elo = elo
        self.rank = rank
        self.recentForm = recentForm
        self.recentFormScores = recentFormScores
        self.recentMatches = recentMatches
        self.recentElo = recentElo
        self.eloHistory = eloHistory
    }
}

struct GweiloWidgetStanding: Codable, Hashable, Sendable {
    let rank: Int
    let name: String
    let elo: Int
    let recentForm: [Int]
    let recentFormScores: [Double]?
    let isCurrentUser: Bool
}

struct GweiloWidgetSnapshot: Codable, Hashable, Sendable {
    nonisolated static let appGroup = "group.com.ivantomicic.gweilo"
    nonisolated static let widgetKind = "GweiloClubWidget"
    nonisolated static let watchWidgetKind = "GweiloNextMatches"
    nonisolated static let watchEloChartWidgetKind = "GweiloEloChartWidget"
    nonisolated static let watchFormWidgetKind = "GweiloFormWidget"
    nonisolated static let watchAverageFormWidgetKind =
        "GweiloAverageFormWidgetV3"
    nonisolated static let watchApplicationContextKey =
        "gweilo-player-snapshot-v1"

    let savedAt: Date
    let player: GweiloWidgetPlayer?
    let standings: [GweiloWidgetStanding]
    let activeSessionID: UUID?
    let activeSession: GweiloWatchActiveSession?

    static let empty = GweiloWidgetSnapshot(
        savedAt: .distantPast,
        player: nil,
        standings: [],
        activeSessionID: nil,
        activeSession: nil
    )

    func hasSameContent(as other: GweiloWidgetSnapshot) -> Bool {
        player == other.player
            && standings == other.standings
            && activeSessionID == other.activeSessionID
            && activeSession == other.activeSession
    }

    static let preview = GweiloWidgetSnapshot(
        savedAt: .now,
        player: GweiloWidgetPlayer(
            name: "Ivan",
            elo: 1_718,
            rank: 1,
            recentForm: [6, -3, 8, -4, 11, 3, -7],
            recentFormScores: [0.6, -0.2, 0.8, -0.4, 1, 0.3, -0.7],
            recentMatches: [
                GweiloWidgetMatch(
                    opponent: "Gara",
                    score: "3–1",
                    eloDelta: 8,
                    outcome: "win"
                ),
                GweiloWidgetMatch(
                    opponent: "Leo",
                    score: "2–3",
                    eloDelta: -4,
                    outcome: "loss"
                ),
                GweiloWidgetMatch(
                    opponent: "Miladin",
                    score: "3–0",
                    eloDelta: 11,
                    outcome: "win"
                )
            ],
            recentElo: [1_660, 1_674, 1_667, 1_691, 1_704, 1_710, 1_718],
            eloHistory: [
                GweiloWidgetEloPoint(elo: 1_660, delta: 9),
                GweiloWidgetEloPoint(elo: 1_674, delta: 14),
                GweiloWidgetEloPoint(elo: 1_667, delta: -7),
                GweiloWidgetEloPoint(elo: 1_691, delta: 24),
                GweiloWidgetEloPoint(elo: 1_704, delta: 13),
                GweiloWidgetEloPoint(elo: 1_710, delta: 6),
                GweiloWidgetEloPoint(elo: 1_718, delta: 8)
            ]
        ),
        standings: [
            GweiloWidgetStanding(
                rank: 1,
                name: "Ivan",
                elo: 1_718,
                recentForm: [8, -4, 11, 3, -7],
                recentFormScores: [0.8, -0.4, 1, 0.3, -0.7],
                isCurrentUser: true
            ),
            GweiloWidgetStanding(
                rank: 2,
                name: "Gara",
                elo: 1_626,
                recentForm: [4, 8, -7, 6, 2],
                recentFormScores: [0.8, 1, -1, 1, 0.2],
                isCurrentUser: false
            ),
            GweiloWidgetStanding(
                rank: 3,
                name: "Leo",
                elo: 1_624,
                recentForm: [-3, 7, 9, -8, 5],
                recentFormScores: [-0.6, 1, 1, -1, 1],
                isCurrentUser: false
            ),
            GweiloWidgetStanding(
                rank: 4,
                name: "Miladin",
                elo: 1_568,
                recentForm: [6, -6, 3, 8, -4],
                recentFormScores: [1, -1, 0.6, 1, -0.8],
                isCurrentUser: false
            ),
            GweiloWidgetStanding(
                rank: 5,
                name: "Andrej",
                elo: 1_495,
                recentForm: [-7, 4, -2, 6, 8],
                recentFormScores: [-1, 0.8, -0.4, 1, 1],
                isCurrentUser: false
            )
        ],
        activeSessionID: nil,
        activeSession: nil
    )
}

struct GweiloWidgetSnapshotStore: Sendable {
    private static let key = "gweilo-widget-snapshot-v1"

    func load() -> GweiloWidgetSnapshot? {
        guard
            let defaults = UserDefaults(
                suiteName: GweiloWidgetSnapshot.appGroup
            ),
            let data = defaults.data(forKey: Self.key)
        else {
            return nil
        }
        return try? JSONDecoder().decode(
            GweiloWidgetSnapshot.self,
            from: data
        )
    }

    func save(_ snapshot: GweiloWidgetSnapshot) {
        guard
            let defaults = UserDefaults(
                suiteName: GweiloWidgetSnapshot.appGroup
            ),
            let data = try? JSONEncoder().encode(snapshot)
        else {
            return
        }
        defaults.set(data, forKey: Self.key)
    }

    func clear() {
        UserDefaults(
            suiteName: GweiloWidgetSnapshot.appGroup
        )?.removeObject(forKey: Self.key)
    }
}
