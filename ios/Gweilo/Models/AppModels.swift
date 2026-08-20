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

    var displayName: String {
        switch self {
        case .singles:
            "Singlovi"
        case .doublesPlayers:
            "Dublovi"
        case .doublesTeams:
            "Timovi"
        }
    }
}

struct RankingEligibilityRule: Codable, Hashable, Sendable {
    let minimumMatches: Int
    let maximumInactivityDays: Int
}

struct RankingEligibility: Codable, Hashable, Sendable {
    let singles: RankingEligibilityRule
    let doublesPlayers: RankingEligibilityRule
    let doublesTeams: RankingEligibilityRule

    static let fallback = RankingEligibility(
        singles: RankingEligibilityRule(
            minimumMatches: 15,
            maximumInactivityDays: 28
        ),
        doublesPlayers: RankingEligibilityRule(
            minimumMatches: 6,
            maximumInactivityDays: 56
        ),
        doublesTeams: RankingEligibilityRule(
            minimumMatches: 6,
            maximumInactivityDays: 56
        )
    )

    func rule(for category: RankingCategory) -> RankingEligibilityRule {
        switch category {
        case .singles: singles
        case .doublesPlayers: doublesPlayers
        case .doublesTeams: doublesTeams
        }
    }
}

struct RankingEntry: Identifiable, Hashable, Codable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?
    let elo: Int
    let matches: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let rankDays: Int?
    let recentForm: [Double]
    let recentFormScores: [Double]?

    init(
        id: UUID,
        name: String,
        avatarURL: URL?,
        elo: Int,
        matches: Int,
        wins: Int,
        losses: Int,
        draws: Int,
        rankDays: Int?,
        recentForm: [Double] = [],
        recentFormScores: [Double]? = nil
    ) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.elo = elo
        self.matches = matches
        self.wins = wins
        self.losses = losses
        self.draws = draws
        self.rankDays = rankDays
        self.recentForm = recentForm
        self.recentFormScores = recentFormScores
    }

    var resolvedRecentFormScores: [Double] {
        guard
            let recentFormScores,
            recentFormScores.count == recentForm.count
        else {
            return recentForm.map(FormPerformanceScore.fallback(for:))
        }
        return recentFormScores
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

struct PlayerEloHistoryPoint: Identifiable, Hashable, Sendable {
    var id: Int { match }

    let match: Int
    let elo: Double
    let date: Date
    let opponent: String?
    let opponentID: UUID?
    let delta: Double?
    let outcome: MatchOutcome?
    let scoreFor: Int?
    let scoreAgainst: Int?

    init(
        match: Int,
        elo: Double,
        date: Date,
        opponent: String?,
        opponentID: UUID? = nil,
        delta: Double?,
        outcome: MatchOutcome? = nil,
        scoreFor: Int? = nil,
        scoreAgainst: Int? = nil
    ) {
        self.match = match
        self.elo = elo
        self.date = date
        self.opponent = opponent
        self.opponentID = opponentID
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
        case .win: "P"
        case .loss: "I"
        case .draw: "N"
        }
    }

    var label: String {
        switch self {
        case .win: "Pobeda"
        case .loss: "Poraz"
        case .draw: "Nerešeno"
        }
    }
}

enum EloPerformanceBand: String, Hashable, Sendable {
    case gain
    case steady
    case loss

    static let threshold = 5.0
    static let formThreshold = 0.3

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

    init(formScore: Double?) {
        guard let formScore else {
            self = .steady
            return
        }

        if formScore >= Self.formThreshold {
            self = .gain
        } else if formScore <= -Self.formThreshold {
            self = .loss
        } else {
            self = .steady
        }
    }
}

