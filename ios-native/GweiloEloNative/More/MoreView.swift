import SwiftUI
import Supabase

struct MoreView: View {
  @State private var showDebugAlert = false
  @State private var debugMessage = ""

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

        Section("Debug") {
          Button {
            Haptics.tap()
            Task { await fetchAuthDebug() }
          } label: {
            Label("Check Auth", systemImage: "person.badge.key")
          }

          Button {
            Haptics.tap()
            Task { await submitRoundTest() }
          } label: {
            Label("Submit Round Test", systemImage: "paperplane.fill")
          }

          if #available(iOS 16.1, *) {
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
      .alert("Auth Debug", isPresented: $showDebugAlert, actions: {
        Button("OK", role: .cancel) {}
      }, message: {
        Text(debugMessage)
      })
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

  private func fetchAuthDebug() async {
    do {
      let supabase = SupabaseService.shared.client
      let session = try await supabase.auth.refreshSession()
      guard let apiBaseURL = SupabaseService.shared.apiBaseURL else {
        debugMessage = "Missing API_BASE_URL in SupabaseConfig.plist"
        showDebugAlert = true
        return
      }

      var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/debug/me"))
      request.httpMethod = "GET"
      request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
      request.setValue(session.accessToken, forHTTPHeaderField: "X-Supabase-Token")

      let (data, response) = try await URLSession.shared.data(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let body = String(data: data, encoding: .utf8) ?? ""
      debugMessage = "Status \(status)\n\(body)"
      showDebugAlert = true
    } catch {
      debugMessage = "Debug failed: \(error.localizedDescription)"
      showDebugAlert = true
    }
  }

  private func submitRoundTest() async {
    do {
      let sessionId = UserDefaults.standard.string(forKey: "last_session_id") ?? ""
      if sessionId.isEmpty {
        debugMessage = "No last_session_id in UserDefaults. Start a session first."
        showDebugAlert = true
        return
      }

      let supabase = SupabaseService.shared.client
      let session = try await supabase.auth.refreshSession()
      guard let apiBaseURL = SupabaseService.shared.apiBaseURL else {
        debugMessage = "Missing API_BASE_URL in SupabaseConfig.plist"
        showDebugAlert = true
        return
      }

      let matchScores: [[String: Any]] = [
        ["matchId": "00000000-0000-0000-0000-000000000000", "team1Score": 1, "team2Score": 0]
      ]

      var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/sessions/\(sessionId)/rounds/1/submit"))
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
      request.setValue(session.accessToken, forHTTPHeaderField: "X-Supabase-Token")
      request.httpBody = try JSONSerialization.data(withJSONObject: ["matchScores": matchScores], options: [])

      let (data, response) = try await URLSession.shared.data(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let body = String(data: data, encoding: .utf8) ?? ""
      debugMessage = "Status \(status)\n\(body)"
      showDebugAlert = true
    } catch {
      debugMessage = "Submit test failed: \(error.localizedDescription)"
      showDebugAlert = true
    }
  }
}
