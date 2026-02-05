import SwiftUI
import Supabase

struct SessionDetailView: View {
  let sessionId: UUID
  @StateObject private var viewModel = SessionDetailViewModel()
  @State private var selection: SessionDetailSection = .overview
  @State private var hasInitializedSelection = false

  var body: some View {
    VStack(spacing: 16) {
      if viewModel.isLoading {
        ProgressView("Loading session…")
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
          .padding(.top, 40)
      } else if let error = viewModel.errorMessage {
        Text(error)
          .foregroundStyle(.red)
          .padding(.top, 40)
      } else {
        Picker("Section", selection: $selection) {
          Text("Overview").tag(SessionDetailSection.overview)
          if viewModel.isActiveSession {
            Text("Live").tag(SessionDetailSection.live)
          }
          Text("Matches").tag(SessionDetailSection.matches)
          Text("Players").tag(SessionDetailSection.players)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)

        ScrollView {
          VStack(spacing: 16) {
            if selection == .overview {
              SessionOverviewCard(summary: viewModel.summary)
              SessionHighlightsCard(summary: viewModel.summary)
            }

            if selection == .live {
              LiveSessionView(viewModel: viewModel)
            }

            if selection == .matches {
              ForEach(viewModel.matches) { match in
                MatchRowView(match: match, playerMap: viewModel.playerMap)
              }
            }

            if selection == .players {
              ForEach(viewModel.players) { player in
                SessionPlayerCard(player: player)
              }
            }
          }
          .padding(.horizontal)
          .padding(.bottom, 24)
        }
      }
    }
    .background(AppColors.background)
    .navigationTitle("Session")
    .task {
      await viewModel.load(sessionId: sessionId)
    }
    .onChange(of: viewModel.summary?.status) { newValue in
      guard !hasInitializedSelection else { return }
      if newValue == "active" {
        selection = .live
      } else {
        selection = .overview
      }
      hasInitializedSelection = true
    }
  }
}