enum FormPerformanceScore {
    static func fallback(for eloDelta: Double) -> Double {
        min(1, max(-1, eloDelta / 5))
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

    static func adaptiveSamplesPerSegment(
        pointCount: Int,
        sampleBudget: Int = 360
    ) -> Int {
        let segmentCount = max(pointCount - 1, 1)
        return max(
            1,
            min(
                defaultSamplesPerSegment,
                (sampleBudget / segmentCount) - 1
            )
        )
    }

    static func downsample(
        points: [PlayerEloHistoryPoint],
        maxPointCount: Int = 180
    ) -> [PlayerEloHistoryPoint] {
        let limit = max(maxPointCount, 2)
        guard points.count > limit else { return points }

        let bucketSize = Double(points.count - 2) / Double(limit - 2)
        var sampled = [points[0]]
        var selectedIndex = 0

        for bucket in 0..<(limit - 2) {
            let averageStart = min(
                Int(floor(Double(bucket + 1) * bucketSize)) + 1,
                points.count - 1
            )
            let averageEnd = min(
                Int(floor(Double(bucket + 2) * bucketSize)) + 1,
                points.count
            )
            let averageRange = points[averageStart..<averageEnd]
            let averageMatch = averageRange.isEmpty
                ? Double(points.last?.match ?? 0)
                : averageRange.reduce(0) { $0 + Double($1.match) }
                    / Double(averageRange.count)
            let averageElo = averageRange.isEmpty
                ? points.last?.elo ?? 0
                : averageRange.reduce(0) { $0 + $1.elo }
                    / Double(averageRange.count)

            let rangeStart = min(
                Int(floor(Double(bucket) * bucketSize)) + 1,
                points.count - 2
            )
            let rangeEnd = min(
                max(
                    Int(floor(Double(bucket + 1) * bucketSize)) + 1,
                    rangeStart + 1
                ),
                points.count - 1
            )
            let selected = points[selectedIndex]
            var largestArea = -Double.infinity
            var nextSelectedIndex = rangeStart

            for candidateIndex in rangeStart..<rangeEnd {
                let candidate = points[candidateIndex]
                let area = abs(
                    (Double(selected.match) - averageMatch)
                        * (candidate.elo - selected.elo)
                        - (Double(selected.match) - Double(candidate.match))
                        * (averageElo - selected.elo)
                )
                if area > largestArea {
                    largestArea = area
                    nextSelectedIndex = candidateIndex
                }
            }

            sampled.append(points[nextSelectedIndex])
            selectedIndex = nextSelectedIndex
        }
        sampled.append(points[points.count - 1])
        return sampled
    }

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

struct SessionSummary: Identifiable, Hashable, Codable, Sendable {
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
        case .singles: "Samo singlovi"
        case .mixed: "Singlovi + dublovi"
        }
    }
}

struct SessionCreationPlayer: Identifiable, Hashable, Codable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?
    let elo: Int?
    let isPlaceholder: Bool

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case avatarURL = "avatar"
        case elo
        case isPlaceholder
    }

    nonisolated init(
        id: UUID,
        name: String,
        avatarURL: URL?,
        elo: Int?,
        isPlaceholder: Bool = false
    ) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.elo = elo
        self.isPlaceholder = isPlaceholder
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        avatarURL = try container.decodeIfPresent(URL.self, forKey: .avatarURL)
        elo = try container.decodeIfPresent(Int.self, forKey: .elo)
        isPlaceholder = try container.decodeIfPresent(
            Bool.self,
            forKey: .isPlaceholder
        ) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(avatarURL, forKey: .avatarURL)
        try container.encodeIfPresent(elo, forKey: .elo)
        try container.encode(isPlaceholder, forKey: .isPlaceholder)
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

enum EloCalculatorResult: String, CaseIterable, Hashable, Sendable {
    case win
    case draw
    case loss

    var label: String {
        switch self {
        case .win: "Pobeda"
        case .draw: "Nerešeno"
        case .loss: "Poraz"
        }
    }

    var shortLabel: String {
        switch self {
        case .win: "P"
        case .draw: "N"
        case .loss: "I"
        }
    }

    nonisolated var actualScore: Double {
        switch self {
        case .win: 1
        case .draw: 0.5
        case .loss: 0
        }
    }
}

struct EloCalculatorPlayer: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let avatarURL: URL?
    let elo: Double
    let matchesPlayed: Int

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

enum EloCalculator {
    nonisolated static func kFactor(matchesPlayed: Int) -> Double {
        if matchesPlayed < 10 {
            40
        } else if matchesPlayed < 40 {
            32
        } else {
            24
        }
    }

    nonisolated static func expectedScore(
        playerElo: Double,
        opponentElo: Double
    ) -> Double {
        1 / (1 + pow(10, (opponentElo - playerElo) / 400))
    }

    nonisolated static func delta(
        playerElo: Double,
        opponentElo: Double,
        result: EloCalculatorResult,
        matchesPlayed: Int
    ) -> Double {
        let expected = expectedScore(
            playerElo: playerElo,
            opponentElo: opponentElo
        )
        return kFactor(matchesPlayed: matchesPlayed)
            * (result.actualScore - expected)
    }
}

struct SessionCreationDraft: Equatable, Sendable {
    let idempotencyKey = UUID()
    var playerCount = 4
    var fourPlayerFormat = FourPlayerSessionFormat.mixed
    var sixPlayerFormat = FourPlayerSessionFormat.mixed
    private(set) var selectedPlayers: [SessionCreationPlayer] = []

