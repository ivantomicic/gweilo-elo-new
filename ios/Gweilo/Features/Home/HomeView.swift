import SwiftUI

struct HomeView: View {
    let dataStore: AppDataStore
    @State private var navigationPath = NavigationPath()
    @State private var showsStartSession = false
    @State private var pendingCreatedSession: SessionSummary?

    private var topSinglesPlayers: [RankingEntry] {
        dataStore.topThreeSinglesPlayers
    }

    private var currentUserStanding: (rank: Int, player: RankingEntry)? {
        dataStore.singlesRankings.enumerated().first {
            $0.element.id == dataStore.currentUserID
        }
        .map { (rank: $0.offset + 1, player: $0.element) }
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 26) {
                        HomeHeader(
                            playerName: dataStore.currentUserFirstName,
                            lastSessionDelta: dataStore.currentUserLatestSessionDelta,
                            lastSessionFormScore:
                                dataStore.currentUserLatestSessionFormScore
                        )

                        VStack(alignment: .leading, spacing: -10) {
                            TopThreeStandings(players: topSinglesPlayers)

                            if let standing = currentUserStanding {
                                MyStandingSection(
                                    player: standing.player,
                                    rank: standing.rank,
                                    history: dataStore.currentUserEloHistory
                                )
                                .zIndex(1)
                            }
                        }

                        if let snapshot = dataStore.missionSnapshot,
                           !snapshot.missions.isEmpty {
                            RivalryMissionsSection(snapshot: snapshot)
                        } else if let errorMessage =
                                    dataStore.missionsErrorMessage {
                            VStack(alignment: .leading, spacing: 10) {
                                SectionHeading(title: "Moje misije")
                                DataErrorNotice(
                                    message: errorMessage,
                                    retry: {
                                        Task {
                                            await dataStore.loadMissions(
                                                forceRefresh: true
                                            )
                                        }
                                    }
                                )
                            }
                        }

                        if !dataStore.recentCompletedSessions.isEmpty {
                            RecentSessionsSection(
                                sessions: dataStore.recentCompletedSessions,
                                rankings: dataStore.singlesRankings
                            )
                        }

                        if let errorMessage = dataStore.errorMessage {
                            DataErrorNotice(
                                message: errorMessage,
                                retry: {
                                    Task { await dataStore.load() }
                                }
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .refreshable {
                    await dataStore.loadHome(forceRefresh: true)
                }
                .scrollIndicators(.hidden)
                .floatingTabBarAccessory(
                    isPresented: dataStore.canStartNewSession
                ) {
                    HomeStartSessionButton(action: startSession)
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: SessionSummary.self) { session in
                SessionDetailView(
                    session: session,
                    dataStore: dataStore
                )
            }
            .navigationDestination(for: RankingEntry.self) { player in
                PlayerProfileView(
                    player: player,
                    dataStore: dataStore
                )
            }
            .sheet(isPresented: $showsStartSession) {
                StartSessionView(
                    dataStore: dataStore,
                    onCreated: { pendingCreatedSession = $0 }
                )
            }
            .onChange(of: showsStartSession) { _, isPresented in
                guard
                    !isPresented,
                    let pendingCreatedSession
                else {
                    return
                }
                self.pendingCreatedSession = nil
                navigationPath.append(pendingCreatedSession)
            }
        }
    }

    private func startSession() {
        showsStartSession = true
    }
}

struct HomeEloTrendPoint: Equatable, Sendable {
    let elo: Double
    let delta: Double?
}

struct HomeEloTrend: Equatable, Sendable {
    let points: [HomeEloTrendPoint]
    let matchCount: Int
    let sessionCount: Int?

    private enum SessionKey: Hashable {
        case identifier(UUID)
        case date(Date)
    }

    var delta: Int? {
        guard points.count > 1,
              let first = points.first,
              let last = points.last else {
            return nil
        }
        return Int((last.elo - first.elo).rounded())
    }

    var rangeLabel: String {
        guard matchCount > 0 else { return "JOŠ NEMA ELO ISTORIJE" }

        if let sessionCount, sessionCount > 0 {
            let sessionLabel = switch sessionCount {
            case 1: "POSLEDNJI TERMIN"
            case 2...4: "POSLEDNJA \(sessionCount) TERMINA"
            default: "POSLEDNJIH \(sessionCount) TERMINA"
            }
            return "\(sessionLabel) · \(matchCount) \(matchNoun(for: matchCount))"
        }

        return matchCount == 1
            ? "POSLEDNJA ELO PROMENA"
            : "POSLEDNJIH \(matchCount) ELO PROMENA"
    }

