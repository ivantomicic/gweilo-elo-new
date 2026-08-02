import Foundation

struct GweiloWidgetMatch: Codable, Hashable, Sendable {
    let opponent: String
    let score: String?
    let eloDelta: Int?
    let outcome: String?
}

struct GweiloWidgetPlayer: Codable, Hashable, Sendable {
    let name: String
    let elo: Int
    let rank: Int
    let recentForm: [Int]
    let recentMatches: [GweiloWidgetMatch]
}

struct GweiloWidgetStanding: Codable, Hashable, Sendable {
    let rank: Int
    let name: String
    let elo: Int
    let recentForm: [Int]
    let isCurrentUser: Bool
}

struct GweiloWidgetSnapshot: Codable, Hashable, Sendable {
    static let appGroup = "group.com.ivantomicic.gweilo"
    static let widgetKind = "GweiloClubWidget"

    let savedAt: Date
    let player: GweiloWidgetPlayer?
    let standings: [GweiloWidgetStanding]

    static let empty = GweiloWidgetSnapshot(
        savedAt: .distantPast,
        player: nil,
        standings: []
    )

    static let preview = GweiloWidgetSnapshot(
        savedAt: .now,
        player: GweiloWidgetPlayer(
            name: "Ivan",
            elo: 1_718,
            rank: 1,
            recentForm: [8, -4, 11, 3, -7],
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
            ]
        ),
        standings: [
            GweiloWidgetStanding(
                rank: 1,
                name: "Ivan",
                elo: 1_718,
                recentForm: [8, -4, 11, 3, -7],
                isCurrentUser: true
            ),
            GweiloWidgetStanding(
                rank: 2,
                name: "Gara",
                elo: 1_626,
                recentForm: [4, 8, -7, 6, 2],
                isCurrentUser: false
            ),
            GweiloWidgetStanding(
                rank: 3,
                name: "Leo",
                elo: 1_624,
                recentForm: [-3, 7, 9, -8, 5],
                isCurrentUser: false
            ),
            GweiloWidgetStanding(
                rank: 4,
                name: "Miladin",
                elo: 1_568,
                recentForm: [6, -6, 3, 8, -4],
                isCurrentUser: false
            ),
            GweiloWidgetStanding(
                rank: 5,
                name: "Andrej",
                elo: 1_495,
                recentForm: [-7, 4, -2, 6, 8],
                isCurrentUser: false
            )
        ]
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
