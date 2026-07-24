import Foundation

enum GweiloPreferenceKey {
    static let hapticsEnabled = "gweilo.hapticsEnabled"
    static let confirmRoundSubmission = "gweilo.confirmRoundSubmission"
}

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

struct PlayerEloHistoryPoint: Identifiable, Hashable, Sendable {
    var id: Int { match }

    let match: Int
    let elo: Double
    let date: Date
    let opponent: String?
    let delta: Double?

    var performanceBand: EloPerformanceBand {
        EloPerformanceBand(delta: delta)
    }
}

enum EloPerformanceBand: String, Hashable, Sendable {
    case gain
    case steady
    case loss

    static let threshold = 5.0

    init(delta: Double?) {
        guard let delta else {
            self = .steady
            return
        }

        if delta > Self.threshold {
            self = .gain
        } else if delta < -Self.threshold {
            self = .loss
        } else {
            self = .steady
        }
    }
}

struct PlayerEloHistory: Hashable, Sendable {
    let points: [PlayerEloHistoryPoint]
    let currentElo: Double
}

struct EloChartViewport: Hashable, Sendable {
    static let minimumVisibleMatchCount = 5

    let firstMatch: Double
    let lastMatch: Double

    init(points: [PlayerEloHistoryPoint]) {
        firstMatch = Double(points.first?.match ?? 0)
        lastMatch = Double(points.last?.match ?? 0)
    }

    var totalSpan: Double {
        max(lastMatch - firstMatch, 1)
    }

    var minimumVisibleSpan: Double {
        min(
            totalSpan,
            Double(Self.minimumVisibleMatchCount - 1)
        )
    }

    func visibleSpan(
        from startingSpan: Double,
        magnification: Double
    ) -> Double {
        let safeMagnification = magnification.isFinite
            ? max(magnification, 0.01)
            : 1
        let proposedSpan = startingSpan / safeMagnification

        return min(
            totalSpan,
            max(minimumVisibleSpan, proposedSpan)
        )
    }

    func leadingPosition(
        centeredOn focus: Double,
        visibleSpan: Double
    ) -> Double {
        let clampedSpan = min(totalSpan, max(minimumVisibleSpan, visibleSpan))
        let latestLeadingPosition = max(
            firstMatch,
            lastMatch - clampedSpan
        )

        return min(
            latestLeadingPosition,
            max(firstMatch, focus - (clampedSpan / 2))
        )
    }
}

struct HeadToHeadPlayer: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?
    let elo: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let setsWon: Int
    let setsLost: Int

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

struct PlayerHeadToHead: Hashable, Sendable {
    let player: HeadToHeadPlayer
    let opponent: HeadToHeadPlayer
    let totalMatches: Int
}

struct DoublesTeamMember: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?

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

struct DoublesTeamProfile: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let playerOne: DoublesTeamMember
    let playerTwo: DoublesTeamMember
    let matches: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let setsWon: Int
    let setsLost: Int
    let elo: Int
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

enum FourPlayerSessionFormat: String, CaseIterable, Codable, Identifiable, Sendable {
    case singles
    case mixed

    var id: Self { self }

    var label: String {
        switch self {
        case .singles: "Singles only"
        case .mixed: "Singles + doubles"
        }
    }
}

struct SessionCreationPlayer: Identifiable, Hashable, Decodable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?
    let elo: Int?

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case avatarURL = "avatar"
        case elo
    }

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

struct SessionCreationDraft: Equatable, Sendable {
    var scheduledAt = Date.now
    var playerCount = 4
    var fourPlayerFormat = FourPlayerSessionFormat.mixed
    private(set) var selectedPlayers: [SessionCreationPlayer] = []

    var canPreview: Bool {
        selectedPlayers.count == playerCount
    }

    mutating func setPlayerCount(_ count: Int) {
        playerCount = min(6, max(2, count))
        if selectedPlayers.count > playerCount {
            selectedPlayers = Array(selectedPlayers.prefix(playerCount))
        }
    }

    mutating func toggle(_ player: SessionCreationPlayer) {
        if let index = selectedPlayers.firstIndex(where: { $0.id == player.id }) {
            selectedPlayers.remove(at: index)
        } else if selectedPlayers.count < playerCount {
            selectedPlayers.append(player)
        }
    }