    static func make(
        player: RankingEntry,
        history: PlayerEloHistory?,
        maximumSessionCount: Int = 8
    ) -> HomeEloTrend {
        let availableHistoryPoints = (history?.points ?? [])
            .filter { $0.match > 0 }
        var selectedSessionKeys = Set<SessionKey>()
        var reversedHistoryPoints: [PlayerEloHistoryPoint] = []

        for point in availableHistoryPoints.reversed() {
            let sessionKey = point.sessionID.map(SessionKey.identifier)
                ?? .date(point.date)
            if !selectedSessionKeys.contains(sessionKey),
               selectedSessionKeys.count >= maximumSessionCount {
                break
            }
            selectedSessionKeys.insert(sessionKey)
            reversedHistoryPoints.append(point)
        }

        let historyPoints = reversedHistoryPoints.reversed()

        if let first = historyPoints.first {
            let baseline = first.elo - (first.delta ?? 0)
            return HomeEloTrend(
                points: [HomeEloTrendPoint(elo: baseline, delta: nil)]
                    + historyPoints.map {
                        HomeEloTrendPoint(elo: $0.elo, delta: $0.delta)
                    },
                matchCount: historyPoints.count,
                sessionCount: selectedSessionKeys.count
            )
        }

        let deltas = player.recentForm
        guard !deltas.isEmpty else {
            return HomeEloTrend(
                points: [HomeEloTrendPoint(elo: Double(player.elo), delta: nil)],
                matchCount: 0,
                sessionCount: nil
            )
        }

        var earlierElo = Double(player.elo)
        var points = [HomeEloTrendPoint(
            elo: Double(player.elo),
            delta: deltas.last
        )]
        for delta in deltas.reversed() {
            earlierElo -= delta
            points.insert(
                HomeEloTrendPoint(elo: earlierElo, delta: nil),
                at: 0
            )
        }
        for index in deltas.indices {
            points[index + 1] = HomeEloTrendPoint(
                elo: points[index + 1].elo,
                delta: deltas[index]
            )
        }

        return HomeEloTrend(
            points: points,
            matchCount: deltas.count,
            sessionCount: nil
        )
    }

    private func matchNoun(for count: Int) -> String {
        let finalTwoDigits = count % 100
        if 11...14 ~= finalTwoDigits {
            return "MEČEVA"
        }
        switch count % 10 {
        case 1: return "MEČ"
        case 2...4: return "MEČA"
        default: return "MEČEVA"
        }
    }
}

private struct MyStandingSection: View {
    let player: RankingEntry
    let rank: Int
    let history: PlayerEloHistory?

    private var trend: HomeEloTrend {
        HomeEloTrend.make(player: player, history: history)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Moja pozicija")

            NavigationLink(value: player) {
                MyStandingSummary(
                    player: player,
                    rank: rank,
                    trend: trend
                )
            }
            .buttonStyle(ResponsiveButtonStyle())
        }
        .accessibilityElement(children: .contain)
    }
}

private struct MyStandingSummary: View {
    let player: RankingEntry
    let rank: Int
    let trend: HomeEloTrend

    private var trendColor: Color {
        switch EloPerformanceBand(delta: trend.delta.map(Double.init)) {
        case .gain: GweiloTheme.lime
        case .steady: GweiloTheme.amber
        case .loss: GweiloTheme.coral
        }
    }

    private var trendText: String {
        guard let delta = trend.delta else { return "—" }
        return delta > 0 ? "+\(delta)" : "\(delta)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("#\(rank)")
                    .font(
                        GweiloTheme.headingFont(
                            size: 20,
                            relativeTo: .headline
                        )
                        .monospacedDigit()
                    )
                    .foregroundStyle(GweiloTheme.lime)

                Text("MESTO")
                    .font(
                        GweiloTheme.labelFont(
                            size: 10,
                            relativeTo: .caption2
                        )
                    )
                    .tracking(1)
                    .foregroundStyle(GweiloTheme.muted)

                Spacer()

                Text(trendText)
                    .font(.caption.monospacedDigit().weight(.black))
                    .foregroundStyle(trendColor)

                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(GweiloTheme.muted)
            }

