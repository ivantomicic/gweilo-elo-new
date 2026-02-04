import SwiftUI
import Supabase

struct StatisticsView: View {
  @StateObject private var viewModel = StatisticsViewModel()
  @State private var selection: StatsViewMode = .singles

  var body: some View {
    NavigationStack {
      VStack(spacing: 16) {
        Picker("Mode", selection: $selection) {
          Text("Singles").tag(StatsViewMode.singles)
          Text("Doubles (Players)").tag(StatsViewMode.doublesPlayers)
          Text("Doubles (Teams)").tag(StatsViewMode.doublesTeams)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)

        Group {
          if viewModel.isLoading {
            ProgressView("Loading stats…")
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
              .padding(.top, 40)
          } else if let error = viewModel.errorMessage {
            Text(error)
              .foregroundStyle(.red)
              .padding(.top, 40)
          } else {
            StatsListView(mode: selection, viewModel: viewModel)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .padding(.top, 8)
      .background(AppColors.background)
      .navigationTitle("Statistics")
      .task {
        await viewModel.load(mode: selection)
      }
      .onChange(of: selection) { newValue in
        Task { await viewModel.load(mode: newValue) }
      }
    }
  }
}

private struct StatsListView: View {
  let mode: StatsViewMode
  @ObservedObject var viewModel: StatisticsViewModel

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 12) {
        switch mode {
        case .singles:
          ForEach(Array(viewModel.singles.enumerated()), id: \ .element.playerId) { index, player in
            NavigationLink(destination: PlayerDetailView(playerId: player.playerId)) {
              PlayerStatRow(rank: index + 1, player: player)
            }
          }
        case .doublesPlayers:
          ForEach(Array(viewModel.doublesPlayers.enumerated()), id: \ .element.playerId) { index, player in
            NavigationLink(destination: PlayerDetailView(playerId: player.playerId)) {
              PlayerStatRow(rank: index + 1, player: player)
            }
          }
        case .doublesTeams:
          ForEach(Array(viewModel.doublesTeams.enumerated()), id: \ .element.teamId) { index, team in
            TeamStatRow(rank: index + 1, team: team)
          }
        }
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
  }
}

private struct PlayerStatRow: View {
  let rank: Int
  let player: PlayerStat

  var body: some View {
    HStack(spacing: 12) {
      Text("#\(rank)")
        .font(.caption.weight(.bold))
        .foregroundStyle(AppColors.muted)
        .frame(width: 32, alignment: .leading)

      AvatarView(url: player.avatarURL, fallback: player.displayName)
        .frame(width: 44, height: 44)

      VStack(alignment: .leading, spacing: 4) {
        Text(player.displayName)
          .font(.headline)
          .foregroundStyle(.white)
        Text("W \(player.wins) • L \(player.losses) • D \(player.draws)")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 2) {
        Text("\(player.elo)")
          .font(.headline.weight(.bold))
          .foregroundStyle(.white)
        Text("ELO")
          .font(.caption2)
          .foregroundStyle(AppColors.muted)
      }
    }
    .padding(14)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

private struct TeamStatRow: View {
  let rank: Int
  let team: TeamStat

  var body: some View {
    HStack(spacing: 12) {
      Text("#\(rank)")
        .font(.caption.weight(.bold))
        .foregroundStyle(AppColors.muted)
        .frame(width: 32, alignment: .leading)

      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 8) {
          AvatarView(url: team.player1.avatarURL, fallback: team.player1.displayName)
            .frame(width: 28, height: 28)
          Text(team.player1.displayName)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
        }
        HStack(spacing: 8) {
          AvatarView(url: team.player2.avatarURL, fallback: team.player2.displayName)
            .frame(width: 28, height: 28)
          Text(team.player2.displayName)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
        }
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 2) {
        Text("\(team.elo)")
          .font(.headline.weight(.bold))
          .foregroundStyle(.white)
        Text("ELO")
          .font(.caption2)
          .foregroundStyle(AppColors.muted)
      }
    }
    .padding(14)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

enum StatsViewMode: String, CaseIterable {
  case singles
  case doublesPlayers
  case doublesTeams
}

@MainActor
final class StatisticsViewModel: ObservableObject {
  @Published var singles: [PlayerStat] = []
  @Published var doublesPlayers: [PlayerStat] = []
  @Published var doublesTeams: [TeamStat] = []
  @Published var isLoading = false
  @Published var errorMessage: String?

  func load(mode: StatsViewMode) async {
    isLoading = true
    errorMessage = nil

    do {
      switch mode {
      case .singles:
        if singles.isEmpty { singles = try await fetchSingles() }
      case .doublesPlayers:
        if doublesPlayers.isEmpty { doublesPlayers = try await fetchDoublesPlayers() }
      case .doublesTeams:
        if doublesTeams.isEmpty { doublesTeams = try await fetchDoublesTeams() }
      }
      isLoading = false
    } catch {
      isLoading = false
      errorMessage = "Failed to load statistics."
    }
  }

  private func fetchSingles() async throws -> [PlayerStat] {
    let supabase = SupabaseService.shared.client

    let ratings: [PlayerRating] = try await supabase
      .from("player_ratings")
      .select("player_id, elo, matches_played, wins, losses, draws")
      .order("elo", ascending: false)
      .execute()
      .value

    let profileMap = try await fetchProfiles(for: ratings.map { $0.player_id })

    return ratings.map { rating in
      let profile = profileMap[rating.player_id]
      return PlayerStat(
        playerId: rating.player_id,
        displayName: profile?.display_name ?? "User",
        avatarURL: profile?.avatar_url.flatMap(URL.init(string:)),
        matchesPlayed: rating.matches_played ?? 0,
        wins: rating.wins ?? 0,
        losses: rating.losses ?? 0,
        draws: rating.draws ?? 0,
        elo: Int(rating.elo ?? 1500)
      )
    }
  }

  private func fetchDoublesPlayers() async throws -> [PlayerStat] {
    let supabase = SupabaseService.shared.client

    let ratings: [PlayerRating] = try await supabase
      .from("player_double_ratings")
      .select("player_id, elo, matches_played, wins, losses, draws")
      .order("elo", ascending: false)
      .execute()
      .value

    let profileMap = try await fetchProfiles(for: ratings.map { $0.player_id })

    return ratings.map { rating in
      let profile = profileMap[rating.player_id]
      return PlayerStat(
        playerId: rating.player_id,
        displayName: profile?.display_name ?? "User",
        avatarURL: profile?.avatar_url.flatMap(URL.init(string:)),
        matchesPlayed: rating.matches_played ?? 0,
        wins: rating.wins ?? 0,
        losses: rating.losses ?? 0,
        draws: rating.draws ?? 0,
        elo: Int(rating.elo ?? 1500)
      )
    }
  }

  private func fetchDoublesTeams() async throws -> [TeamStat] {
    let supabase = SupabaseService.shared.client

    let ratings: [DoubleTeamRating] = try await supabase
      .from("double_team_ratings")
      .select("team_id, elo, matches_played, wins, losses, draws")
      .order("elo", ascending: false)
      .execute()
      .value

    let teamIds = ratings.map { $0.team_id.uuidString }

    let teams: [DoubleTeam] = try await supabase
      .from("double_teams")
      .select("id, player_1_id, player_2_id")
      .in("id", values: teamIds)
      .execute()
      .value

    let playerIds = teams.flatMap { [$0.player_1_id, $0.player_2_id] }
    let profileMap = try await fetchProfiles(for: playerIds)

    let teamMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.id, $0) })

    return ratings.compactMap { rating in
      guard let team = teamMap[rating.team_id] else { return nil }

      let player1Profile = profileMap[team.player_1_id]
      let player2Profile = profileMap[team.player_2_id]

      return TeamStat(
        teamId: rating.team_id,
        player1: PlayerStatTeamMember(
          id: team.player_1_id,
          displayName: player1Profile?.display_name ?? "Player 1",
          avatarURL: player1Profile?.avatar_url.flatMap(URL.init(string:))
        ),
        player2: PlayerStatTeamMember(
          id: team.player_2_id,
          displayName: player2Profile?.display_name ?? "Player 2",
          avatarURL: player2Profile?.avatar_url.flatMap(URL.init(string:))
        ),
        matchesPlayed: rating.matches_played ?? 0,
        wins: rating.wins ?? 0,
        losses: rating.losses ?? 0,
        draws: rating.draws ?? 0,
        elo: Int(rating.elo ?? 1500)
      )
    }
  }

  private func fetchProfiles(for ids: [UUID]) async throws -> [UUID: Profile] {
    guard !ids.isEmpty else { return [:] }

    let supabase = SupabaseService.shared.client
    let idStrings = ids.map { $0.uuidString }

    let profiles: [Profile] = try await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", values: idStrings)
      .execute()
      .value

    return Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })
  }
}

