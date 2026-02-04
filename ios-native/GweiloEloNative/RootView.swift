import SwiftUI

struct RootView: View {
  @StateObject private var auth = AuthViewModel()
  @State private var tabSelection: AppTab = .home

  var body: some View {
    Group {
      if auth.isLoading {
        ProgressView("Loading")
      } else if auth.session == nil {
        SignInView(auth: auth)
      } else {
        TabView(selection: $tabSelection) {
          HomeView(auth: auth)
            .tabItem {
              Label("Home", systemImage: "house.fill")
            }
            .tag(AppTab.home)

          SessionsView()
            .tabItem {
              Label("Sessions", systemImage: "clock.fill")
            }
            .tag(AppTab.sessions)

          StatisticsView()
            .tabItem {
              Label("Stats", systemImage: "chart.bar.fill")
            }
            .tag(AppTab.stats)

          NoShowsView()
            .tabItem {
              Label("No-Shows", systemImage: "person.crop.circle.badge.xmark")
            }
            .tag(AppTab.noShows)

          MoreView()
            .tabItem {
              Label("More", systemImage: "ellipsis.circle.fill")
            }
            .tag(AppTab.more)
        }
        .onChange(of: tabSelection) { _ in
          Haptics.tap()
        }
      }
    }
  }
}

private enum AppTab: Hashable {
  case home
  case sessions
  case stats
  case noShows
  case more
}
