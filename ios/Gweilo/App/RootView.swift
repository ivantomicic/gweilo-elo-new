import SwiftUI

struct RootView: View {
    @State private var authStore = AuthStore()
    @State private var appDataStore: AppDataStore?

    var body: some View {
        Group {
            if isSessionDetailPreview {
                SessionDetailPreviewScreen()
            } else if authStore.session == nil {
                SignInView(authStore: authStore)
            } else if let appDataStore {
                MainTabView(dataStore: appDataStore)
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
                ComingSoonView(
                    title: "More",
                    subtitle: "Profiles, rules and settings.",
                    symbol: "person.crop.circle.fill"
                )
            }
        }
        .tint(GweiloTheme.accent)
    }
}
