import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var authStore = AuthStore()
    @State private var appDataStore: AppDataStore?

    var body: some View {
        Group {
            if isRulesPreview {
                NavigationStack {
                    RulesView()
                }
            } else if isStartSessionPreview {
                StartSessionPreviewScreen()
            } else if isDoublesTeamProfilePreview {
                DoublesTeamProfilePreviewScreen()
            } else if isPlayerProfilePreview {
                PlayerProfilePreviewScreen()
            } else if isScoreEntryPreview {
                ScoreEntryPreviewScreen()
            } else if isSessionDetailPreview {
                SessionDetailPreviewScreen()
            } else if authStore.isRestoringSession {
                ProgressView("Restoring your club…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ArenaBackground())
            } else if authStore.session == nil {
                SignInView(authStore: authStore)
            } else if let appDataStore {
                MainTabView(
                    dataStore: appDataStore,
                    authStore: authStore
                )
            } else {
                ProgressView("Loading your club…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ArenaBackground())
            }
        }
        .task(id: authStore.session?.accessToken) {
            guard
                let session = authStore.session,
                let configuration = authStore.configuration
            else {
                appDataStore = nil
                return
            }

            if let appDataStore {
                appDataStore.updateSession(session)
                await appDataStore.load()
            } else {
                let store = AppDataStore(
                    configuration: configuration,
                    session: session
                )
                appDataStore = store
                await store.load()
            }
        }
        .task {
            await authStore.restoreSession()
        }
        .task(id: authStore.session?.accessToken) {
            await authStore.refreshBeforeExpiry()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task {
                await authStore.refreshIfNeeded()
            }
        }
    }

    private var isSessionDetailPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-session-detail-preview")
        #else
        false
        #endif
    }

    private var isScoreEntryPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-score-entry-preview")
        #else
        false
        #endif
    }

    private var isPlayerProfilePreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-player-profile-preview")
        #else
        false
        #endif
    }

    private var isDoublesTeamProfilePreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-doubles-team-profile-preview")
        #else
        false
        #endif
    }

    private var isStartSessionPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-start-session-preview")
        #else
        false
        #endif
    }

    private var isRulesPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-rules-preview")
        #else
        false
        #endif
    }
}

#if !DEBUG
private struct SessionDetailPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct ScoreEntryPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct PlayerProfilePreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct DoublesTeamProfilePreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct StartSessionPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}
#endif

private struct MainTabView: View {
    let dataStore: AppDataStore
    let authStore: AuthStore

    var body: some View {
        TabView {
            Tab("Home", systemImage: "house.fill") {
                HomeView(dataStore: dataStore)
            }

            Tab("Sessions", systemImage: "sportscourt.fill") {
                SessionsView(dataStore: dataStore)
            }

            Tab("Rankings", systemImage: "chart.line.uptrend.xyaxis") {
                RankingsView(dataStore: dataStore)
            }

            Tab("More", systemImage: "ellipsis") {
                AccountView(
                    email: authStore.session?.user.email,
                    player: authStore.session.flatMap { session in
                        dataStore.singlesRankings.first {
                            $0.id == session.user.id
                        }
                    },
                    dataStore: dataStore,
                    signOut: authStore.signOut
                )
            }
        }
        .tint(GweiloTheme.accent)
    }
}

private struct AccountView: View {
    let email: String?
    let player: RankingEntry?
    let dataStore: AppDataStore
    let signOut: () -> Void
    @State private var showsSignOutConfirmation = false

    private var version: String {
        Bundle.main.object(
            forInfoDictionaryKey: "CFBundleShortVersionString"
        ) as? String ?? "—"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                List {
                    Section("ACCOUNT") {
                        LabeledContent("Signed in as") {
                            Text(email ?? "Gweilo member")
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        if let player {
                            NavigationLink(value: player) {
                                Label("My player profile", systemImage: "person.text.rectangle")
                            }
                        }
                    }

                    Section("CLUB") {
                        NavigationLink {
                            RulesView()
                        } label: {
                            Label("Rules", systemImage: "book.closed")
                        }
                        Link(destination: URL(string: "https://www.gweilo.lol")!) {
                            Label("Open gweilo.lol", systemImage: "safari")
                        }
                    }

                    Section("APP") {
                        LabeledContent("Version", value: version)
                        LabeledContent("Server", value: "www.gweilo.lol")
                    }

                    Section {
                        Button("Sign out", role: .destructive) {
                            showsSignOutConfirmation = true
                        }
                    } footer: {
                        Text("Your login is stored securely on this iPhone.")
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("More")
            .navigationDestination(for: RankingEntry.self) { player in
                PlayerProfileView(
                    player: player,
                    dataStore: dataStore
                )
            }
            .confirmationDialog(
                "Sign out of Gweilo?",
                isPresented: $showsSignOutConfirmation,
                titleVisibility: .visible
            ) {
                Button("Sign out", role: .destructive, action: signOut)
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}

private struct LeaderboardRule: Identifiable {
    let id: String
    let marker: String
    let title: String
    let description: String
    let accent: Color
}

private struct RulesView: View {
    private let rules = [
        LeaderboardRule(
            id: "singles",
            marker: "15 / 28",
            title: "Singles leaderboard",
            description:
                "Play at least 15 singles matches and at least one singles match during the last 28 days.",
            accent: GweiloTheme.lime
        ),
        LeaderboardRule(
            id: "doubles-players",
            marker: "6 / 56",
            title: "Doubles players",
            description:
                "Play at least 6 doubles matches and at least one doubles match during the last 56 days.",
            accent: GweiloTheme.accentBright
        ),
        LeaderboardRule(
            id: "doubles-teams",
            marker: "6 / 56",
            title: "Doubles teams",
            description:
                "A team needs at least 6 matches together and must have played together during the last 56 days.",
            accent: GweiloTheme.cyan
        ),
        LeaderboardRule(
            id: "return",
            marker: "AUTO",
            title: "Returning to a leaderboard",
            description:
                "Results and Elo are never deleted. A player or team returns automatically as soon as the eligibility rules are met again.",
            accent: GweiloTheme.coral
        )
    ]

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    RulesHero()

                    ForEach(rules) { rule in
                        LeaderboardRuleRow(rule: rule)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 48)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle("Rules")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct RulesHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("GWEILO")
                    .foregroundStyle(GweiloTheme.background)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(GweiloTheme.lime)

                Text("LEADERBOARD ACCESS")
                    .foregroundStyle(GweiloTheme.lime)
                    .tracking(1.5)
            }
            .font(.caption2.weight(.black))

            Text("Earn your place.\nKeep it active.")
                .font(
                    GweiloTheme.displayFont(
                        size: 42,
                        relativeTo: .largeTitle
                    )
                )
                .textCase(.uppercase)
                .tracking(0.2)

            Text(
                "These rules decide who appears in Rankings and the Top 3. Falling outside them hides a player or team—it never erases results or Elo."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 28)
        .padding(.bottom, 30)
    }
}

private struct LeaderboardRuleRow: View {
    let rule: LeaderboardRule

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            Text(rule.marker)
                .font(.caption.monospacedDigit().weight(.black))
                .foregroundStyle(rule.accent)
                .frame(width: 54, alignment: .leading)

            VStack(alignment: .leading, spacing: 7) {
                Text(rule.title)
                    .font(.headline)

                Text(rule.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 20)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 0.7)
        }
        .accessibilityElement(children: .combine)
    }
}
