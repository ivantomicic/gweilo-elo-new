import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var authStore = AuthStore()
    @State private var appDataStore: AppDataStore?

    var body: some View {
        Group {
            if isStartSessionPreview {
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

                    Section("GWEILO ON THE WEB") {
                        Link(destination: URL(string: "https://www.gweilo.lol/start-session")!) {
                            Label("Start a new session", systemImage: "safari")
                        }
                        Link(destination: URL(string: "https://www.gweilo.lol/rules")!) {
                            Label("Rules", systemImage: "book.closed")
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
