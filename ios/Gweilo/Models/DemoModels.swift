import Foundation
import Combine

struct DemoPlayer: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let initials: String
    let elo: Int
    let movement: Int
    let colorSeed: Int
}

extension DemoPlayer {
    static let ivan = DemoPlayer(
        name: "Ivan",
        initials: "IV",
        elo: 1_642,
        movement: 18,
        colorSeed: 0
    )

    static let luka = DemoPlayer(
        name: "Luka",
        initials: "LU",
        elo: 1_598,
        movement: 7,
        colorSeed: 1
    )

    static let marko = DemoPlayer(
        name: "Marko",
        initials: "MA",
        elo: 1_571,
        movement: -4,
        colorSeed: 2
    )

    static let nikola = DemoPlayer(
        name: "Nikola",
        initials: "NI",
        elo: 1_533,
        movement: 12,
        colorSeed: 3
    )

    static let stefan = DemoPlayer(
        name: "Stefan",
        initials: "ST",
        elo: 1_498,
        movement: -9,
        colorSeed: 4
    )

    static let milos = DemoPlayer(
        name: "Miloš",
        initials: "MI",
        elo: 1_462,
        movement: 5,
        colorSeed: 5
    )

    static let leaderboard = [ivan, luka, marko, nikola, stefan, milos]
}

enum DemoSessionStatus: String, Hashable {
    case active = "ACTIVE"
    case completed = "COMPLETED"
}

struct DemoSession: Identifiable, Hashable {
    let id = UUID()
    let dateLabel: String
    let playerCount: Int
    let status: DemoSessionStatus
    let currentRound: Int?
    let totalRounds: Int
    let singlesMatches: Int
    let doublesMatches: Int
    let bestPlayer: String?
    let bestDelta: Int?
    let worstPlayer: String?
    let worstDelta: Int?
}

extension DemoSession {
    static let activeSixPlayer = DemoSession(
        dateLabel: "Thu, 23 Jul · 20:04",
        playerCount: 6,
        status: .active,
        currentRound: 5,
        totalRounds: 7,
        singlesMatches: 12,
        doublesMatches: 0,
        bestPlayer: nil,
        bestDelta: nil,
        worstPlayer: nil,
        worstDelta: nil
    )

    static let fivePlayer = DemoSession(
        dateLabel: "Thu, 16 Jul · 20:10",
        playerCount: 5,
        status: .completed,
        currentRound: nil,
        totalRounds: 10,
        singlesMatches: 20,
        doublesMatches: 0,
        bestPlayer: "Luka",
        bestDelta: 31,
        worstPlayer: "Marko",
        worstDelta: -24
    )

    static let fourPlayerMixed = DemoSession(
        dateLabel: "Thu, 9 Jul · 19:58",
        playerCount: 4,
        status: .completed,
        currentRound: nil,
        totalRounds: 6,
        singlesMatches: 6,
        doublesMatches: 3,
        bestPlayer: "Ivan",
        bestDelta: 22,
        worstPlayer: "Miloš",
        worstDelta: -18
    )

    static let threePlayer = DemoSession(
        dateLabel: "Sun, 5 Jul · 18:32",
        playerCount: 3,
        status: .completed,
        currentRound: nil,
        totalRounds: 3,
        singlesMatches: 3,
        doublesMatches: 0,
        bestPlayer: "Nikola",
        bestDelta: 19,
        worstPlayer: "Stefan",
        worstDelta: -16
    )

    static let all = [activeSixPlayer, fivePlayer, fourPlayerMixed, threePlayer]
}

enum DemoRankingCategory: String, CaseIterable, Identifiable {
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

struct DemoRankingEntry: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let elo: Int
    let matches: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let rankDays: Int
}

