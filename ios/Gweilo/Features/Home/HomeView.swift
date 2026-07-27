import SwiftUI

struct HomeView: View {
    let dataStore: AppDataStore
    let openRankings: () -> Void
    @State private var navigationPath = NavigationPath()
    @State private var showsStartSession = false
    @State private var pendingCreatedSession: SessionSummary?

    init(
        dataStore: AppDataStore,
        openRankings: @escaping () -> Void = {}
    ) {
        self.dataStore = dataStore
        self.openRankings = openRankings
    }

    private var topSinglesPlayers: [RankingEntry] {
        dataStore.topThreeSinglesPlayers
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 26) {
                        HomeHeader(
                            playerName: dataStore.currentUserFirstName,
                            lastSessionDelta: dataStore.currentUserLatestSessionDelta
                        )
                        HomeLiveSession(
                            session: dataStore.activeSession,
                            canManageSession: dataStore.canManageSessions,
                            canStartSession: dataStore.canManageSessions,
                            startSession: { showsStartSession = true }
                        )
                        HomeRankingSection(
                            players: topSinglesPlayers,
                            openRankings: openRankings
                        )

                        if let latestSession = dataStore.latestCompletedSession {
                            LatestSessionResult(session: latestSession)
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
                    await dataStore.load()
                }
                .scrollIndicators(.hidden)
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

            Button("Retry", action: retry)
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
                        GweiloTheme.displayFont(
                            size: 44,
                            relativeTo: .largeTitle
                        )
                    )
                    .textCase(.uppercase)
                    .tracking(0.2)
            }

            Spacer()

            LastSessionMascot(delta: lastSessionDelta)
        }
        .padding(.top, 18)
    }
}

private struct LastSessionMascot: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    let delta: Double?

    private var outcome: MatchOutcome {
        switch EloPerformanceBand(delta: delta) {
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
                    isPlaying: scenePhase == .active
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
                "\(outcome.label), \($0) Elo in the latest session"
            } ?? "No recent session performance"
        )
    }
}

private struct HomeLiveSession: View {
    let session: SessionSummary?
    let canManageSession: Bool
    let canStartSession: Bool
    let startSession: () -> Void

    var body: some View {
        Group {
            if let session {
                NavigationLink(value: session) {
                    LiveSessionFeature(
                        session: session,
                        canManageSession: canManageSession
                    )
                }
                .buttonStyle(ResponsiveButtonStyle())
                .accessibilityHint("Otvara aktivnu sesiju")
            } else {
                EmptySessionFeature(
                    canStartSession: canStartSession,
                    startSession: startSession
                )
            }
        }
        .transition(.opacity.combined(with: .offset(y: 4)))
        .animation(.smooth(duration: 0.22), value: session?.id)
    }
}

private struct EmptySessionFeature: View {
    let canStartSession: Bool
    let startSession: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text("NEMA AKTIVNE SESIJE")
                    .font(
                        GweiloTheme.labelFont(
                            size: 11,
                            relativeTo: .caption
                        )
                    )
                    .tracking(1.5)
                    .foregroundStyle(.secondary)

                Text(canStartSession ? "Okupi ekipu." : "Čekamo sledeću igru.")
                    .font(
                        GweiloTheme.displayFont(
                            size: 30,
                            relativeTo: .title2
                        )
                    )
                    .textCase(.uppercase)

                Text(
                    canStartSession
                        ? "Izaberi igrače, proveri raspored i kreni."
                        : "Aktivna sesija će se pojaviti ovde čim počne."
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }

            if canStartSession {
                Button("Pokreni novu sesiju", action: startSession)
                    .buttonStyle(GweiloPrimaryButtonStyle(height: 52))
                    .accessibilityHint("Otvara izbor igrača i raspored")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }
}

private struct LiveSessionFeature: View {
    let session: SessionSummary
    let canManageSession: Bool