    var canPreview: Bool {
        selectedPlayers.count == playerCount
    }

    var selectedFormat: FourPlayerSessionFormat {
        playerCount == 6 ? sixPlayerFormat : fourPlayerFormat
    }

    var usesDoublesTeams: Bool {
        playerCount == 6 && sixPlayerFormat == .mixed
    }

    var keepsMixedScheduleOrder: Bool {
        (playerCount == 4 && fourPlayerFormat == .mixed)
            || usesDoublesTeams
    }

    var doublesTeams: [[SessionCreationPlayer]] {
        guard usesDoublesTeams else { return [] }
        return (0..<3).map { teamIndex in
            players(inDoublesTeam: teamIndex)
        }
    }

    func players(inDoublesTeam teamIndex: Int) -> [SessionCreationPlayer] {
        guard usesDoublesTeams, (0..<3).contains(teamIndex) else { return [] }
        return Array(
            selectedPlayers
                .dropFirst(teamIndex * 2)
                .prefix(2)
        )
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

    mutating func addPlaceholder(named rawName: String) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !name.isEmpty,
            name.count <= 80,
            selectedPlayers.count < playerCount
        else { return }
        selectedPlayers.append(
            SessionCreationPlayer(
                id: UUID(),
                name: name,
                avatarURL: nil,
                elo: nil,
                isPlaceholder: true
            )
        )
    }

    mutating func removeSelectedPlayer(at index: Int) {
        guard selectedPlayers.indices.contains(index) else { return }
        selectedPlayers.remove(at: index)
    }

    func selectionNumber(for playerID: UUID) -> Int? {
        selectedPlayers.firstIndex(where: { $0.id == playerID }).map { $0 + 1 }
    }
}

struct SessionScheduleMatch: Hashable, Codable, Sendable {
    let type: SessionMatchType
    let players: [SessionCreationPlayer]
}

struct SessionScheduleDynamicNote: Hashable, Codable, Sendable {
    let title: String
    let description: String
}

struct SessionScheduleRound: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let roundNumber: Int
    let matches: [SessionScheduleMatch]
    let isDynamic: Bool?
    let dynamicNote: SessionScheduleDynamicNote?

    init(
        id: String,
        roundNumber: Int,
        matches: [SessionScheduleMatch],
        isDynamic: Bool?,
        dynamicNote: SessionScheduleDynamicNote? = nil
    ) {
        self.id = id
        self.roundNumber = roundNumber
        self.matches = matches
        self.isDynamic = isDynamic
        self.dynamicNote = dynamicNote
    }

    var matchCount: Int { matches.count }
}

struct SessionSchedulePreview: Hashable, Codable, Sendable {
    let playerCount: Int
    let players: [SessionCreationPlayer]
    let rounds: [SessionScheduleRound]
    let fourPlayerFormat: FourPlayerSessionFormat
}

enum SessionScheduleRandomizer {
    static func preservingFixedTeams(
        in preview: SessionSchedulePreview
    ) -> SessionSchedulePreview {
        switch preview.playerCount {
        case 4:
            randomizeFourPlayerPreview(preview)
        case 6:
            randomizeSixPlayerPreview(preview)
        default:
            preview
        }
    }

    private static func randomizeFourPlayerPreview(
        _ preview: SessionSchedulePreview
    ) -> SessionSchedulePreview {
        guard preview.players.count == 4 else { return preview }

        let fixedDoublesRounds = preview.rounds.filter {
            $0.roundNumber >= 4
        }
        let currentSignature = scheduleSignature(
            preview.rounds.filter { $0.roundNumber <= 3 }
        )

        for _ in 0..<8 {
            let shuffledPlayers = preview.players.shuffled()
            let singlesRounds = fourPlayerSinglesRounds(
                players: shuffledPlayers
            )
            guard scheduleSignature(singlesRounds) != currentSignature else {
                continue
            }

            return SessionSchedulePreview(
                playerCount: preview.playerCount,
                players: preview.players,
                rounds: singlesRounds + fixedDoublesRounds,
                fourPlayerFormat: preview.fourPlayerFormat
            )
        }

        return preview
    }