private struct SessionOverviewCard: View {
  let summary: SessionDetailSummary?

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Overview")
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)

      if let summary {
        HStack {
          StatPill(title: "Players", value: "\(summary.playerCount)")
          StatPill(title: "Status", value: summary.status.capitalized)
          StatPill(title: "Matches", value: "\(summary.totalMatches)")
        }
      } else {
        Text("No summary available")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct SessionHighlightsCard: View {
  let summary: SessionDetailSummary?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Highlights")
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)

      if let summary {
        HStack(spacing: 12) {
          HighlightChip(title: "Singles", value: "\(summary.singlesMatches)")
          HighlightChip(title: "Doubles", value: "\(summary.doublesMatches)")
        }

        if let best = summary.best {
          HighlightTag(icon: "star.fill", color: .yellow, label: best)
        }
        if let worst = summary.worst {
          HighlightTag(icon: "arrow.down", color: .red, label: worst)
        }
      } else {
        Text("No highlights available")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct StatPill: View {
  let title: String
  let value: String

  var body: some View {
    VStack(spacing: 4) {
      Text(title)
        .font(.caption)
        .foregroundStyle(AppColors.muted)
      Text(value)
        .font(.headline.weight(.bold))
        .foregroundStyle(.white)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 10)
    .background(Color.white.opacity(0.05))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct HighlightChip: View {
  let title: String
  let value: String

  var body: some View {
    VStack(spacing: 4) {
      Text(title)
        .font(.caption)
        .foregroundStyle(AppColors.muted)
      Text(value)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 8)
    .background(Color.white.opacity(0.05))
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private struct HighlightTag: View {
  let icon: String
  let color: Color
  let label: String

  var body: some View {
    Label(label, systemImage: icon)
      .font(.caption.weight(.semibold))
      .foregroundStyle(color)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(Color.white.opacity(0.05))
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private struct SessionPlayerCard: View {
  let player: SessionPlayer

  var body: some View {
    HStack(spacing: 12) {
      AvatarView(url: player.avatarURL, fallback: player.displayName)
        .frame(width: 44, height: 44)

      VStack(alignment: .leading, spacing: 4) {
        Text(player.displayName)
          .font(.headline)
          .foregroundStyle(.white)
        if let team = player.team {
          Text("Team \(team)")
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }
      }

      Spacer()
    }
    .padding(14)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

private struct MatchRowView: View {
  let match: SessionMatch
  let playerMap: [UUID: SessionPlayer]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(match.match_type.capitalized)
          .font(.caption.weight(.bold))
          .foregroundStyle(AppColors.muted)
        Spacer()
        if let score = match.scoreString {
          Text(score)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white)
        }
      }

      Text(matchTitle)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)

      if let round = match.round_number {
        Text("Round \(round)")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }
    }
    .padding(14)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }

  private var matchTitle: String {
    guard !match.player_ids.isEmpty else { return "Match" }

    if match.match_type == "singles", match.player_ids.count >= 2 {
      let p1 = playerMap[match.player_ids[0]]?.displayName ?? "Player"
      let p2 = playerMap[match.player_ids[1]]?.displayName ?? "Player"
      return "\(p1) vs \(p2)"
    }

    if match.match_type == "doubles", match.player_ids.count >= 4 {
      let p1 = playerMap[match.player_ids[0]]?.displayName ?? "P1"
      let p2 = playerMap[match.player_ids[1]]?.displayName ?? "P2"
      let p3 = playerMap[match.player_ids[2]]?.displayName ?? "P3"
      let p4 = playerMap[match.player_ids[3]]?.displayName ?? "P4"
      return "\(p1) & \(p2) vs \(p3) & \(p4)"
    }

    return "Match"
  }
}

private struct LiveSessionView: View {
  @ObservedObject var viewModel: SessionDetailViewModel

  var body: some View {
    VStack(spacing: 16) {
      if viewModel.roundNumbers.isEmpty {
        Text("No rounds available yet.")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        RoundPicker(
          roundNumbers: viewModel.roundNumbers,
          selectedRound: $viewModel.currentRound
        )

        if let matches = viewModel.matchesByRound[viewModel.currentRound] {
          VStack(spacing: 12) {
            ForEach(matches) { match in
              LiveMatchCard(match: match, viewModel: viewModel)
            }
          }
        }

        if let submitError = viewModel.submitError {
          Text(submitError)
            .font(.caption)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
        }

        Button(viewModel.isSubmitting ? "Submitting…" : "Submit Round") {
          Haptics.tap()
          Task { await viewModel.submitCurrentRound() }
        }
        .buttonStyle(.borderedProminent)
        .disabled(!viewModel.canSubmitCurrentRound || viewModel.isSubmitting)
      }
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct RoundPicker: View {
  let roundNumbers: [Int]
  @Binding var selectedRound: Int

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        ForEach(roundNumbers, id: \.self) { round in
          let isSelected = round == selectedRound
          Button {
            Haptics.tap()
            selectedRound = round
          } label: {
            Text("Round \(round)")
              .font(.caption.weight(.semibold))
              .foregroundStyle(isSelected ? .white : AppColors.muted)
              .padding(.horizontal, 12)
              .padding(.vertical, 6)
              .background(isSelected ? AppColors.primary : AppColors.card.opacity(0.6))
              .clipShape(Capsule())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}

private struct LiveMatchCard: View {
  let match: SessionMatch
  @ObservedObject var viewModel: SessionDetailViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(match.match_type.capitalized)
          .font(.caption.weight(.bold))
          .foregroundStyle(AppColors.muted)
        Spacer()
        if match.status == "completed" {
          Text("Completed")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.green)
        }
      }

      Text(viewModel.matchTitle(match))
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)

      ScoreInputRow(match: match, viewModel: viewModel)

      if let previews = viewModel.eloPreviews(for: match), !previews.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(previews) { preview in
            HStack {
              Text(preview.label)
                .font(.caption)
                .foregroundStyle(AppColors.muted)
              Spacer()
              Text(preview.formattedDelta)
                .font(.caption.weight(.semibold))
                .foregroundStyle(preview.delta >= 0 ? .green : .red)
            }
          }
        }
        .padding(10)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
    }
    .padding(14)
    .background(Color.white.opacity(0.03))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

private struct ScoreInputRow: View {
  let match: SessionMatch
  @ObservedObject var viewModel: SessionDetailViewModel

  var body: some View {
    HStack(spacing: 12) {
      scoreField(
        placeholder: "0",
        text: viewModel.scoreBinding(matchId: match.id, team: 1),
        disabled: match.status == "completed"
      )

      Text("-")
        .foregroundStyle(AppColors.muted)

      scoreField(
        placeholder: "0",
        text: viewModel.scoreBinding(matchId: match.id, team: 2),
        disabled: match.status == "completed"
      )
    }
  }

  private func scoreField(placeholder: String, text: Binding<String>, disabled: Bool) -> some View {
    TextField(placeholder, text: text)
      .keyboardType(.numberPad)
      .multilineTextAlignment(.center)
      .frame(width: 56)
      .padding(.vertical, 8)
      .background(AppColors.card)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .disabled(disabled)
  }
}

enum SessionDetailSection {
  case overview
  case live
  case matches
  case players
}

@MainActor
final class SessionDetailViewModel: ObservableObject {
  @Published var summary: SessionDetailSummary?
  @Published var matches: [SessionMatch] = []
  @Published var matchesByRound: [Int: [SessionMatch]] = [:]
  @Published var roundNumbers: [Int] = []
  @Published var currentRound: Int = 1
  @Published var players: [SessionPlayer] = []
  @Published var playerMap: [UUID: SessionPlayer] = [:]
  @Published var scoreInputs: [UUID: MatchScoreInput] = [:]
  @Published var isSubmitting = false
  @Published var submitError: String?
  @Published var isLoading = false
  @Published var errorMessage: String?

  private var activeSessionId: UUID?

  var isActiveSession: Bool {
    summary?.status == "active"
  }

  var canSubmitCurrentRound: Bool {
    guard let matches = matchesByRound[currentRound], !matches.isEmpty else { return false }
    guard matches.contains(where: { $0.status != "completed" }) else { return false }
    return matches.allSatisfy { match in
      guard match.status != "completed" else { return true }
      guard let input = scoreInputs[match.id] else { return false }
      return input.team1Value != nil && input.team2Value != nil
    }
  }

  func load(sessionId: UUID) async {
    activeSessionId = sessionId
    isLoading = true
    errorMessage = nil
    submitError = nil

    do {
      let supabase = SupabaseService.shared.client

      let sessionRow: [SessionRow] = try await supabase
        .from("sessions")
        .select("id, player_count, created_at, status, completed_at, best_player_display_name, best_player_delta, worst_player_display_name, worst_player_delta")
        .eq("id", value: sessionId.uuidString)
        .limit(1)
        .execute()
        .value

      let session = sessionRow.first

      let matchesRows: [SessionMatch] = try await supabase
        .from("session_matches")
        .select("id, match_type, round_number, match_order, player_ids, status, team1_score, team2_score")
        .eq("session_id", value: sessionId.uuidString)
        .order("round_number", ascending: true)
        .order("match_order", ascending: true)
        .execute()
        .value

      players = try await fetchPlayers(sessionId: sessionId)
      playerMap = Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0) })

      let singlesCount = matchesRows.filter { $0.match_type == "singles" && $0.status == "completed" }.count
      let doublesCount = matchesRows.filter { $0.match_type == "doubles" && $0.status == "completed" }.count

      summary = SessionDetailSummary(
        playerCount: session?.player_count ?? players.count,
        status: session?.status ?? "active",
        totalMatches: matchesRows.count,
        singlesMatches: singlesCount,
        doublesMatches: doublesCount,
        best: formatBadge(name: session?.best_player_display_name, delta: session?.best_player_delta, prefix: "+"),
        worst: formatBadge(name: session?.worst_player_display_name, delta: session?.worst_player_delta, prefix: "")
      )

      matches = matchesRows
      matchesByRound = Dictionary(grouping: matchesRows) { $0.round_number ?? 0 }
      roundNumbers = matchesByRound.keys.filter { $0 > 0 }.sorted()
      setInitialRound()
      initializeScoreInputs()
      isLoading = false
    } catch {
      isLoading = false
      errorMessage = "Failed to load session. \(error.localizedDescription)"
    }
  }

  func scoreBinding(matchId: UUID, team: Int) -> Binding<String> {
    Binding<String>(
      get: {
        if let input = self.scoreInputs[matchId] {
          return team == 1 ? input.team1 : input.team2
        }
        return ""
      },
      set: { newValue in
        self.updateScore(matchId: matchId, team: team, value: newValue)
      }
    )
  }

  func matchTitle(_ match: SessionMatch) -> String {
    guard !match.player_ids.isEmpty else { return "Match" }

    if match.match_type == "singles", match.player_ids.count >= 2 {
      let p1 = playerMap[match.player_ids[0]]?.displayName ?? "Player"
      let p2 = playerMap[match.player_ids[1]]?.displayName ?? "Player"
      return "\(p1) vs \(p2)"
    }

    if match.match_type == "doubles", match.player_ids.count >= 4 {
      let p1 = playerMap[match.player_ids[0]]?.displayName ?? "P1"
      let p2 = playerMap[match.player_ids[1]]?.displayName ?? "P2"
      let p3 = playerMap[match.player_ids[2]]?.displayName ?? "P3"
      let p4 = playerMap[match.player_ids[3]]?.displayName ?? "P4"
      return "\(p1) & \(p2) vs \(p3) & \(p4)"
    }

    return "Match"
  }

  func eloPreviews(for match: SessionMatch) -> [EloPreview]? {
    guard let input = scoreInputs[match.id],
          let team1Score = input.team1Value,
          let team2Score = input.team2Value else {
      return nil
    }

    if match.match_type == "singles", match.player_ids.count >= 2 {
      let p1Id = match.player_ids[0]
      let p2Id = match.player_ids[1]
      let p1 = playerMap[p1Id]
      let p2 = playerMap[p2Id]
      let p1Elo = p1?.elo ?? 1500
      let p2Elo = p2?.elo ?? 1500
      let p1Matches = p1?.matchCount ?? 0
      let p2Matches = p2?.matchCount ?? 0

      let p1Outcome = outcome(team1: team1Score, team2: team2Score, isTeam1: true)
      let p2Outcome = outcome(team1: team1Score, team2: team2Score, isTeam1: false)

      let p1Delta = calculateEloChange(playerElo: p1Elo, opponentElo: p2Elo, outcome: p1Outcome, matchCount: p1Matches)
      let p2Delta = calculateEloChange(playerElo: p2Elo, opponentElo: p1Elo, outcome: p2Outcome, matchCount: p2Matches)

      return [
        EloPreview(label: p1?.displayName ?? "Player 1", delta: p1Delta),
        EloPreview(label: p2?.displayName ?? "Player 2", delta: p2Delta)
      ]
    }

    if match.match_type == "doubles", match.player_ids.count >= 4 {
      let team1Players = match.player_ids.prefix(2).compactMap { playerMap[$0] }
      let team2Players = match.player_ids.suffix(2).compactMap { playerMap[$0] }

      let team1Avg = averageElo(team1Players.map { $0.doublesElo ?? 1500 })
      let team2Avg = averageElo(team2Players.map { $0.doublesElo ?? 1500 })

      let team1Outcome = outcome(team1: team1Score, team2: team2Score, isTeam1: true)
      let team2Outcome = outcome(team1: team1Score, team2: team2Score, isTeam1: false)

      let team1Delta = calculateEloChange(playerElo: team1Avg, opponentElo: team2Avg, outcome: team1Outcome, matchCount: 0)
      let team2Delta = calculateEloChange(playerElo: team2Avg, opponentElo: team1Avg, outcome: team2Outcome, matchCount: 0)

      let team1Name = team1Players.map { $0.displayName }.joined(separator: " & ")
      let team2Name = team2Players.map { $0.displayName }.joined(separator: " & ")

      return [
        EloPreview(label: team1Name.isEmpty ? "Team 1" : team1Name, delta: team1Delta),
        EloPreview(label: team2Name.isEmpty ? "Team 2" : team2Name, delta: team2Delta)
      ]
    }

    return nil
  }

  func submitCurrentRound() async {
    guard let sessionId = activeSessionId else { return }
    guard let matches = matchesByRound[currentRound], !matches.isEmpty else { return }
    guard canSubmitCurrentRound else { return }

    submitError = nil
    isSubmitting = true

    do {
      let scores = matches.compactMap { match -> [String: Any]? in
        guard let input = scoreInputs[match.id],
              let team1 = input.team1Value,
              let team2 = input.team2Value else { return nil }
        return [
          "matchId": match.id.uuidString,
          "team1Score": team1,
          "team2Score": team2
        ]
      }

      let supabase = SupabaseService.shared.client
      let session = try await supabase.auth.refreshSession()
      guard let apiBaseURL = SupabaseService.shared.apiBaseURL else {
        throw SessionSubmitError.missingApiBase
      }

      var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/sessions/\(sessionId.uuidString)/rounds/\(currentRound)/submit"))
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
      request.setValue(session.accessToken, forHTTPHeaderField: "X-Supabase-Token")
      request.httpBody = try JSONSerialization.data(withJSONObject: ["matchScores": scores], options: [])

      let (data, response) = try await URLSession.shared.data(for: request)
      guard let httpResponse = response as? HTTPURLResponse else {
        throw SessionSubmitError.badResponse
      }
      if httpResponse.statusCode >= 300 {
        let body = String(data: data, encoding: .utf8) ?? ""
        if httpResponse.statusCode == 401 {
          if let debugInfo = try? await fetchDebugMe(apiBaseURL: apiBaseURL, token: session.accessToken) {
            throw SessionSubmitError.server(
              status: httpResponse.statusCode,
              body: "\(body)\nDetected role: \(debugInfo.detectedRole)\nuser_metadata: \(debugInfo.userMetadataSummary)\napp_metadata: \(debugInfo.appMetadataSummary)"
            )
          }
        }
        throw SessionSubmitError.server(status: httpResponse.statusCode, body: body)
      }

      await load(sessionId: sessionId)
    } catch {
      submitError = error.localizedDescription
    }

    isSubmitting = false
  }

  private func fetchPlayers(sessionId: UUID) async throws -> [SessionPlayer] {
    guard let apiBaseURL = SupabaseService.shared.apiBaseURL else {
      throw SessionSubmitError.missingApiBase
    }

    let supabase = SupabaseService.shared.client
    let session = try await supabase.auth.refreshSession()

    var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/sessions/\(sessionId.uuidString)/players"))
    request.httpMethod = "GET"
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue(session.accessToken, forHTTPHeaderField: "X-Supabase-Token")

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw SessionSubmitError.badResponse
    }
    if httpResponse.statusCode >= 300 {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw SessionSubmitError.server(status: httpResponse.statusCode, body: body)
    }

    let decoded = try JSONDecoder().decode(SessionPlayersResponse.self, from: data)
    return decoded.players.map {
      SessionPlayer(
        id: $0.id,
        sessionPlayerId: $0.sessionPlayerId,
        displayName: $0.name,
        avatarURL: $0.avatar.flatMap(URL.init(string:)),
        team: $0.team,
        elo: $0.elo,
        doublesElo: $0.doublesElo,
        matchCount: $0.matchCount
      )
    }
  }

  private func fetchDebugMe(apiBaseURL: URL, token: String) async throws -> DebugMeResponse {
    var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/debug/me"))
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(token, forHTTPHeaderField: "X-Supabase-Token")

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode < 300 else {
      throw SessionSubmitError.badResponse
    }
    return try JSONDecoder().decode(DebugMeResponse.self, from: data)
  }

  private func setInitialRound() {
    if let pendingRound = roundNumbers.first(where: { round in
      matchesByRound[round]?.contains(where: { $0.status != "completed" }) == true
    }) {
      currentRound = pendingRound
    } else if let last = roundNumbers.last {
      currentRound = last
    } else {
      currentRound = 1
    }
  }

  private func initializeScoreInputs() {
    var inputs: [UUID: MatchScoreInput] = [:]
    for match in matches {
      var input = MatchScoreInput()
      if let team1 = match.team1_score {
        input.team1 = String(team1)
      }
      if let team2 = match.team2_score {
        input.team2 = String(team2)
      }
      inputs[match.id] = input
    }
    scoreInputs = inputs
  }

  private func updateScore(matchId: UUID, team: Int, value: String) {
    var input = scoreInputs[matchId] ?? MatchScoreInput()
    let sanitized = value.filter { $0.isNumber }
    if team == 1 {
      input.team1 = sanitized
    } else {
      input.team2 = sanitized
    }
    scoreInputs[matchId] = input
  }

  private func formatBadge(name: String?, delta: Double?, prefix: String) -> String? {
    guard let name, let delta else { return nil }
    return "\(name) (\(prefix)\(Int(delta.rounded())))"
  }
}

struct SessionDetailSummary {
  let playerCount: Int
  let status: String
  let totalMatches: Int
  let singlesMatches: Int
  let doublesMatches: Int
  let best: String?
  let worst: String?
}

struct SessionPlayer: Identifiable, Hashable {
  let id: UUID
  let sessionPlayerId: UUID
  let displayName: String
  let avatarURL: URL?
  let team: String?
  let elo: Int?
  let doublesElo: Int?
  let matchCount: Int?
}

struct SessionMatch: Identifiable, Decodable {
  let id: UUID
  let match_type: String
  let round_number: Int?
  let match_order: Int?
  let player_ids: [UUID]
  let status: String?
  let team1_score: Int?
  let team2_score: Int?

  var scoreString: String? {
    guard let team1_score, let team2_score else { return nil }
    return "\(team1_score) - \(team2_score)"
  }
}

private struct SessionRow: Decodable {
  let id: UUID
  let player_count: Int?
  let created_at: Date
  let status: String?
  let completed_at: Date?
  let best_player_display_name: String?
  let best_player_delta: Double?
  let worst_player_display_name: String?
  let worst_player_delta: Double?
}

private struct SessionPlayersResponse: Decodable {
  let players: [SessionPlayerAPI]
}

private struct SessionPlayerAPI: Decodable {
  let id: UUID
  let sessionPlayerId: UUID
  let team: String?
  let name: String
  let avatar: String?
  let elo: Int?
  let doublesElo: Int?
  let matchCount: Int?
}

struct MatchScoreInput: Hashable {
  var team1: String = ""
  var team2: String = ""

  var team1Value: Int? { Int(team1) }
  var team2Value: Int? { Int(team2) }
}

struct EloPreview: Identifiable {
  let id = UUID()
  let label: String
  let delta: Double

  var formattedDelta: String {
    let rounded = Int(delta.rounded())
    return rounded >= 0 ? "+\(rounded)" : "\(rounded)"
  }
}

private enum SessionSubmitError: LocalizedError {
  case missingApiBase
  case badResponse
  case server(status: Int, body: String)

  var errorDescription: String? {
    switch self {
    case .missingApiBase:
      return "Missing API base URL"
    case .badResponse:
      return "Invalid response"
    case .server(let status, let body):
      let message = body.isEmpty ? "Failed to submit round" : body
      return "Submit failed (\(status)). \(message)"
    }
  }
}

private struct DebugMeResponse: Decodable {
  let detectedRole: String
  let user_metadata: [String: JSONValue]?
  let app_metadata: [String: JSONValue]?

  var userMetadataSummary: String { summary(from: user_metadata) }
  var appMetadataSummary: String { summary(from: app_metadata) }

  private func summary(from dict: [String: JSONValue]?) -> String {
    guard let dict else { return "{}" }
    let pairs = dict.map { "\($0.key)=\($0.value.description)" }.sorted()
    return "{ " + pairs.joined(separator: ", ") + " }"
  }
}

private enum JSONValue: Decodable, CustomStringConvertible {
  case string(String)
  case number(Double)
  case bool(Bool)
  case array([JSONValue])
  case object([String: JSONValue])
  case null

  var description: String {
    switch self {
    case .string(let value): return value
    case .number(let value): return String(value)
    case .bool(let value): return value ? "true" : "false"
    case .array(let values): return "[" + values.map(\.description).joined(separator: ", ") + "]"
    case .object(let values):
      let pairs = values.map { "\($0.key)=\($0.value.description)" }.sorted()
      return "{ " + pairs.joined(separator: ", ") + " }"
    case .null: return "null"
    }
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else {
      self = .null
    }
  }
}

private enum EloOutcome {
  case win
  case loss
  case draw
}

private func outcome(team1: Int, team2: Int, isTeam1: Bool) -> EloOutcome {
  if team1 == team2 { return .draw }
  if isTeam1 { return team1 > team2 ? .win : .loss }
  return team2 > team1 ? .win : .loss
}

private func calculateKFactor(matchCount: Int) -> Double {
  if matchCount < 10 { return 40 }
  if matchCount < 40 { return 32 }
  return 24
}

private func expectedScore(playerElo: Double, opponentElo: Double) -> Double {
  1 / (1 + pow(10, (opponentElo - playerElo) / 400))
}

private func actualScore(outcome: EloOutcome) -> Double {
  switch outcome {
  case .win: return 1.0
  case .loss: return 0.0
  case .draw: return 0.5
  }
}

private func calculateEloChange(playerElo: Int, opponentElo: Int, outcome: EloOutcome, matchCount: Int) -> Double {
  let k = calculateKFactor(matchCount: matchCount)
  let expected = expectedScore(playerElo: Double(playerElo), opponentElo: Double(opponentElo))
  let actual = actualScore(outcome: outcome)
  return k * (actual - expected)
}

private func averageElo(_ elos: [Int]) -> Int {
  guard !elos.isEmpty else { return 1500 }
  let total = elos.reduce(0, +)
  return Int(round(Double(total) / Double(elos.count)))
}
