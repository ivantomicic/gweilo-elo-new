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
    let outcome: MatchOutcome?
    let scoreFor: Int?
    let scoreAgainst: Int?

    init(
        match: Int,
        elo: Double,
        date: Date,
        opponent: String?,
        delta: Double?,
        outcome: MatchOutcome? = nil,
        scoreFor: Int? = nil,
        scoreAgainst: Int? = nil
    ) {
        self.match = match
        self.elo = elo
        self.date = date
        self.opponent = opponent
        self.delta = delta
        self.outcome = outcome
        self.scoreFor = scoreFor
        self.scoreAgainst = scoreAgainst
    }

    var performanceBand: EloPerformanceBand {
        EloPerformanceBand(delta: delta)
    }

    var resolvedOutcome: MatchOutcome? {
        if let outcome {
            return outcome
        }
        guard let scoreFor, let scoreAgainst else {
            return nil
        }
        if scoreFor > scoreAgainst {
            return .win
        }
        if scoreFor < scoreAgainst {
            return .loss
        }
        return .draw
    }

    var formattedScore: String? {
        guard let scoreFor, let scoreAgainst else {
            return nil
        }
        return "\(scoreFor)–\(scoreAgainst)"
    }
}

enum MatchOutcome: String, Hashable, Sendable {
    case win
    case loss
    case draw

    var shortLabel: String {
        switch self {
        case .win: "W"
        case .loss: "L"
        case .draw: "D"
        }
    }

    var label: String {
        switch self {
        case .win: "Win"
        case .loss: "Loss"
        case .draw: "Draw"
        }
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

struct EloCurveSample: Identifiable, Hashable, Sendable {
    let id: Int
    let match: Double
    let elo: Double
}

struct EloCurveSegment: Identifiable, Hashable, Sendable {
    let id: Int
    let performanceBand: EloPerformanceBand
    let samples: [EloCurveSample]
}

enum EloCurveSampler {
    static let defaultSamplesPerSegment = 6

    static func segments(
        points: [PlayerEloHistoryPoint],
        samplesPerSegment: Int = defaultSamplesPerSegment
    ) -> [EloCurveSegment] {
        let orderedPoints = points.sorted { $0.match < $1.match }
        guard orderedPoints.count > 1 else { return [] }

        let xValues = orderedPoints.map { Double($0.match) }
        let yValues = orderedPoints.map(\.elo)
        let tangents = monotoneTangents(x: xValues, y: yValues)
        let sampleCount = max(samplesPerSegment, 1)

        return orderedPoints.indices.dropLast().map { index in
            let nextIndex = index + 1
            let x0 = xValues[index]
            let x1 = xValues[nextIndex]
            let y0 = yValues[index]
            let y1 = yValues[nextIndex]
            let interval = max(x1 - x0, .leastNonzeroMagnitude)
            let lowerBound = min(y0, y1)
            let upperBound = max(y0, y1)

            let samples = (0...sampleCount).map { step in
                let progress = Double(step) / Double(sampleCount)
                let progressSquared = progress * progress
                let progressCubed = progressSquared * progress
                let startValueWeight =
                    (2 * progressCubed) - (3 * progressSquared) + 1
                let startTangentWeight =
                    progressCubed - (2 * progressSquared) + progress
                let endValueWeight =
                    (-2 * progressCubed) + (3 * progressSquared)
                let endTangentWeight = progressCubed - progressSquared
                let interpolatedElo =
                    (startValueWeight * y0)
                    + (startTangentWeight * interval * tangents[index])
                    + (endValueWeight * y1)
                    + (endTangentWeight * interval * tangents[nextIndex])

                return EloCurveSample(
                    id: step,
                    match: x0 + (interval * progress),
                    elo: min(upperBound, max(lowerBound, interpolatedElo))
                )
            }

            return EloCurveSegment(
                id: orderedPoints[nextIndex].match,
                performanceBand: orderedPoints[nextIndex].performanceBand,
                samples: samples
            )
        }
    }

    private static func monotoneTangents(
        x: [Double],
        y: [Double]
    ) -> [Double] {
        let intervalCount = y.count - 1
        let secants = (0..<intervalCount).map { index in
            let interval = max(
                x[index + 1] - x[index],
                .leastNonzeroMagnitude
            )
            return (y[index + 1] - y[index]) / interval
        }

        var tangents = Array(repeating: 0.0, count: y.count)
        tangents[0] = secants[0]
        tangents[y.count - 1] = secants[intervalCount - 1]

        if y.count > 2 {
            for index in 1..<(y.count - 1) {
                let previous = secants[index - 1]
                let next = secants[index]
                tangents[index] = previous * next <= 0
                    ? 0
                    : (previous + next) / 2
            }
        }

        for index in 0..<intervalCount {
            let secant = secants[index]
            guard secant != 0 else {
                tangents[index] = 0
                tangents[index + 1] = 0
                continue
            }

            let startRatio = tangents[index] / secant
            let endRatio = tangents[index + 1] / secant
            let magnitude = hypot(startRatio, endRatio)
            guard magnitude > 3 else { continue }

            let scale = 3 / magnitude
            tangents[index] = scale * startRatio * secant
            tangents[index + 1] = scale * endRatio * secant
        }

        return tangents
    }
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