    private static func randomizeSixPlayerPreview(
        _ preview: SessionSchedulePreview
    ) -> SessionSchedulePreview {
        guard preview.players.count == 6 else { return preview }

        let fixedMixedRounds = preview.rounds.filter {
            $0.roundNumber >= 5
        }
        let partnerMatchups = singlesMatchups(in: fixedMixedRounds)
        let currentSignature = scheduleSignature(
            preview.rounds.filter { $0.roundNumber <= 4 }
        )
        let fixedTeams = stride(from: 0, to: 6, by: 2).map {
            Array(preview.players[$0...($0 + 1)])
        }

        for _ in 0..<12 {
            let shuffledPlayers = fixedTeams
                .shuffled()
                .flatMap { team in
                    Bool.random() ? team : Array(team.reversed())
                }
            let singlesRounds = sixPlayerSinglesRounds(
                players: shuffledPlayers
            )

            guard singlesMatchups(in: singlesRounds).isDisjoint(
                with: partnerMatchups
            ), scheduleSignature(singlesRounds) != currentSignature else {
                continue
            }

            return SessionSchedulePreview(
                playerCount: preview.playerCount,
                players: preview.players,
                rounds: singlesRounds + fixedMixedRounds,
                fourPlayerFormat: preview.fourPlayerFormat
            )
        }

        return preview
    }

    private static func fourPlayerSinglesRounds(
        players: [SessionCreationPlayer]
    ) -> [SessionScheduleRound] {
        guard players.count == 4 else { return [] }
        let a = players[0]
        let b = players[1]
        let c = players[2]
        let d = players[3]

        return [
            makeRound(1, singles: [(a, b), (c, d)]),
            makeRound(2, singles: [(a, c), (b, d)]),
            makeRound(3, singles: [(a, d), (b, c)])
        ]
    }

    private static func sixPlayerSinglesRounds(
        players: [SessionCreationPlayer]
    ) -> [SessionScheduleRound] {
        guard players.count == 6 else { return [] }
        let a = players[0]
        let b = players[1]
        let c = players[2]
        let d = players[3]
        let e = players[4]
        let f = players[5]

        return [
            makeRound(1, singles: [(a, c), (b, e), (d, f)]),
            makeRound(2, singles: [(a, d), (b, f), (c, e)]),
            makeRound(3, singles: [(a, e), (b, d), (c, f)]),
            makeRound(4, singles: [(a, f), (b, c), (d, e)])
        ]
    }

    private static func makeRound(
        _ number: Int,
        singles: [(SessionCreationPlayer, SessionCreationPlayer)]
    ) -> SessionScheduleRound {
        SessionScheduleRound(
            id: String(number),
            roundNumber: number,
            matches: singles.map { players in
                SessionScheduleMatch(
                    type: .singles,
                    players: [players.0, players.1]
                )
            },
            isDynamic: nil
        )
    }

    private static func singlesMatchups(
        in rounds: [SessionScheduleRound]
    ) -> Set<String> {
        Set(
            rounds
                .flatMap(\.matches)
                .filter { $0.type == .singles && $0.players.count == 2 }
                .map { match in
                    match.players
                        .map { $0.id.uuidString.lowercased() }
                        .sorted()
                        .joined(separator: ":")
                }
        )
    }

    private static func scheduleSignature(
        _ rounds: [SessionScheduleRound]
    ) -> String {
        rounds
            .sorted { $0.roundNumber < $1.roundNumber }
            .map { round in
                round.matches
                    .map { match in
                        match.players
                            .map { $0.id.uuidString.lowercased() }
                            .joined(separator: ":")
                    }
                    .joined(separator: "|")
            }
            .joined(separator: "/")
    }
}

struct CreatedSessionResult: Decodable, Sendable {
    let sessionId: UUID
    let message: String?
    let rounds: [SessionScheduleRound]