    mutating func movePlayer(fromOffsets: IndexSet, toOffset: Int) {
        guard let source = fromOffsets.first, source < selectedPlayers.count else {
            return
        }
        let player = selectedPlayers.remove(at: source)
        let destination = source < toOffset ? toOffset - 1 : toOffset
        selectedPlayers.insert(
            player,
            at: min(max(0, destination), selectedPlayers.count)
        )
    }

    func selectionNumber(for playerID: UUID) -> Int? {
        selectedPlayers.firstIndex(where: { $0.id == playerID }).map { $0 + 1 }
    }
}

struct SessionScheduleMatch: Hashable, Decodable, Sendable {
    let type: SessionMatchType
    let players: [SessionCreationPlayer]
}

struct SessionScheduleRound: Identifiable, Hashable, Decodable, Sendable {
    let id: String
    let roundNumber: Int
    let matches: [SessionScheduleMatch]
    let isDynamic: Bool?

    var matchCount: Int { matches.count }
}

struct SessionSchedulePreview: Hashable, Decodable, Sendable {
    let playerCount: Int
    let players: [SessionCreationPlayer]
    let rounds: [SessionScheduleRound]
    let fourPlayerFormat: FourPlayerSessionFormat
}

struct CreatedSessionResult: Decodable, Sendable {
    let sessionId: UUID
    let message: String?
    let rounds: [SessionScheduleRound]

    func makeSummary(for draft: SessionCreationDraft) -> SessionSummary {
        SessionSummary(
            id: sessionId,
            createdAt: draft.scheduledAt,
            playerCount: draft.playerCount,
            status: .active,
            currentRound: 1,
            totalRounds: rounds.count,
            singlesMatches: 0,
            doublesMatches: 0,
            bestPlayer: nil,
            bestDelta: nil,
            worstPlayer: nil,
            worstDelta: nil
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

struct RoundMatchScoreSubmission: Codable, Equatable, Sendable {
    let matchId: UUID
    let team1Score: Int
    let team2Score: Int
}

struct RoundScoreDraft: Equatable, Sendable {
    struct Entry: Equatable, Sendable {
        var teamOne: Int?
        var teamTwo: Int?
    }

    private(set) var entries: [UUID: Entry]

    init(matches: [SessionMatch]) {
        entries = Dictionary(
            uniqueKeysWithValues: matches.map {
                (
                    $0.id,
                    Entry(
                        teamOne: $0.teamOneScore,
                        teamTwo: $0.teamTwoScore
                    )
                )
            }
        )
    }

    var isComplete: Bool {
        !entries.isEmpty && entries.values.allSatisfy {
            $0.teamOne != nil && $0.teamTwo != nil
        }
    }

    func score(for matchID: UUID, team: Int) -> Int? {
        team == 1
            ? entries[matchID]?.teamOne
            : entries[matchID]?.teamTwo
    }

    mutating func setScore(_ score: Int?, for matchID: UUID, team: Int) {
        guard var entry = entries[matchID] else { return }
        let normalized = score.map { min(999, max(0, $0)) }
        if team == 1 {
            entry.teamOne = normalized
        } else {
            entry.teamTwo = normalized
        }
        entries[matchID] = entry
    }

    mutating func adjustScore(for matchID: UUID, team: Int, amount: Int) {
        let current = score(for: matchID, team: team) ?? 0
        setScore(current + amount, for: matchID, team: team)
    }

    mutating func reset() {
        for matchID in entries.keys {
            entries[matchID] = Entry(teamOne: nil, teamTwo: nil)
        }
    }

    func submissions(for matches: [SessionMatch]) -> [RoundMatchScoreSubmission]? {
        guard isComplete else { return nil }
        return matches.compactMap { match in
            guard
                let entry = entries[match.id],
                let teamOne = entry.teamOne,
                let teamTwo = entry.teamTwo
            else {
                return nil
            }
            return RoundMatchScoreSubmission(
                matchId: match.id,
                team1Score: teamOne,
                team2Score: teamTwo
            )
        }
    }
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