struct PlayerStat: Identifiable {
  let playerId: UUID
  let displayName: String
  let avatarURL: URL?
  let matchesPlayed: Int
  let wins: Int
  let losses: Int
  let draws: Int
  let elo: Int

  var id: UUID { playerId }
}

struct TeamStat: Identifiable {
  let teamId: UUID
  let player1: PlayerStatTeamMember
  let player2: PlayerStatTeamMember
  let matchesPlayed: Int
  let wins: Int
  let losses: Int
  let draws: Int
  let elo: Int

  var id: UUID { teamId }
}

struct PlayerStatTeamMember {
  let id: UUID
  let displayName: String
  let avatarURL: URL?
}

private struct PlayerRating: Decodable {
  let player_id: UUID
  let elo: Double?
  let matches_played: Int?
  let wins: Int?
  let losses: Int?
  let draws: Int?
}

private struct DoubleTeamRating: Decodable {
  let team_id: UUID
  let elo: Double?
  let matches_played: Int?
  let wins: Int?
  let losses: Int?
  let draws: Int?
}

private struct DoubleTeam: Decodable {
  let id: UUID
  let player_1_id: UUID
  let player_2_id: UUID
}

private struct Profile: Decodable {
  let id: UUID
  let display_name: String?
  let avatar_url: String?
}
