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
            PlayerComparisonCard(data: comparison)
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

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Head to Head")
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)

      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text(data.player1.display_name)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
          Text("W \(data.player1.wins) · L \(data.player1.losses) · D \(data.player1.draws)")
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }
        Spacer()
        Text("\(data.player1.elo)")
          .font(.headline.weight(.bold))
          .foregroundStyle(.white)
      }

      Divider().background(Color.white.opacity(0.1))

      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text(data.player2.display_name)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
          Text("W \(data.player2.wins) · L \(data.player2.losses) · D \(data.player2.draws)")
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }
        Spacer()
        Text("\(data.player2.elo)")
          .font(.headline.weight(.bold))
          .foregroundStyle(.white)
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
      currentUserId = SupabaseService.shared.client.auth.currentSession?.user.id

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
