import SwiftUI

struct HomeView: View {
  @ObservedObject var auth: AuthViewModel
  @State private var isModOrAdmin = false
  @State private var showStartSession = false
  @State private var progressRefreshID = UUID()

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 20) {
          ActiveSessionBanner()

          Top3PlayersView()

          PerformanceTrendCard(
            playerId: nil,
            secondaryPlayerId: nil,
            title: "Player Progress",
            refreshID: progressRefreshID
          )

          if let session = auth.session {
            VStack(spacing: 6) {
              Text(session.user.email ?? "No email")
                .font(.subheadline.weight(.semibold))
              Text("User: \(session.user.id.uuidString)")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(16)
            .background(AppColors.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }

          Button("Sign Out") {
            Haptics.tap()
            Task { await auth.signOut() }
          }
          .buttonStyle(.bordered)
        }
        .padding()
      }
      .refreshable {
        progressRefreshID = UUID()
      }
      .background(AppColors.background)
      .navigationTitle("Home")
      .toolbar {
        if isModOrAdmin {
          ToolbarItem(placement: .topBarTrailing) {
            Button {
              Haptics.tap()
              showStartSession = true
            } label: {
              Label("Start Session", systemImage: "plus")
            }
          }
        }
      }
      .sheet(isPresented: $showStartSession) {
        StartSessionView { _ in
          showStartSession = false
        }
      }
      .task {
        isModOrAdmin = RoleService.isModOrAdmin()
      }
    }
  }
}