extension DemoRankingEntry {
    static let singles = [
        DemoRankingEntry(name: "Ivan", elo: 1_642, matches: 38, wins: 24, losses: 12, draws: 2, rankDays: 19),
        DemoRankingEntry(name: "Luka", elo: 1_598, matches: 42, wins: 25, losses: 15, draws: 2, rankDays: 11),
        DemoRankingEntry(name: "Marko", elo: 1_571, matches: 35, wins: 18, losses: 16, draws: 1, rankDays: 8),
        DemoRankingEntry(name: "Nikola", elo: 1_533, matches: 31, wins: 15, losses: 14, draws: 2, rankDays: 14),
        DemoRankingEntry(name: "Stefan", elo: 1_498, matches: 28, wins: 12, losses: 15, draws: 1, rankDays: 6)
    ]

    static let doublesPlayers = [
        DemoRankingEntry(name: "Luka", elo: 1_621, matches: 18, wins: 12, losses: 5, draws: 1, rankDays: 15),
        DemoRankingEntry(name: "Ivan", elo: 1_604, matches: 20, wins: 13, losses: 6, draws: 1, rankDays: 9),
        DemoRankingEntry(name: "Nikola", elo: 1_562, matches: 16, wins: 9, losses: 6, draws: 1, rankDays: 12),
        DemoRankingEntry(name: "Marko", elo: 1_519, matches: 17, wins: 8, losses: 8, draws: 1, rankDays: 7)
    ]

    static let doublesTeams = [
        DemoRankingEntry(name: "Ivan + Luka", elo: 1_655, matches: 9, wins: 7, losses: 2, draws: 0, rankDays: 22),
        DemoRankingEntry(name: "Marko + Nikola", elo: 1_584, matches: 11, wins: 7, losses: 3, draws: 1, rankDays: 13),
        DemoRankingEntry(name: "Stefan + Miloš", elo: 1_526, matches: 8, wins: 4, losses: 4, draws: 0, rankDays: 8)
    ]
}

enum DemoMatchType: String {
    case singles = "SINGLES"
    case doubles = "DOUBLES"
}

struct DemoRoundMatch: Identifiable, Hashable {
    let id: UUID
    let type: DemoMatchType
    let teamOne: String
    let teamTwo: String
    var teamOneScore: Int
    var teamTwoScore: Int
}

@MainActor
final class DemoRoundScoreboard: ObservableObject {
    @Published private(set) var matches = [
        DemoRoundMatch(
            id: UUID(),
            type: .doubles,
            teamOne: "Ivan + Luka",
            teamTwo: "Marko + Nikola",
            teamOneScore: 0,
            teamTwoScore: 0
        ),
        DemoRoundMatch(
            id: UUID(),
            type: .singles,
            teamOne: "Stefan",
            teamTwo: "Miloš",
            teamOneScore: 0,
            teamTwoScore: 0
        )
    ]
    @Published private(set) var submitted = false

    func adjust(matchID: UUID, team: Int, amount: Int) {
        guard let index = matches.firstIndex(where: { $0.id == matchID }) else {
            return
        }

        if team == 1 {
            matches[index].teamOneScore = min(99, max(0, matches[index].teamOneScore + amount))
        } else {
            matches[index].teamTwoScore = min(99, max(0, matches[index].teamTwoScore + amount))
        }
        submitted = false
    }

    func submit() {
        submitted = true
    }

    func reset() {
        for index in matches.indices {
            matches[index].teamOneScore = 0
            matches[index].teamTwoScore = 0
        }
        submitted = false
    }
}

@MainActor
final class DemoScoreboard: ObservableObject {
    @Published private(set) var homeScore = 0
    @Published private(set) var awayScore = 0
    @Published private(set) var submitted = false

    let homePlayers = [DemoPlayer.ivan, DemoPlayer.luka]
    let awayPlayers = [DemoPlayer.marko, DemoPlayer.nikola]

    func incrementHome() {
        guard homeScore < 99 else { return }
        homeScore += 1
        submitted = false
    }

    func decrementHome() {
        guard homeScore > 0 else { return }
        homeScore -= 1
        submitted = false
    }

    func incrementAway() {
        guard awayScore < 99 else { return }
        awayScore += 1
        submitted = false
    }

    func decrementAway() {
        guard awayScore > 0 else { return }
        awayScore -= 1
        submitted = false
    }

    func submit() {
        submitted = true
    }

    func reset() {
        homeScore = 0
        awayScore = 0
        submitted = false
    }
}
