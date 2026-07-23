import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var authStore = AuthStore()
    @State private var appDataStore: AppDataStore?

    var body: some View {
        Group {
            if isSessionDetailPreview {
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

            let store = AppDataStore(
                configuration: configuration,
                session: session
            )
            appDataStore = store
            await store.load()
        }
        .task {
            await authStore.restoreSession()
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
}

#if !DEBUG
private struct SessionDetailPreviewScreen: View {
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
                    signOut: authStore.signOut
                )
            }
        }
        .tint(GweiloTheme.accent)
    }
}

private struct AccountView: View {
    let email: String?
    let signOut: () -> Void

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
                    }

                    Section {
                        Button("Sign out", role: .destructive, action: signOut)
                    } footer: {
                        Text("Your login is stored securely on this iPhone.")
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("More")
        }
    }
}
