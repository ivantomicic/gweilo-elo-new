import SwiftUI

struct HomeView: View {
  @ObservedObject var auth: AuthViewModel
  @State private var isModOrAdmin = false
  @State private var showStartSession = false

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 20) {
          if isModOrAdmin {
            Button {
              Haptics.tap()
              showStartSession = true
            } label: {
              HStack {
                Label("Start Session", systemImage: "plus.circle.fill")
                  .font(.headline.weight(.semibold))
                Spacer()
                Image(systemName: "chevron.right")
                  .foregroundStyle(AppColors.muted)
              }
              .padding(16)
              .background(AppColors.card)
              .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
          }

          Top3PlayersView()

          PerformanceTrendCard(
            playerId: nil,
            secondaryPlayerId: nil,
            title: "Player Progress"
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
      .background(AppColors.background)
      .navigationTitle("Home")
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
