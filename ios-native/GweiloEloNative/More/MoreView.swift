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
      }
      .listStyle(.insetGrouped)
      .navigationTitle("More")
    }
  }
}