            HStack(alignment: .bottom, spacing: 18) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(
                        player.elo.formatted(
                            .number.grouping(.never)
                        )
                    )
                        .font(
                            GweiloTheme.displayFont(
                                size: 40,
                                relativeTo: .largeTitle
                            )
                            .monospacedDigit()
                        )
                        .foregroundStyle(GweiloTheme.bone)

                    Text("ELO")
                        .font(
                            GweiloTheme.labelFont(
                                size: 10,
                                relativeTo: .caption2
                            )
                        )
                        .tracking(1.2)
                        .foregroundStyle(GweiloTheme.accentBright)
                }

                HomeEloSparkline(points: trend.points)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .padding(.bottom, 2)
            }

            Text(trend.rangeLabel)
                .font(
                    GweiloTheme.labelFont(
                        size: 9,
                        relativeTo: .caption2
                    )
                )
                .tracking(1)
                .foregroundStyle(GweiloTheme.muted)
        }
        .padding(.vertical, 16)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)
        }
        .contentShape(.rect)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Moja pozicija, mesto \(rank), \(player.elo) Elo, "
                + "trend \(trendText), \(trend.rangeLabel.lowercased())"
        )
        .accessibilityHint("Otvara tvoj profil igrača")
    }
}

private struct HomeEloSparkline: View {
    let points: [HomeEloTrendPoint]

    var body: some View {
        Canvas { context, size in
            let plotPoints = plotPoints(in: size)
            guard plotPoints.count > 1 else { return }

            let guideY = size.height / 2
            var guide = Path()
            guide.move(to: CGPoint(x: 0, y: guideY))
            guide.addLine(to: CGPoint(x: size.width, y: guideY))
            context.stroke(
                guide,
                with: .color(GweiloTheme.bone.opacity(0.08)),
                style: StrokeStyle(lineWidth: 1, dash: [3, 4])
            )

            for index in 0..<(plotPoints.count - 1) {
                let previous = index > 0 ? plotPoints[index - 1] : plotPoints[index]
                let current = plotPoints[index]
                let next = plotPoints[index + 1]
                let following = index + 2 < plotPoints.count
                    ? plotPoints[index + 2]
                    : next
                let drawingRect = CGRect(origin: .zero, size: size)
                    .insetBy(dx: 2, dy: 3)
                let firstControl = clamped(
                    CGPoint(
                        x: current.x + ((next.x - previous.x) / 6),
                        y: current.y + ((next.y - previous.y) / 6)
                    ),
                    to: drawingRect
                )
                let secondControl = clamped(
                    CGPoint(
                        x: next.x - ((following.x - current.x) / 6),
                        y: next.y - ((following.y - current.y) / 6)
                    ),
                    to: drawingRect
                )
                var segment = Path()
                segment.move(to: current)
                segment.addCurve(
                    to: next,
                    control1: firstControl,
                    control2: secondControl
                )
                context.stroke(
                    segment,
                    with: .color(color(for: points[index + 1].delta)),
                    style: StrokeStyle(
                        lineWidth: 3,
                        lineCap: .round,
                        lineJoin: .round
                    )
                )
            }

            if let endpoint = plotPoints.last {
                let dot = CGRect(
                    x: endpoint.x - 3.5,
                    y: endpoint.y - 3.5,
                    width: 7,
                    height: 7
                )
                context.fill(Path(ellipseIn: dot), with: .color(GweiloTheme.bone))
            }
        }
        .accessibilityHidden(true)
    }

    private func plotPoints(in size: CGSize) -> [CGPoint] {
        let values = points.map(\.elo)
        guard values.count > 1,
              let minimum = values.min(),
              let maximum = values.max() else {
            return []
        }

        let drawingRect = CGRect(origin: .zero, size: size)
            .insetBy(dx: 3.5, dy: 4)
        let valueRange = max(maximum - minimum, 1)
        let horizontalStep = drawingRect.width / CGFloat(values.count - 1)

        return values.enumerated().map { index, value in
            let x = drawingRect.minX + (CGFloat(index) * horizontalStep)
            let normalizedValue = CGFloat(value - minimum) / CGFloat(valueRange)
            let y = drawingRect.maxY - (normalizedValue * drawingRect.height)
            return CGPoint(x: x, y: y)
        }
    }

    private func color(for delta: Double?) -> Color {
        switch EloPerformanceBand(delta: delta) {
        case .gain: GweiloTheme.lime
        case .steady: GweiloTheme.amber
        case .loss: GweiloTheme.coral
        }
    }