    private var currentRound: Int {
        session.currentRound ?? 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                HStack(spacing: 7) {
                    Circle()
                        .fill(GweiloTheme.lime)
                        .frame(width: 7, height: 7)

                    Text("SESIJA U TOKU")
                }
                    .font(
                        GweiloTheme.labelFont(
                            size: 11,
                            relativeTo: .caption
                        )
                    )
                    .tracking(1.4)
                    .foregroundStyle(GweiloTheme.lime)

                Spacer()

                Text("\(session.playerCount) IGRAČA")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Runda \(currentRound)")
                        .font(
                            GweiloTheme.displayFont(
                                size: 40,
                                relativeTo: .title
                            )
                        )
                        .textCase(.uppercase)
                        .tracking(0.4)

                    Text("\(currentRound) od \(session.totalRounds)")
                        .font(.caption.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            HStack {
                Text(canManageSession ? "Unesi rezultate" : "Prati sesiju")
                    .font(.subheadline.weight(.bold))

                Spacer()

                Image(systemName: "arrow.right")
                    .font(.subheadline.weight(.bold))
            }
            .foregroundStyle(GweiloTheme.lime)
            .padding(.top, 2)
        }
        .foregroundStyle(.primary)
        .padding(18)
        .background(GweiloTheme.raisedSurface, in: .rect(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(
                    LinearGradient(
                        colors: [
                            GweiloTheme.lime.opacity(0.42),
                            GweiloTheme.accent.opacity(0.22)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 0.8
                )
        }
        .accessibilityElement(children: .combine)
    }
}

private struct HomeRankingSection: View {
    let players: [RankingEntry]
    let openRankings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HomeSectionHeader(
                title: "Vrh liste",
                actionTitle: "Cela rang lista",
                action: openRankings
            )

            TopThreeStandings(players: players)
        }
    }
}

private struct HomeSectionHeader: View {
    let title: String
    let actionTitle: String?
    let action: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            SectionHeading(title: title)

            Spacer()

            if let actionTitle {
                Button(actionTitle, action: action)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(GweiloTheme.lime)
                    .buttonStyle(ResponsiveButtonStyle())
            }
        }
    }
}

private struct TopThreeStandings: View {
    let players: [RankingEntry]

    var body: some View {
        Group {
            if players.isEmpty {
                Text("No eligible singles rankings yet.")
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
            }
        }
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
                if rank == 1 && !reduceMotion {
                    LoopingBundleVideo(
                        resourceName: "PodiumGoldFrame",
                        isPlaying: scenePhase == .active,
                        videoGravity: .resizeAspect
                    )
                    .frame(width: 132, height: 176)
                    .offset(y: -39)
                    .blendMode(.screen)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }

                PlayerIdentityAvatar(
                    name: player.name,
                    initials: player.initials,
                    avatarURL: player.avatarURL,
                    size: avatarSize,
                    showsBorder: rank != 1,
                    softlyFadesAtEdge: rank == 1
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
        .accessibilityLabel("Rank \(rank), \(player.name), \(player.elo) Elo")
        .accessibilityHint("Opens player profile")
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
            rankDays: nil
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
                        HomeHeader(playerName: "Ivan", lastSessionDelta: 12)
                        EmptySessionFeature(
                            canStartSession: true,
                            startSession: {}
                        )
                        HomeRankingSection(
                            players: players,
                            openRankings: {}
                        )
                    }
                    .padding(.horizontal, 20)
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
    }
}

private struct LatestSessionResult: View {
    let session: SessionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "Poslednja sesija")

            NavigationLink(value: session) {
                HStack(alignment: .center, spacing: 14) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(HomeSessionFormatter.date(session.createdAt))
                            .font(.headline)

                        Text(sessionSummary)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)

                        if let bestPlayer = session.bestPlayer,
                           let bestDelta = session.bestDelta {
                            Label(
                                "\(bestPlayer) \(bestDelta >= 0 ? "+" : "")\(bestDelta) Elo",
                                systemImage: "arrow.up.right"
                            )
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(GweiloTheme.lime)
                        }
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
                .contentShape(.rect)
            }
            .buttonStyle(ResponsiveButtonStyle())
            .accessibilityHint("Otvara poslednju završenu sesiju")
        }
    }

    private var sessionSummary: String {
        var parts = ["\(session.playerCount) igrača"]

        if session.singlesMatches > 0 {
            parts.append("\(session.singlesMatches) singlova")
        }
        if session.doublesMatches > 0 {
            parts.append("\(session.doublesMatches) dublova")
        }

        return parts.joined(separator: " · ")
    }
}

private enum HomeSessionFormatter {
    private static let locale = Locale(identifier: "sr_Latn_RS")

    static func date(_ date: Date) -> String {
        date.formatted(
            .dateTime
                .weekday(.wide)
                .day()
                .month(.wide)
                .locale(locale)
        )
        .replacingOccurrences(of: ".", with: "")
        .capitalized(with: locale)
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
