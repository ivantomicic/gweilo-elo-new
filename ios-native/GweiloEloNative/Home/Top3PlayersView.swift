import SwiftUI
import Supabase

struct Top3PlayersView: View {
  @State private var isLoading = true
  @State private var players: [TopPlayer] = []
  @State private var errorMessage: String?

  var body: some View {
    VStack(spacing: 12) {
      HStack {
        Text("Top 3 Players")
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        Spacer()
      }

      ZStack {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .fill(AppColors.card)

        Circle()
          .fill(AppColors.primary.opacity(0.2))
          .blur(radius: 50)
          .frame(width: 140, height: 140)
          .offset(y: -40)

        if isLoading {
          HStack(alignment: .bottom, spacing: 12) {
            PodiumPlaceholder(place: 2, height: 110, color: .gray)
            PodiumPlaceholder(place: 1, height: 140, color: .yellow)
            PodiumPlaceholder(place: 3, height: 90, color: .orange)
          }
          .padding(.horizontal, 12)
          .padding(.vertical, 16)
        } else if let errorMessage {
          Text(errorMessage)
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(.vertical, 28)
        } else {
          HStack(alignment: .bottom, spacing: 12) {
            PodiumPlayerView(player: players.safe(at: 1), place: 2, height: 110, accent: .gray)
            PodiumPlayerView(player: players.safe(at: 0), place: 1, height: 140, accent: .yellow)
            PodiumPlayerView(player: players.safe(at: 2), place: 3, height: 90, accent: .orange)
          }
          .padding(.horizontal, 12)
          .padding(.vertical, 16)
        }
      }
      .frame(maxWidth: .infinity)
      .frame(height: 220)
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .task {
      await loadTopPlayers()
    }
  }

  @MainActor
  private func loadTopPlayers() async {
    isLoading = true
    errorMessage = nil

    do {
      let supabase = SupabaseService.shared.client

      let ratings: [PlayerRating] = try await supabase
        .from("player_ratings")
        .select("player_id, elo")
        .order("elo", ascending: false)
        .limit(3)
        .execute()
        .value

      if ratings.isEmpty {
        players = []
        isLoading = false
        return
      }

      let ids = ratings.map { $0.player_id.uuidString }

      let profiles: [PlayerProfile] = try await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", values: ids)
        .execute()
        .value
      let profileMap = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })

      players = ratings.map { rating in
        let profile = profileMap[rating.player_id]
        return TopPlayer(
          id: rating.player_id,
          displayName: profile?.display_name ?? "User",
          avatarURL: profile?.avatar_url.flatMap(URL.init(string:)),
          elo: Int(rating.elo ?? 1500)
        )
      }

      isLoading = false
    } catch {
      isLoading = false
      errorMessage = "Could not load top players."
    }
  }
}

private struct PodiumPlayerView: View {
  let player: TopPlayer?
  let place: Int
  let height: CGFloat
  let accent: Color

  var body: some View {
    VStack(spacing: 8) {
      ZStack {
        Circle()
          .fill(accent.opacity(0.3))
          .frame(width: place == 1 ? 70 : 56, height: place == 1 ? 70 : 56)

        if let url = player?.avatarURL {
          AsyncImage(url: url) { image in
            image.resizable().scaledToFill()
          } placeholder: {
            Color.black.opacity(0.4)
          }
          .frame(width: place == 1 ? 62 : 50, height: place == 1 ? 62 : 50)
          .clipShape(Circle())
        } else {
          Text(player?.displayName.first?.uppercased() ?? "?")
            .font(.headline)
            .foregroundStyle(.white)
        }
      }
      .overlay(
        Text("#\(place)")
          .font(.caption2.weight(.bold))
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(accent)
          .clipShape(Capsule())
          .offset(y: 24)
      )

      Text(player?.displayName ?? "—")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.white)
        .lineLimit(1)

      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(LinearGradient(colors: [accent.opacity(0.6), accent.opacity(0.2)], startPoint: .top, endPoint: .bottom))
        .frame(height: height)
        .overlay(
          Text(player != nil ? "\(player!.elo)" : "—")
            .font(.caption)
            .foregroundStyle(.white.opacity(0.8))
            .padding(.top, 8),
          alignment: .top
        )
    }
    .frame(maxWidth: .infinity)
  }
}

private struct PodiumPlaceholder: View {
  let place: Int
  let height: CGFloat
  let color: Color

  var body: some View {
    VStack(spacing: 8) {
      Circle()
        .fill(color.opacity(0.2))
        .frame(width: place == 1 ? 70 : 56, height: place == 1 ? 70 : 56)

      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(color.opacity(0.2))
        .frame(height: height)
    }
    .frame(maxWidth: .infinity)
  }
}

private struct PlayerRating: Decodable {
  let player_id: UUID
  let elo: Double?
}

private struct PlayerProfile: Decodable {
  let id: UUID
  let display_name: String?
  let avatar_url: String?
}

private struct TopPlayer: Identifiable {
  let id: UUID
  let displayName: String
  let avatarURL: URL?
  let elo: Int
}

private extension Array {
  func safe(at index: Int) -> Element? {
    guard index >= 0 && index < count else { return nil }
    return self[index]
  }
}
