import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            Tab("Home", systemImage: "house.fill") {
                HomeView()
            }

            Tab("Sessions", systemImage: "sportscourt.fill") {
                SessionsView()
            }

            Tab("Rankings", systemImage: "chart.line.uptrend.xyaxis") {
                RankingsView()
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