    private func clamped(_ point: CGPoint, to rect: CGRect) -> CGPoint {
        CGPoint(
            x: min(max(point.x, rect.minX), rect.maxX),
            y: min(max(point.y, rect.minY), rect.maxY)
        )
    }
}

struct DataErrorNotice: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(GweiloTheme.coral)

            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer(minLength: 4)

            Button("Pokušaj ponovo", action: retry)
                .font(.footnote.weight(.bold))
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) {
            Divider()
        }
    }
}

private struct HomeHeader: View {
    let playerName: String
    let lastSessionDelta: Double?
    let lastSessionFormScore: Double?

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text("GWEILO / NOVI SAD")
                    .font(
                        GweiloTheme.labelFont(
                            size: 12,
                            relativeTo: .caption
                        )
                    )
                    .tracking(2.2)
                    .foregroundStyle(GweiloTheme.lime)

                Text("Poy, \(playerName)")
                    .font(
                        GweiloTheme.headingFont(
                            size: 40,
                            relativeTo: .largeTitle
                        )
                    )
                    .textCase(.uppercase)
                    .tracking(0.2)
            }

            Spacer()

            LastSessionMascot(
                delta: lastSessionDelta,
                formScore: lastSessionFormScore
            )
        }
        .padding(.top, 18)
    }
}

private struct LastSessionMascot: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isActiveAppTab) private var isActiveAppTab
    @Environment(\.scenePhase) private var scenePhase
    let delta: Double?
    let formScore: Double?

    private var outcome: MatchOutcome {
        let resolvedFormScore = formScore
            ?? delta.map(FormPerformanceScore.fallback(for:))
        return switch EloPerformanceBand(formScore: resolvedFormScore) {
        case .gain: .win
        case .steady: .draw
        case .loss: .loss
        }
    }

    private var deltaText: String? {
        guard let delta else { return nil }
        let rounded = Int(delta.rounded())
        return rounded > 0 ? "+\(rounded)" : "\(rounded)"
    }

    private var videoResourceName: String {
        switch outcome {
        case .win: "MatchResultWin"
        case .draw: "MatchResultDraw"
        case .loss: "MatchResultLoss"
        }
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if reduceMotion {
                MatchOutcomeArtwork(outcome: outcome, size: 124)
            } else {
                LoopingBundleVideo(
                    resourceName: videoResourceName,
                    isPlaying: scenePhase == .active && isActiveAppTab
                )
                .frame(width: 124, height: 124)
                .blendMode(.screen)
                .allowsHitTesting(false)
            }

            if let deltaText {
                Text(deltaText)
                    .font(.caption2.monospacedDigit().weight(.black))
                    .foregroundStyle(GweiloTheme.background)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 3)
                    .background(outcome.color, in: .capsule)
                    .offset(x: 1, y: 2)
            }
        }
        .frame(width: 88, height: 88, alignment: .topTrailing)
        .offset(y: -6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            deltaText.map {
                "\(outcome.label), \($0) Elo na poslednjem terminu"
            } ?? "Nema učinka sa poslednjeg termina"
        )
    }
}

private struct HomeStartSessionButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("Pokreni novi termin")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(GweiloTheme.background)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .contentShape(.capsule)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .adaptiveSurface(
            in: Capsule(),
            interactive: true,
            tint: GweiloTheme.lime.opacity(0.50)
        )
        .accessibilityHint("Otvara izbor igrača i raspored")
    }
}

private struct TopThreeStandings: View {
    let players: [RankingEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Vrh tabele")

            if players.isEmpty {
                Text("Još nema kvalifikovanih igrača u singl statistici.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                HStack(alignment: .bottom, spacing: 8) {
                    ForEach(podiumPlacements, id: \.player.id) { placement in
                        NavigationLink(value: placement.player) {
                            PodiumPlayer(
                                rank: placement.rank,
                                player: placement.player
                            )
                        }
                        .buttonStyle(ResponsiveButtonStyle())
                    }
                }
                .padding(.top, 34)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var podiumPlacements: [(rank: Int, player: RankingEntry)] {
        let rankedPlayers = players.prefix(3).enumerated().map {
            (rank: $0.offset + 1, player: $0.element)
        }
        guard rankedPlayers.count == 3 else {
            return rankedPlayers
        }
        return [rankedPlayers[1], rankedPlayers[0], rankedPlayers[2]]
    }
}

private struct PodiumPlayer: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isActiveAppTab) private var isActiveAppTab
    @Environment(\.scenePhase) private var scenePhase
    let rank: Int
    let player: RankingEntry