    func makeSummary(for draft: SessionCreationDraft) -> SessionSummary {
        SessionSummary(
            id: sessionId,
            createdAt: .now,
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

struct SessionPlayerPerformance: Identifiable, Hashable, Sendable {
    let playerID: UUID
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let eloBefore: Double?
    let eloAfter: Double?
    let eloChange: Double?

    var id: UUID { playerID }
}

struct SessionTeamPerformance: Identifiable, Hashable, Sendable {
    let id: UUID
    let playerOneID: UUID
    let playerTwoID: UUID
    let playerOneName: String
    let playerTwoName: String
    let playerOneAvatarURL: URL?
    let playerTwoAvatarURL: URL?
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let eloBefore: Double
    let eloAfter: Double
    let eloChange: Double

    var name: String {
        "\(playerOneName) + \(playerTwoName)"
    }
}

enum SessionMatchType: String, Codable, Hashable, Sendable {
    case singles
    case doubles

    var label: String {
        switch self {
        case .singles: "SINGL"
        case .doubles: "DUBL"
        }
    }
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
    let eloPrediction: MatchEloPrediction?
    let isRated: Bool

    nonisolated init(
        id: UUID,
        roundNumber: Int,
        type: SessionMatchType,
        order: Int,
        playerIDs: [UUID],
        isCompleted: Bool,
        teamOneScore: Int?,
        teamTwoScore: Int?,
        eloPrediction: MatchEloPrediction? = nil,
        isRated: Bool = true
    ) {
        self.id = id
        self.roundNumber = roundNumber
        self.type = type
        self.order = order
        self.playerIDs = playerIDs
        self.isCompleted = isCompleted
        self.teamOneScore = teamOneScore
        self.teamTwoScore = teamTwoScore
        self.eloPrediction = eloPrediction
        self.isRated = isRated
    }
}

struct RoundMatchScoreSubmission: Codable, Equatable, Sendable {
    let matchId: UUID
    let team1Score: Int
    let team2Score: Int
}

struct EloSidePrediction: Codable, Hashable, Sendable {
    let rating: Double
    let win: Double
    let draw: Double
    let loss: Double
}

struct MatchEloPrediction: Codable, Hashable, Sendable {
    let matchId: UUID
    let ratingType: String
    let team1: EloSidePrediction
    let team2: EloSidePrediction
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

enum SessionRoundSelectionResolver {
    static func resolve(
        previousSelection: Int?,
        previousCurrentRound: Int?,
        loadedCurrentRound: Int?,
        availableRounds: [Int]
    ) -> Int? {
        let availableRounds = Set(availableRounds)
        let fallback = loadedCurrentRound ?? availableRounds.min()

        if previousSelection == nil {
            return fallback
        }

        if previousSelection == previousCurrentRound,
           loadedCurrentRound != previousCurrentRound {
            return fallback
        }

        if let previousSelection,
           availableRounds.contains(previousSelection) {
            return previousSelection
        }

        return fallback
    }
}

struct SessionPlayerEloSnapshot: Hashable, Sendable {
    let matchID: UUID
    let playerID: UUID
    let elo: Double
}

struct SessionDetail: Hashable, Sendable {
    let session: SessionSummary
    let participants: [SessionParticipant]
    let singlesPerformance: [SessionPlayerPerformance]
    let doublesPlayerPerformance: [SessionPlayerPerformance]
    let doublesTeamPerformance: [SessionTeamPerformance]
    let rounds: [SessionRound]
    let playerEloSnapshots: [SessionPlayerEloSnapshot]

    init(
        session: SessionSummary,
        participants: [SessionParticipant],
        singlesPerformance: [SessionPlayerPerformance],
        doublesPlayerPerformance: [SessionPlayerPerformance],
        doublesTeamPerformance: [SessionTeamPerformance],
        rounds: [SessionRound],
        playerEloSnapshots: [SessionPlayerEloSnapshot] = []
    ) {
        self.session = session
        self.participants = participants
        self.singlesPerformance = singlesPerformance
        self.doublesPlayerPerformance = doublesPlayerPerformance
        self.doublesTeamPerformance = doublesTeamPerformance
        self.rounds = rounds
        self.playerEloSnapshots = playerEloSnapshots
    }

    func participant(for playerID: UUID) -> SessionParticipant? {
        participants.first { $0.id == playerID }
    }

    func name(for playerID: UUID) -> String {
        participant(for: playerID)?.name ?? "Nepoznat igrač"
    }

    func teamNames(for playerIDs: [UUID]) -> (String, String) {
        if playerIDs.count >= 4 {
            return (
                playerIDs.prefix(2).map(name(for:)).joined(separator: " + "),
                playerIDs.dropFirst(2).prefix(2).map(name(for:)).joined(separator: " + ")
            )
        }

        return (
            playerIDs.first.map(name(for:)) ?? "Nepoznat igrač",
            playerIDs.dropFirst().first.map(name(for:)) ?? "Nepoznat igrač"
        )
    }

    func playerProfileResult(
        for match: SessionMatch,
        selectedPlayerID: UUID,
        eloAfter: Double?,
        eloDelta: Double?
    ) -> PlayerEloHistoryPoint {
        let sideSize = match.type == .doubles ? 2 : 1
        let teamOneIDs = Array(match.playerIDs.prefix(sideSize))
        let teamTwoIDs = Array(
            match.playerIDs.dropFirst(sideSize).prefix(sideSize)
        )
        let selectedIsOnTeamTwo = teamTwoIDs.contains(selectedPlayerID)
            && !teamOneIDs.contains(selectedPlayerID)
        let opponentIDs = selectedIsOnTeamTwo ? teamOneIDs : teamTwoIDs
        let playerScore = selectedIsOnTeamTwo
            ? match.teamTwoScore
            : match.teamOneScore
        let opponentScore = selectedIsOnTeamTwo
            ? match.teamOneScore
            : match.teamTwoScore
        let opponent = opponentIDs
            .map(name(for:))
            .joined(separator: " + ")

        let outcome: MatchOutcome?
        if let playerScore, let opponentScore {
            if playerScore > opponentScore {
                outcome = .win
            } else if playerScore < opponentScore {
                outcome = .loss
            } else {
                outcome = .draw
            }
        } else {
            outcome = nil
        }

        return PlayerEloHistoryPoint(
            match: match.roundNumber * 100 + match.order,
            elo: eloAfter ?? 0,
            date: session.createdAt,
            opponent: opponent.isEmpty ? nil : opponent,
            opponentID: opponentIDs.count == 1 ? opponentIDs.first : nil,
            delta: eloDelta,
            outcome: outcome,
            scoreFor: playerScore,
            scoreAgainst: opponentScore
        )
    }

    func playerProfileResults(
        for displayedMatches: [SessionMatch],
        selectedPlayerID: UUID
    ) -> [UUID: PlayerEloHistoryPoint] {
        let snapshotEloByMatchID = Dictionary(
            uniqueKeysWithValues: playerEloSnapshots
                .filter { $0.playerID == selectedPlayerID }
                .map { ($0.matchID, $0.elo) }
        )
        let deltasByMatchID = committedEloDeltas(
            selectedPlayerID: selectedPlayerID,
            snapshotEloByMatchID: snapshotEloByMatchID
        )

        return Dictionary(
            uniqueKeysWithValues: displayedMatches.map { match in
                let fallbackElo = performance(
                    for: selectedPlayerID,
                    type: match.type
                )?.eloAfter
                return (
                    match.id,
                    playerProfileResult(
                        for: match,
                        selectedPlayerID: selectedPlayerID,
                        eloAfter: snapshotEloByMatchID[match.id] ?? fallbackElo,
                        eloDelta: deltasByMatchID[match.id]
                    )
                )
            }
        )
    }

    private func committedEloDeltas(
        selectedPlayerID: UUID,
        snapshotEloByMatchID: [UUID: Double]
    ) -> [UUID: Double] {
        var runningElo: [SessionMatchType: Double] = [:]
        if let singlesElo = performance(
            for: selectedPlayerID,
            type: .singles
        )?.eloBefore {
            runningElo[.singles] = singlesElo
        }
        if let doublesElo = performance(
            for: selectedPlayerID,
            type: .doubles
        )?.eloBefore {
            runningElo[.doubles] = doublesElo
        }

        var deltasByMatchID: [UUID: Double] = [:]
        for match in rounds
            .sorted(by: { $0.number < $1.number })
            .flatMap({ round in
                round.matches.sorted { $0.order < $1.order }
            })
        where match.playerIDs.contains(selectedPlayerID) {
            guard let eloAfter = snapshotEloByMatchID[match.id] else {
                continue
            }
            if let eloBefore = runningElo[match.type] {
                deltasByMatchID[match.id] = eloAfter - eloBefore
            }
            runningElo[match.type] = eloAfter
        }
        return deltasByMatchID
    }

    private func performance(
        for playerID: UUID,
        type: SessionMatchType
    ) -> SessionPlayerPerformance? {
        let performances = type == .singles
            ? singlesPerformance
            : doublesPlayerPerformance
        return performances.first { $0.playerID == playerID }
    }
}

struct SessionPairedHalfScore: Hashable, Sendable {
    let roundNumber: Int
    let teamOneScore: Int
    let teamTwoScore: Int
}

struct SessionMatchEditContext: Identifiable, Hashable, Sendable {
    var id: UUID { match.id }

    let sessionID: UUID
    let match: SessionMatch
    let teamOneName: String
    let teamTwoName: String
    let pairedFirstHalfScore: SessionPairedHalfScore?

    init?(displayedMatch: SessionMatch, detail: SessionDetail) {
        guard let storedMatch = detail.rounds
            .lazy
            .flatMap(\.matches)
            .first(where: { $0.id == displayedMatch.id })
        else {
            return nil
        }

        let names = detail.teamNames(for: storedMatch.playerIDs)
        sessionID = detail.session.id
        match = storedMatch
        teamOneName = names.0
        teamTwoName = names.1
        pairedFirstHalfScore = SessionHalfResultGrouper.pairedFirstHalfScore(
            for: storedMatch,
            playerCount: detail.session.playerCount,
            rounds: detail.rounds
        )
    }

    func combinedScore(
        teamOneScore: Int,
        teamTwoScore: Int
    ) -> (teamOne: Int, teamTwo: Int) {
        guard let pairedFirstHalfScore else {
            return (teamOneScore, teamTwoScore)
        }
        return (
            pairedFirstHalfScore.teamOneScore + teamOneScore,
            pairedFirstHalfScore.teamTwoScore + teamTwoScore
        )
    }
}

enum SessionHalfResultGrouper {
    private struct Configuration {
        let halfRoundCount: Int
        let matchesPerRound: Int
    }

    static func groupedMatches(
        playerCount: Int,
        rounds: [SessionRound]
    ) -> [SessionMatch]? {
        guard let configuration = configuration(for: playerCount) else {
            return nil
        }

        let expectedRoundCount = configuration.halfRoundCount * 2
        let roundsByNumber = Dictionary(grouping: rounds, by: \.number)
        guard roundsByNumber.count == expectedRoundCount,
              Set(roundsByNumber.keys) == Set(1...expectedRoundCount)
        else {
            return nil
        }

        for roundNumber in 1...expectedRoundCount {
            guard let round = roundsByNumber[roundNumber]?.only,
                  round.matches.count == configuration.matchesPerRound,
                  round.matches.allSatisfy({
                      $0.type == .singles && $0.playerIDs.count == 2
                  })
            else {
                return nil
            }
        }

        for firstRoundNumber in 1...configuration.halfRoundCount {
            guard
                let firstRound = roundsByNumber[firstRoundNumber]?.only,
                let secondRound = roundsByNumber[
                    firstRoundNumber + configuration.halfRoundCount
                ]?.only
            else {
                return nil
            }

            for firstMatch in firstRound.matches {
                guard secondRound.matches.contains(where: {
                    $0.order == firstMatch.order
                        && pairKey($0.playerIDs) == pairKey(firstMatch.playerIDs)
                }) else {
                    return nil
                }
            }
        }

        return rounds
            .sorted { $0.number < $1.number }
            .flatMap { round in
                round.matches
                    .sorted { $0.order < $1.order }
                    .compactMap { match in
                        displayMatch(
                            match,
                            roundsByNumber: roundsByNumber,
                            configuration: configuration
                        )
                    }
            }
    }

    static func pairedFirstHalfScore(
        for settlementMatch: SessionMatch,
        playerCount: Int,
        rounds: [SessionRound]
    ) -> SessionPairedHalfScore? {
        guard
            let configuration = configuration(for: playerCount),
            settlementMatch.type == .singles,
            settlementMatch.roundNumber > configuration.halfRoundCount
        else {
            return nil
        }

        let firstHalfRoundNumber =
            settlementMatch.roundNumber - configuration.halfRoundCount
        guard
            let firstHalfMatch = rounds
                .first(where: { $0.number == firstHalfRoundNumber })?
                .matches
                .first(where: {
                    $0.order == settlementMatch.order
                        && pairKey($0.playerIDs) == pairKey(settlementMatch.playerIDs)
                }),
            let firstTeamOneScore = firstHalfMatch.teamOneScore,
            let firstTeamTwoScore = firstHalfMatch.teamTwoScore
        else {
            return nil
        }

        if firstHalfMatch.playerIDs == settlementMatch.playerIDs {
            return SessionPairedHalfScore(
                roundNumber: firstHalfRoundNumber,
                teamOneScore: firstTeamOneScore,
                teamTwoScore: firstTeamTwoScore
            )
        }
        if firstHalfMatch.playerIDs == Array(settlementMatch.playerIDs.reversed()) {
            return SessionPairedHalfScore(
                roundNumber: firstHalfRoundNumber,
                teamOneScore: firstTeamTwoScore,
                teamTwoScore: firstTeamOneScore
            )
        }
        return nil
    }

    private static func configuration(
        for playerCount: Int
    ) -> Configuration? {
        switch playerCount {
        case 4:
            Configuration(halfRoundCount: 3, matchesPerRound: 2)
        case 5:
            Configuration(halfRoundCount: 5, matchesPerRound: 2)
        case 6:
            Configuration(halfRoundCount: 5, matchesPerRound: 3)
        default:
            nil
        }
    }

    private static func displayMatch(
        _ match: SessionMatch,
        roundsByNumber: [Int: [SessionRound]],
        configuration: Configuration
    ) -> SessionMatch? {
        if match.roundNumber <= configuration.halfRoundCount {
            let settlementRoundNumber =
                match.roundNumber + configuration.halfRoundCount
            let settlementMatch = roundsByNumber[settlementRoundNumber]?
                .only?
                .matches
                .first {
                    $0.order == match.order && $0.isCompleted
                }
            return settlementMatch == nil ? match : nil
        }

        let firstRoundNumber =
            match.roundNumber - configuration.halfRoundCount
        guard let firstMatch = roundsByNumber[firstRoundNumber]?
            .only?
            .matches
            .first(where: { $0.order == match.order })
        else {
            return match
        }

        return match.combiningScore(from: firstMatch)
    }

    private static func pairKey(_ playerIDs: [UUID]) -> String? {
        guard playerIDs.count == 2 else { return nil }
        return playerIDs
            .map { $0.uuidString.lowercased() }
            .sorted()
            .joined(separator: ":")
    }
}

enum SessionPlayerMatchFilter {
    static func matches(
        for playerID: UUID,
        type: SessionMatchType? = nil,
        in matches: [SessionMatch]
    ) -> [SessionMatch] {
        matches.compactMap { match in
            guard type == nil || match.type == type else { return nil }
            return orient(match, selectedPlayerID: playerID)
        }
    }

    private static func orient(
        _ match: SessionMatch,
        selectedPlayerID: UUID
    ) -> SessionMatch? {
        let sideSize = match.type == .doubles ? 2 : 1
        guard match.playerIDs.count == sideSize * 2 else { return nil }

        let teamOne = Array(match.playerIDs.prefix(sideSize))
        let teamTwo = Array(match.playerIDs.dropFirst(sideSize).prefix(sideSize))
        let selectedIsOnTeamOne = teamOne.contains(selectedPlayerID)
        let selectedIsOnTeamTwo = teamTwo.contains(selectedPlayerID)
        guard selectedIsOnTeamOne || selectedIsOnTeamTwo else { return nil }

        let selectedTeam = selectedIsOnTeamOne ? teamOne : teamTwo
        let opponentTeam = selectedIsOnTeamOne ? teamTwo : teamOne
        let orderedSelectedTeam = [
            selectedPlayerID
        ] + selectedTeam.filter { $0 != selectedPlayerID }
        let shouldSwapSides = selectedIsOnTeamTwo

        return SessionMatch(
            id: match.id,
            roundNumber: match.roundNumber,
            type: match.type,
            order: match.order,
            playerIDs: orderedSelectedTeam + opponentTeam,
            isCompleted: match.isCompleted,
            teamOneScore: shouldSwapSides
                ? match.teamTwoScore
                : match.teamOneScore,
            teamTwoScore: shouldSwapSides
                ? match.teamOneScore
                : match.teamTwoScore,
            eloPrediction: match.eloPrediction.map {
                shouldSwapSides ? $0.swappingSides() : $0
            }
        )
    }
}

enum SessionCompletedMatchPresenter {
    static func matches(
        playerCount: Int,
        rounds: [SessionRound]
    ) -> [SessionMatch] {
        if let groupedMatches = SessionHalfResultGrouper.groupedMatches(
            playerCount: playerCount,
            rounds: rounds
        ) {
            return groupedMatches
        }

        return rounds
            .sorted { $0.number < $1.number }
            .flatMap { round in
                round.matches.sorted { $0.order < $1.order }
            }
    }
}

private extension Array {
    var only: Element? {
        count == 1 ? first : nil
    }
}

private extension MatchEloPrediction {
    func swappingSides() -> MatchEloPrediction {
        MatchEloPrediction(
            matchId: matchId,
            ratingType: ratingType,
            team1: team2,
            team2: team1
        )
    }
}

private extension SessionMatch {
    func combiningScore(from firstHalf: SessionMatch) -> SessionMatch {
        guard
            let firstTeamOne = firstHalf.teamOneScore,
            let firstTeamTwo = firstHalf.teamTwoScore,
            let secondTeamOne = teamOneScore,
            let secondTeamTwo = teamTwoScore
        else {
            return self
        }

        let combinedScores: (Int, Int)
        if firstHalf.playerIDs == playerIDs {
            combinedScores = (
                firstTeamOne + secondTeamOne,
                firstTeamTwo + secondTeamTwo
            )
        } else if firstHalf.playerIDs == Array(playerIDs.reversed()) {
            combinedScores = (
                firstTeamTwo + secondTeamOne,
                firstTeamOne + secondTeamTwo
            )
        } else {
            return self
        }

        return SessionMatch(
            id: id,
            roundNumber: roundNumber,
            type: type,
            order: order,
            playerIDs: playerIDs,
            isCompleted: isCompleted,
            teamOneScore: combinedScores.0,
            teamTwoScore: combinedScores.1,
            eloPrediction: eloPrediction
        )
    }
}
