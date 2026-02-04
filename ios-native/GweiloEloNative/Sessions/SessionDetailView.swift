import SwiftUI
import Supabase

struct SessionDetailView: View {
  let sessionId: UUID
  @StateObject private var viewModel = SessionDetailViewModel()
  @State private var selection: SessionDetailSection = .overview

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

enum SessionDetailSection {
  case overview
  case matches
  case players
}

@MainActor
final class SessionDetailViewModel: ObservableObject {
  @Published var summary: SessionDetailSummary?
  @Published var matches: [SessionMatch] = []
  @Published var players: [SessionPlayer] = []
  @Published var playerMap: [UUID: SessionPlayer] = [:]
  @Published var isLoading = false
  @Published var errorMessage: String?

  func load(sessionId: UUID) async {
    isLoading = true
    errorMessage = nil

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

      let playerRows: [SessionPlayerRowDB] = try await supabase
        .from("session_players")
        .select("id, player_id, team")
        .eq("session_id", value: sessionId.uuidString)
        .execute()
        .value

      let playerIds = playerRows.map { $0.player_id }
      let profiles: [ProfileRow] = try await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", values: playerIds.map { $0.uuidString })
        .execute()
        .value

      let profileMap = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })

      players = playerRows.map { row in
        let profile = profileMap[row.player_id]
        return SessionPlayer(
          id: row.player_id,
          displayName: profile?.display_name ?? "User",
          avatarURL: profile?.avatar_url.flatMap(URL.init(string:)),
          team: row.team
        )
      }

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
      isLoading = false
    } catch {
      isLoading = false
      errorMessage = "Failed to load session."
    }
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
  let displayName: String
  let avatarURL: URL?
  let team: String?
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

private struct SessionPlayerRowDB: Decodable {
  let id: UUID
  let player_id: UUID
  let team: String?
}

private struct ProfileRow: Decodable {
  let id: UUID
  let display_name: String?
  let avatar_url: String?
}
