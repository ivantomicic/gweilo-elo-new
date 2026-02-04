import SwiftUI

struct PlayerDetailView: View {
  let playerId: UUID

  @StateObject private var viewModel = PlayerDetailViewModel()

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        if viewModel.isLoading {
          ProgressView("Loading…")
            .frame(maxWidth: .infinity, minHeight: 160)
        } else if let error = viewModel.errorMessage {
          Text(error)
            .foregroundStyle(.red)
        } else {
          header

          if let comparison = viewModel.comparison {
            PlayerComparisonCard(data: comparison, currentUserId: viewModel.currentUserId)
          }

          PerformanceTrendCard(
            playerId: playerId,
            secondaryPlayerId: viewModel.currentUserId,
            title: "Player Progress"
          )
        }
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
    .background(AppColors.background)
    .navigationTitle(viewModel.playerName)
    .task {
      await viewModel.load(playerId: playerId)
    }
  }

  private var header: some View {
    HStack(spacing: 12) {
      AvatarView(url: viewModel.avatarURL, fallback: viewModel.playerName)
        .frame(width: 64, height: 64)

      VStack(alignment: .leading, spacing: 6) {
        Text(viewModel.playerName)
          .font(.title2.weight(.bold))
          .foregroundStyle(.white)
        if let elo = viewModel.currentElo {
          Text("ELO \(Int(elo))")
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }
      }
      Spacer()
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct PlayerComparisonCard: View {
  let data: HeadToHeadResponse
  let currentUserId: UUID?

  var body: some View {
    let player1 = data.player1
    let player2 = data.player2
    let player1Name = player1.id == currentUserId?.uuidString ? "You" : player1.display_name
    let player2Name = player2.id == currentUserId?.uuidString ? "You" : player2.display_name
    let p1HigherElo = player1.elo >= player2.elo
    let p1HigherWins = player1.wins >= player2.wins
    let p1HigherSets = player1.setsWon >= player2.setsWon

    return VStack(alignment: .leading, spacing: 14) {
      Text("Head to Head")
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)

      HStack(alignment: .center, spacing: 12) {
        PlayerBadge(name: player1Name, avatar: player1.avatar, highlight: p1HigherElo)

        Text("VS")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(AppColors.muted)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(Color.white.opacity(0.08))
          .clipShape(Capsule())

        PlayerBadge(name: player2Name, avatar: player2.avatar, highlight: !p1HigherElo)
      }

      if data.totalMatches > 0 {
        HStack(spacing: 12) {
          ComparisonStat(
            label: "ELO",
            leftValue: player1.elo,
            rightValue: player2.elo,
            leftHighlight: p1HigherElo
          )
          ComparisonStat(
            label: "WINS",
            leftValue: player1.wins,
            rightValue: player2.wins,
            leftHighlight: p1HigherWins
          )
          ComparisonStat(
            label: "SETS",
            leftValue: player1.setsWon,
            rightValue: player2.setsWon,
            leftHighlight: p1HigherSets
          )
        }
      } else {
        Text("No matches yet")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }

      Text("Total matches: \(data.totalMatches)")
        .font(.caption)
        .foregroundStyle(AppColors.muted)
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct PlayerBadge: View {
  let name: String
  let avatar: String?
  let highlight: Bool

  var body: some View {
    VStack(spacing: 6) {
      AvatarView(url: avatar.flatMap(URL.init(string:)), fallback: name)
        .frame(width: 48, height: 48)
        .overlay(
          Circle()
            .stroke(highlight ? Color.green : Color.white.opacity(0.2), lineWidth: 2)
        )
      Text(name)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
  }
}

private struct ComparisonStat: View {
  let label: String
  let leftValue: Int
  let rightValue: Int
  let leftHighlight: Bool

  var body: some View {
    VStack(spacing: 6) {
      Text(label)
        .font(.caption2)
        .foregroundStyle(AppColors.muted)
      HStack(spacing: 6) {
        Text("\(leftValue)")
          .font(.caption.weight(.semibold))
          .foregroundStyle(leftHighlight ? .green : .red)
        Text("-")
          .font(.caption2)
          .foregroundStyle(AppColors.muted)
        Text("\(rightValue)")
          .font(.caption.weight(.semibold))
          .foregroundStyle(leftHighlight ? .red : .green)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 8)
    .background(Color.white.opacity(0.04))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

@MainActor
final class PlayerDetailViewModel: ObservableObject {
  @Published var playerName: String = "Player"
  @Published var avatarURL: URL?
  @Published var currentElo: Double?
  @Published var comparison: HeadToHeadResponse?
  @Published var currentUserId: UUID?
  @Published var isLoading = false
  @Published var errorMessage: String?

  func load(playerId: UUID) async {
    isLoading = true
    errorMessage = nil

    do {
      let supabase = SupabaseService.shared.client
      if let session = try? await supabase.auth.session {
        currentUserId = session.user.id
      } else {
        currentUserId = supabase.auth.currentSession?.user.id
      }

      let player: PlayerResponse = try await APIClient.get("api/player/\(playerId.uuidString)")
      playerName = player.display_name
      avatarURL = player.avatar.flatMap(URL.init(string:))

      let history: EloHistoryResponse = try await APIClient.get(
        "api/player/elo-history",
        queryItems: [URLQueryItem(name: "playerId", value: playerId.uuidString)]
      )
      currentElo = history.currentElo

      if let currentUserId, currentUserId != playerId {
        comparison = try await APIClient.get(
          "api/player/\(playerId.uuidString)/head-to-head",
          queryItems: [URLQueryItem(name: "opponentId", value: currentUserId.uuidString)]
        )
      } else {
        comparison = nil
      }

      isLoading = false
    } catch {
      isLoading = false
      errorMessage = error.localizedDescription
    }
  }
}

struct PlayerResponse: Decodable {
  let id: String
  let display_name: String
  let avatar: String?
}

struct HeadToHeadResponse: Decodable {
  let player1: HeadToHeadPlayer
  let player2: HeadToHeadPlayer
  let totalMatches: Int
}

struct HeadToHeadPlayer: Decodable {
  let id: String
  let display_name: String
  let avatar: String?
  let elo: Int
  let wins: Int
  let losses: Int
  let draws: Int
  let setsWon: Int
  let setsLost: Int
}