    private var accent: Color {
        switch rank {
        case 1: GweiloTheme.rankGold
        case 2: GweiloTheme.rankSilver
        default: GweiloTheme.rankBronze
        }
    }

    private var avatarSize: CGFloat {
        rank == 1 ? 58 : 48
    }

    private var podiumHeight: CGFloat {
        switch rank {
        case 1: 88
        case 2: 64
        default: 48
        }
    }

    var body: some View {
        VStack(spacing: 5) {
            ZStack {
                PlayerIdentityAvatar(
                    name: player.name,
                    initials: player.initials,
                    avatarURL: player.avatarURL,
                    size: avatarSize,
                    showsBorder: rank != 1
                )
                .overlay {
                    if rank != 1 {
                        Circle()
                            .stroke(
                            GweiloTheme.bone.opacity(0.28),
                            lineWidth: 1
                        )
                    }
                }

                if rank == 1 && !reduceMotion {
                    LoopingBundleVideo(
                        resourceName: "PodiumGoldFrame",
                        isPlaying: scenePhase == .active && isActiveAppTab,
                        videoGravity: .resizeAspect
                    )
                    .frame(width: 132, height: 176)
                    .offset(y: -39)
                    .blendMode(.screen)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
            }
            .frame(width: avatarSize, height: avatarSize)

            Text(player.name)
                .font(.caption.weight(.bold))
                .foregroundStyle(GweiloTheme.bone)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [
                            GweiloTheme.raisedSurface.opacity(0.88),
                            GweiloTheme.background.opacity(0.96)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(height: podiumHeight)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(accent)
                        .frame(height: 2)
                }
                .overlay(alignment: .top) {
                    Text(
                        player.elo.formatted(
                            .number.grouping(.never)
                        )
                    )
                        .font(.caption.monospacedDigit().weight(.black))
                        .foregroundStyle(GweiloTheme.bone)
                        .padding(.top, 11)
                }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Mesto \(rank), \(player.name), \(player.elo) Elo")
        .accessibilityHint("Otvara profil igrača")
    }
}

struct TopThreePreviewScreen: View {
    private let players = [
        RankingEntry(
            id: UUID(),
            name: "Ivan",
            avatarURL: nil,
            elo: 1_718,
            matches: 219,
            wins: 132,
            losses: 77,
            draws: 10,
            rankDays: nil,
            recentForm: [14, -7, 24, 13, 6, 8]
        ),
        RankingEntry(
            id: UUID(),
            name: "Gara",
            avatarURL: nil,
            elo: 1_626,
            matches: 138,
            wins: 75,
            losses: 54,
            draws: 9,
            rankDays: nil
        ),
        RankingEntry(
            id: UUID(),
            name: "Leo",
            avatarURL: nil,
            elo: 1_624,
            matches: 110,
            wins: 69,
            losses: 30,
            draws: 11,
            rankDays: nil
        )
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 30) {
                        HomeHeader(
                            playerName: "Ivan",
                            lastSessionDelta: 12,
                            lastSessionFormScore: 1
                        )
                        VStack(alignment: .leading, spacing: -10) {
                            TopThreeStandings(players: players)
                            MyStandingSection(
                                player: players[0],
                                rank: 1,
                                history: nil
                            )
                            .zIndex(1)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
    }
}

private struct RecentSessionsSection: View {
    let sessions: [SessionSummary]
    let rankings: [RankingEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Poslednji termini")

            GweiloCardCarousel(itemCount: sessions.count) {
                ForEach(
                    Array(sessions.enumerated()),
                    id: \.element.id
                ) { index, session in
                    CompletedSessionCard(
                        session: session,
                        rankings: rankings,
                        presentation: .compact
                    )
                        .containerRelativeFrame(.horizontal) { length, _ in
                            min(length * 0.72, 272)
                        }
                        .id(index)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}

struct SectionHeading: View {
    let title: String

    var body: some View {
        Text(title.uppercased())
            .font(
                GweiloTheme.labelFont(
                    size: 12,
                    relativeTo: .caption
                )
            )
            .tracking(1.8)
            .foregroundStyle(GweiloTheme.accentBright)
    }
}

struct ResponsiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.84 : 1)
            .animation(.smooth(duration: 0.12), value: configuration.isPressed)
            .sensoryFeedback(
                .impact(weight: .light, intensity: 0.55),
                trigger: configuration.isPressed
            ) { wasPressed, isPressed in
                !wasPressed && isPressed
            }
    }
}
