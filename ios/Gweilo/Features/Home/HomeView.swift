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
                    LazyVStack(alignment: .leading, spacing: 26) {
                        HomeHeader(
                            playerName: dataStore.currentUserFirstName,
                            lastSessionDelta: dataStore.currentUserLatestSessionDelta
                        )
                        TopThreeStandings(players: topSinglesPlayers)
                            .padding(.top, 18)

                        if let snapshot = dataStore.missionSnapshot,
                           !snapshot.missions.isEmpty {
                            RivalryMissionsSection(snapshot: snapshot)
                                .padding(.top, -36)
                        } else if dataStore.isMissionsLoading,
                                  !dataStore.hasLoadedMissions {
                            HomeMissionsLoadingView()
                                .padding(.top, -36)
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
                            .padding(.top, -36)
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
                    async let appData: Void = dataStore.load()
                    async let missions: Void = dataStore.loadMissions(
                        forceRefresh: true
                    )
                    _ = await (appData, missions)
                }
                .scrollIndicators(.hidden)
                .floatingTabBarAccessory(
                    isPresented: dataStore.activeSession == nil
                        && dataStore.canManageSessions
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
            .task {
                await dataStore.loadMissions()
            }
        }
    }

    private func startSession() {
        showsStartSession = true
    }
}

private struct HomeMissionsLoadingView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Moje misije")
            HStack(spacing: 10) {
                ProgressView()
                    .tint(GweiloTheme.accentBright)
                Text("Učitavam tvoje izazove…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
        .accessibilityElement(children: .combine)
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
        Group {
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
                        isPlaying: scenePhase == .active,
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
