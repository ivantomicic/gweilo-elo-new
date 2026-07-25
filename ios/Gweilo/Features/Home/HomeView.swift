import SwiftUI

struct HomeView: View {
    let dataStore: AppDataStore
    @State private var navigationPath = NavigationPath()
    @State private var showsStartSession = false
    @State private var pendingCreatedSession: SessionSummary?

    private var topSinglesPlayers: [RankingEntry] {
        dataStore.topThreeSinglesPlayers
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 30) {
                        HomeHeader(
                            playerName: dataStore.currentUserFirstName,
                            lastSessionDelta: dataStore.currentUserLatestSessionDelta
                        )
                        HomeLiveSession(
                            session: dataStore.activeSession,
                            canStartSession: dataStore.canStartNewSession,
                            startSession: { showsStartSession = true }
                        )
                        TopThreeStandings(players: topSinglesPlayers)
                        LatestSessionResult(session: dataStore.latestCompletedSession)

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
    let canStartSession: Bool
    let startSession: () -> Void

    var body: some View {
        if let session {
            NavigationLink(value: session) {
                LiveSessionFeature(session: session)
            }
            .buttonStyle(ResponsiveButtonStyle())
            .accessibilityHint("Opens the active session")
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("NO ACTIVE SESSION")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
                Text("The next live session will appear here.")
                    .font(.headline)

                if canStartSession {
                    Button(action: startSession) {
                        Label("Start a session", systemImage: "plus")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(GweiloTheme.lime)
                    .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
    }
}

private struct LiveSessionFeature: View {
    let session: SessionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Label("LIVE SESSION", systemImage: "circle.fill")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(GweiloTheme.lime)

                Spacer()

                Text("\(session.playerCount) PLAYERS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Current round")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Text("Round \(session.currentRound ?? 1)")
                        .font(
                            GweiloTheme.displayFont(
                                size: 40,
                                relativeTo: .title
                            )
                        )
                        .textCase(.uppercase)
                        .tracking(0.4)
                }

                Spacer()

                Text("\(session.currentRound ?? 1) / \(session.totalRounds)")
                    .font(.caption.monospacedDigit().weight(.bold))
                    .foregroundStyle(.secondary)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }

            HStack(spacing: 18) {
                Label(
                    "\(session.singlesMatches) singles",
                    systemImage: "person.2.fill"
                )
                Label(
                    "\(session.doublesMatches) doubles",
                    systemImage: "person.3.fill"
                )
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        .foregroundStyle(.primary)
        .padding(.vertical, 16)
        .padding(.leading, 17)
        .padding(.trailing, 14)
        .background(GweiloTheme.raisedSurface)
        .overlay(alignment: .leading) {
            LinearGradient(
                colors: [GweiloTheme.lime, GweiloTheme.accent],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(width: 3)
        }
        .overlay {
            Rectangle()
                .stroke(GweiloTheme.accent.opacity(0.28), lineWidth: 0.8)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct TopThreeStandings: View {
    let players: [RankingEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeading(title: "Current top 3")

                Spacer()

                Text("15 matches · active 28d")
                    .font(.caption2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.secondary)
            }

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
                .padding(.top, 6)
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
    let rank: Int
    let player: RankingEntry

    private var accent: Color {
        switch rank {
        case 1: GweiloTheme.lime
        case 2: GweiloTheme.cyan
        default: GweiloTheme.accentBright
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
        VStack(spacing: 8) {
            ZStack(alignment: .bottomTrailing) {
                PlayerIdentityAvatar(
                    name: player.name,
                    initials: player.initials,
                    avatarURL: player.avatarURL,
                    size: avatarSize
                )
                .overlay {
                    Circle()
                        .stroke(accent, lineWidth: rank == 1 ? 2.5 : 1.5)
                }

                Text("#\(rank)")
                    .font(.caption2.monospacedDigit().weight(.black))
                    .foregroundStyle(GweiloTheme.background)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 3)
                    .background(accent)
                    .offset(x: 4, y: 3)
            }

            Text(player.name)
                .font(.caption.weight(.bold))
                .foregroundStyle(GweiloTheme.bone)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [
                            accent.opacity(rank == 1 ? 0.34 : 0.24),
                            GweiloTheme.raisedSurface.opacity(0.55)
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
                        .foregroundStyle(rank == 1 ? accent : GweiloTheme.bone)
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
                        TopThreeStandings(players: players)
                    }
                    .padding(.horizontal, 20)
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
    }
}

private struct LatestSessionResult: View {
    let session: SessionSummary?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "Latest session")

            if let session {
                NavigationLink(value: session) {
                    HStack(alignment: .center, spacing: 14) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text(session.dateLabel)
                                .font(.headline)

                            HStack {
                                Label(
                                    "\(session.singlesMatches) singles",
                                    systemImage: "person.2.fill"
                                )
                                Label(
                                    "\(session.doublesMatches) doubles",
                                    systemImage: "person.3.fill"
                                )
                            }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)

                            if let bestPlayer = session.bestPlayer,
                               let bestDelta = session.bestDelta {
                                Text(
                                    "Best form: \(bestPlayer) \(bestDelta >= 0 ? "+" : "")\(bestDelta)"
                                )
                                .font(.subheadline.weight(.semibold))
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
                .accessibilityHint("Opens the latest session")
            } else {
                Text("No completed sessions yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
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
