import SwiftUI
import Supabase

struct StartSessionView: View {
  let onCreated: (UUID) -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var viewModel = StartSessionViewModel()
  @State private var selectedCount: Int = 2
  @State private var selectedIds: Set<UUID> = []
  @State private var sessionDate = Date()
  @State private var errorMessage: String?
  @State private var isSubmitting = false

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 16) {
          StepCard(title: "Session Time") {
            DatePicker("", selection: $sessionDate)
              .datePickerStyle(.compact)
              .labelsHidden()
          }

          StepCard(title: "Players") {
            Picker("Count", selection: $selectedCount) {
              ForEach(2...6, id: \ .self) { count in
                Text("\(count)").tag(count)
              }
            }
            .pickerStyle(.segmented)

            VStack(spacing: 10) {
              ForEach(viewModel.players) { player in
                PlayerSelectRow(
                  player: player,
                  isSelected: selectedIds.contains(player.id),
                  isDisabled: isDisabled(playerId: player.id)
                ) {
                  togglePlayer(player.id)
                }
              }
            }
          }

          if let errorMessage {
            Text(errorMessage)
              .font(.caption)
              .foregroundStyle(.red)
          }

          Button("Create Session") {
            Haptics.tap()
            Task { await createSession() }
          }
          .buttonStyle(.borderedProminent)
          .disabled(selectedIds.count != selectedCount || isSubmitting)
        }
        .padding(.horizontal)
        .padding(.bottom, 24)
      }
      .navigationTitle("Start Session")
      .toolbar {
        ToolbarItem(placement: .navigationBarLeading) {
          Button("Cancel") {
            dismiss()
          }
        }
      }
      .task {
        await viewModel.loadPlayers()
      }
    }
  }

  private func isDisabled(playerId: UUID) -> Bool {
    !selectedIds.contains(playerId) && selectedIds.count >= selectedCount
  }

  private func togglePlayer(_ id: UUID) {
    if selectedIds.contains(id) {
      selectedIds.remove(id)
    } else if selectedIds.count < selectedCount {
      selectedIds.insert(id)
    }
  }

  private func createSession() async {
    errorMessage = nil
    isSubmitting = true
    defer { isSubmitting = false }

    do {
      let selectedPlayers = viewModel.players.filter { selectedIds.contains($0.id) }
      guard selectedPlayers.count == selectedCount else {
        errorMessage = "Select \(selectedCount) players"
        return
      }

      let rounds = ScheduleGenerator.generate(players: selectedPlayers)
      guard !rounds.isEmpty else {
        errorMessage = "Unable to generate schedule"
        return
      }

      let sessionId = try await viewModel.createSession(
        playerCount: selectedCount,
        players: selectedPlayers,
        rounds: rounds,
        createdAt: sessionDate
      )

      onCreated(sessionId)
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

private struct StepCard<Content: View>: View {
  let title: String
  @ViewBuilder var content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(title)
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)
      content
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct PlayerSelectRow: View {
  let player: StartSessionPlayer
  let isSelected: Bool
  let isDisabled: Bool
  let onTap: () -> Void

  var body: some View {
    Button(action: {
      Haptics.tap()
      onTap()
    }) {
      HStack(spacing: 12) {
        AvatarView(url: player.avatarURL, fallback: player.name)
          .frame(width: 36, height: 36)

        Text(player.name)
          .foregroundStyle(.white)

        Spacer()

        if isSelected {
          Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(AppColors.primary)
        }
      }
      .padding(10)
      .background(Color.white.opacity(isSelected ? 0.08 : 0.03))
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .opacity(isDisabled && !isSelected ? 0.5 : 1)
  }
}

@MainActor
final class StartSessionViewModel: ObservableObject {
  @Published var players: [StartSessionPlayer] = []

  func loadPlayers() async {
    do {
      let supabase = SupabaseService.shared.client
      let rows: [ProfileRow] = try await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .order("display_name", ascending: true)
        .execute()
        .value

      players = rows.map { row in
        StartSessionPlayer(
          id: row.id,
          name: row.display_name ?? "User",
          avatarURL: row.avatar_url.flatMap(URL.init(string:))
        )
      }
    } catch {
      players = []
    }
  }

  func createSession(playerCount: Int, players: [StartSessionPlayer], rounds: [StartSessionRound], createdAt: Date) async throws -> UUID {
    guard let apiBaseURL = SupabaseService.shared.apiBaseURL else {
      throw StartSessionError.missingApiBase
    }

    let supabase = SupabaseService.shared.client
    let session: Session
    do {
      session = try await supabase.auth.refreshSession()
    } catch {
      if let current = supabase.auth.currentSession {
        session = current
      } else {
        throw StartSessionError.notAuthenticated
      }
    }

    let payload = StartSessionPayload(
      playerCount: playerCount,
      players: players.map { $0.payload },
      rounds: rounds,
      createdAt: ISO8601DateFormatter().string(from: createdAt)
    )

    let url = apiBaseURL.appendingPathComponent("api/sessions")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue(session.accessToken, forHTTPHeaderField: "X-Supabase-Token")
    request.httpBody = try JSONEncoder().encode(payload)

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw StartSessionError.badResponse
    }

    if httpResponse.statusCode >= 300 {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw StartSessionError.serverError(status: httpResponse.statusCode, body: body)
    }

    let decoded = try JSONDecoder().decode(StartSessionResponse.self, from: data)
    return decoded.sessionId
  }
}

struct StartSessionPlayer: Identifiable {
  let id: UUID
  let name: String
  let avatarURL: URL?

  var payload: StartSessionPayloadPlayer {
    StartSessionPayloadPlayer(id: id.uuidString, name: name, avatar: avatarURL?.absoluteString)
  }
}

struct StartSessionRound: Encodable {
  let id: String
  let roundNumber: Int
  let matches: [StartSessionMatch]
}

struct StartSessionMatch: Encodable {
  let type: String
  let players: [StartSessionPayloadPlayer]
}

struct StartSessionPayloadPlayer: Encodable {
  let id: String
  let name: String
  let avatar: String?
}

struct StartSessionPayload: Encodable {
  let playerCount: Int
  let players: [StartSessionPayloadPlayer]
  let rounds: [StartSessionRound]
  let createdAt: String
}

struct StartSessionResponse: Decodable {
  let sessionId: UUID
}

private struct ProfileRow: Decodable {
  let id: UUID
  let display_name: String?
  let avatar_url: String?
}

enum StartSessionError: LocalizedError {
  case missingApiBase
  case notAuthenticated
  case badResponse
  case serverError(status: Int, body: String)

  var errorDescription: String? {
    switch self {
    case .missingApiBase:
      return "Missing API_BASE_URL in SupabaseConfig.plist"
    case .notAuthenticated:
      return "Not authenticated"
    case .badResponse:
      return "Invalid response from server"
    case .serverError(let status, let body):
      let message = body.isEmpty ? "Failed to create session" : body
      return "Failed to create session (\(status)). \(message)"
    }
  }
}

private enum ScheduleGenerator {
  static func generate(players: [StartSessionPlayer]) -> [StartSessionRound] {
    switch players.count {
    case 2:
      return schedule2(players)
    case 3:
      return schedule3(players)
    case 4:
      return schedule4(players)
    case 5:
      return schedule5(players)
    case 6:
      return schedule6(players)
    default:
      return []
    }
  }

  private static func schedule2(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 2 else { return [] }
    let match = StartSessionMatch(type: "singles", players: [players[0].payload, players[1].payload])
    return [StartSessionRound(id: "1", roundNumber: 1, matches: [match])]
  }

  private static func schedule3(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 3 else { return [] }
    let A = players[0]
    let B = players[1]
    let C = players[2]
    return [
      StartSessionRound(id: "1", roundNumber: 1, matches: [StartSessionMatch(type: "singles", players: [A.payload, B.payload])]),
      StartSessionRound(id: "2", roundNumber: 2, matches: [StartSessionMatch(type: "singles", players: [C.payload, A.payload])]),
      StartSessionRound(id: "3", roundNumber: 3, matches: [StartSessionMatch(type: "singles", players: [B.payload, C.payload])])
    ]
  }

  private static func schedule4(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 4 else { return [] }
    let A = players[0]
    let B = players[1]
    let C = players[2]
    let D = players[3]

    return [
      StartSessionRound(id: "1", roundNumber: 1, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, B.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ]),
      StartSessionRound(id: "2", roundNumber: 2, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, D.payload])
      ]),
      StartSessionRound(id: "3", roundNumber: 3, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, C.payload])
      ]),
      StartSessionRound(id: "4", roundNumber: 4, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, C.payload, D.payload])
      ]),
      StartSessionRound(id: "5", roundNumber: 5, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, C.payload, B.payload, D.payload])
      ]),
      StartSessionRound(id: "6", roundNumber: 6, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, D.payload, B.payload, C.payload])
      ])
    ]
  }

  private static func schedule5(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 5 else { return [] }
    let A = players[0]
    let B = players[1]
    let C = players[2]
    let D = players[3]
    let E = players[4]

    return [
      StartSessionRound(id: "1", roundNumber: 1, matches: [
        StartSessionMatch(type: "singles", players: [B.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [D.payload, E.payload])
      ]),
      StartSessionRound(id: "2", roundNumber: 2, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, E.payload])
      ]),
      StartSessionRound(id: "3", roundNumber: 3, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, E.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, D.payload])
      ]),
      StartSessionRound(id: "4", roundNumber: 4, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, E.payload])
      ]),
      StartSessionRound(id: "5", roundNumber: 5, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, B.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ])
    ]
  }

  private static func schedule6(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 6 else { return [] }
    let A = players[0]
    let B = players[1]
    let C = players[2]
    let D = players[3]
    let E = players[4]
    let F = players[5]

    return [
      StartSessionRound(id: "1", roundNumber: 1, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, E.payload]),
        StartSessionMatch(type: "singles", players: [D.payload, F.payload])
      ]),
      StartSessionRound(id: "2", roundNumber: 2, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, E.payload])
      ]),
      StartSessionRound(id: "3", roundNumber: 3, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, E.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, F.payload])
      ]),
      StartSessionRound(id: "4", roundNumber: 4, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [D.payload, E.payload])
      ]),
      StartSessionRound(id: "5", roundNumber: 5, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, C.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [E.payload, F.payload])
      ]),
      StartSessionRound(id: "6", roundNumber: 6, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, E.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ]),
      StartSessionRound(id: "7", roundNumber: 7, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, E.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ])
    ]
  }
}
