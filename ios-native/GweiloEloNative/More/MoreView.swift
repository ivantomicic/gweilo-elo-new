import SwiftUI

struct MoreView: View {
  var body: some View {
    NavigationStack {
      List {
        Section("Extras") {
          NavigationLink {
            PollsView()
          } label: {
            Label("Polls", systemImage: "checkmark.seal.fill")
          }
          .simultaneousGesture(TapGesture().onEnded { Haptics.tap() })

          NavigationLink {
            SettingsView()
          } label: {
            Label("Settings", systemImage: "gearshape.fill")
          }
          .simultaneousGesture(TapGesture().onEnded { Haptics.tap() })
        }

        if #available(iOS 16.1, *) {
          Section("Debug") {
            Button {
              Haptics.tap()
              Task { await testLiveActivity() }
            } label: {
              Label("Test Live Activity", systemImage: "bolt.fill")
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle("More")
    }
  }

  @available(iOS 16.1, *)
  private func testLiveActivity() async {
    let demo = ActiveSession(
      id: UUID(),
      player_count: 4,
      created_at: ISO8601DateFormatter().string(from: Date())
    )
    await SessionLiveActivityManager.shared.sync(with: demo)
  }
}
