import SwiftUI
import Supabase

struct StartSessionView: View {
  let onCreated: (UUID) -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var model = StartSessionFlowModel()
  @State private var path: [StartSessionStep] = []

  var body: some View {
    NavigationStack(path: $path) {
      StartSessionSetupStep(model: model) {
        path.append(.players)
      }
      .navigationDestination(for: StartSessionStep.self) { step in
        switch step {
        case .players:
          StartSessionPlayersStep(model: model) {
            path.removeLast()
          } onContinue: {
            if model.selectedCount == 2 {
              Task {
                await startSessionAndClose()
              }
            } else {
              model.prepareSchedule()
              path.append(.schedule)
            }
          }
        case .schedule:
          StartSessionScheduleStep(model: model) {
            path.removeLast()
          } onStart: {
            Task {
              await startSessionAndClose()
            }
          }
        }
      }
    }
  }

  private func startSessionAndClose() async {
    do {
      let sessionId = try await model.startSession()
      if #available(iOS 16.1, *) {
        let createdAt = ISO8601DateFormatter().string(from: model.sessionDate)
        let liveSession = ActiveSession(id: sessionId, player_count: model.maxSelections, created_at: createdAt)
        await SessionLiveActivityManager.shared.sync(with: liveSession)
      }
      onCreated(sessionId)
      dismiss()
    } catch {
      model.errorMessage = error.localizedDescription
    }
  }
}

private enum StartSessionStep: Hashable {
  case players
  case schedule
}

// MARK: - Step 1 (Time + Player Count)

private struct StartSessionSetupStep: View {
  @ObservedObject var model: StartSessionFlowModel
  let onContinue: () -> Void

  @State private var isDatePickerOpen = false

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        StepIndicator(text: "Step 1 of 3")

        Text("Choose session time and player count.")
          .font(.subheadline)
          .foregroundStyle(AppColors.muted)
          .frame(maxWidth: .infinity, alignment: .leading)

        SessionTimeCard(displayText: model.sessionDateDisplay) {
          isDatePickerOpen = true
        }

        PlayerCountGrid(selected: $model.selectedCount)

        InfoBox(text: "Pick 2–6 players. For 6 players, doubles teams will be formed based on selection order.")

        Button(action: {
          Haptics.tap()
          onContinue()
        }) {
          HStack(spacing: 6) {
            Text("Continue")
              .font(.headline.weight(.semibold))
            Image(systemName: "arrow.right")
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 14)
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.selectedCount == nil)
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
    .navigationTitle("Start Session")
    .sheet(isPresented: $isDatePickerOpen) {
      SessionDatePickerSheet(date: $model.sessionDate)
    }
  }
}

private struct SessionTimeCard: View {
  let displayText: String
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      HStack(spacing: 12) {
        Image(systemName: "calendar")
          .font(.title3)
          .foregroundStyle(AppColors.primary)
          .padding(10)
          .background(AppColors.card)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        VStack(alignment: .leading, spacing: 4) {
          Text("Session time")
            .font(.caption.weight(.semibold))
            .foregroundStyle(AppColors.muted)
          Text(displayText)
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
        }
        Spacer()
        Image(systemName: "pencil")
          .foregroundStyle(AppColors.muted)
      }
      .padding(16)
      .background(AppColors.card)
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

private struct SessionDatePickerSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var date: Date

  var body: some View {
    NavigationStack {
      VStack(spacing: 24) {
        DatePicker("", selection: $date, displayedComponents: [.date, .hourAndMinute])
          .datePickerStyle(.graphical)
          .labelsHidden()
          .tint(AppColors.primary)

        Button("Done") {
          dismiss()
        }
        .buttonStyle(.borderedProminent)
      }
      .padding()
      .navigationTitle("Session time")
    }
  }
}

private struct PlayerCountGrid: View {
  @Binding var selected: Int?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Number of players")
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)

      LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
        ForEach(2...6, id: \.self) { count in
          let isSelected = selected == count
          Button {
            Haptics.tap()
            selected = count
          } label: {
            VStack(spacing: 6) {
              Text("\(count)")
                .font(.title.weight(.bold))
              Text("PLAYERS")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(isSelected ? .white : AppColors.muted)
            }
            .frame(maxWidth: .infinity, minHeight: 90)
            .background(isSelected ? AppColors.primary : AppColors.card)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(isSelected ? AppColors.primary : Color.clear, lineWidth: 2)
            )
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}

private struct StepIndicator: View {
  let text: String

  var body: some View {
    HStack {
      Spacer()
      Text(text.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(AppColors.primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(AppColors.primary.opacity(0.15))
        .clipShape(Capsule())
    }
  }
}

private struct InfoBox: View {
  let text: String

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "info.circle.fill")
        .foregroundStyle(AppColors.primary)
      Text(text)
        .font(.footnote)
        .foregroundStyle(AppColors.muted)
      Spacer()
    }
    .padding(14)
    .background(AppColors.card.opacity(0.6))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

// MARK: - Step 2 (Select Players)

private struct StartSessionPlayersStep: View {
  @ObservedObject var model: StartSessionFlowModel
  let onBack: () -> Void
  let onContinue: () -> Void

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        StepIndicator(text: "Step 2 of 3")

        Text("Select players for this session.")
          .font(.subheadline)
          .foregroundStyle(AppColors.muted)
          .frame(maxWidth: .infinity, alignment: .leading)

        if model.isLoadingPlayers {
          ProgressView("Loading players…")
            .tint(AppColors.primary)
            .frame(maxWidth: .infinity)
        }

        if let errorMessage = model.errorMessage {
          ErrorNotice(message: errorMessage) {
            Task { await model.loadPlayers(force: true) }
          }
        }

        if !model.isLoadingPlayers && model.players.isEmpty && model.errorMessage == nil {
          EmptyStateNotice(text: "No players found yet. Try again.")
        }

        playerScroller

        if model.isDoubles {
          TeamSelectionView(selectedPlayers: model.selectedPlayers, maxSelections: model.maxSelections, onRemove: model.removePlayer)
        } else {
          SinglesSelectionView(selectedPlayers: model.selectedPlayers, maxSelections: model.maxSelections, onRemove: model.removePlayer)
        }

        InfoBox(text: model.isDoubles ? "Teams are formed based on selection order." : "Each player plays everyone once.")

        HStack(spacing: 12) {
          Button("Back") {
            Haptics.tap()
            onBack()
          }
          .buttonStyle(.bordered)

          Button(model.selectedCount == 2 ? "Start Session" : "Continue") {
            Haptics.tap()
            onContinue()
          }
          .buttonStyle(.borderedProminent)
          .disabled(!model.isComplete)
        }
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
    .navigationTitle("Select Players")
    .task {
      await model.loadPlayers()
    }
  }

  private var playerScroller: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 12) {
        ForEach(model.availablePlayers) { player in
          Button {
            Haptics.tap()
            model.selectPlayer(player)
          } label: {
            VStack(spacing: 6) {
              AvatarView(url: player.avatarURL, fallback: player.name)
                .frame(width: 48, height: 48)
              Text(player.name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
            }
            .padding(10)
            .background(AppColors.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(model.canSelectMore ? 1 : 0.4)
          }
          .buttonStyle(.plain)
          .disabled(!model.canSelectMore)
        }
      }
      .padding(.vertical, 6)
    }
  }
}

private struct ErrorNotice: View {
  let message: String
  let onRetry: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundStyle(.orange)
        Text(message)
          .font(.footnote)
          .foregroundStyle(.white)
      }
      Button("Retry") {
        Haptics.tap()
        onRetry()
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.small)
    }
    .padding(14)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

private struct EmptyStateNotice: View {
  let text: String

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "person.crop.circle.badge.questionmark")
        .foregroundStyle(AppColors.muted)
      Text(text)
        .font(.footnote)
        .foregroundStyle(AppColors.muted)
      Spacer()
    }
    .padding(14)
    .background(AppColors.card.opacity(0.6))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

private struct SinglesSelectionView: View {
  let selectedPlayers: [StartSessionPlayer]
  let maxSelections: Int
  let onRemove: (UUID) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Selected Players")
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        Spacer()
        Text("\(selectedPlayers.count) / \(maxSelections)")
          .font(.caption.weight(.bold))
          .foregroundStyle(AppColors.primary)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(AppColors.primary.opacity(0.15))
          .clipShape(Capsule())
      }

      ForEach(0..<maxSelections, id: \.self) { index in
        let player = index < selectedPlayers.count ? selectedPlayers[index] : nil
        HStack(spacing: 12) {
          if let player {
            AvatarView(url: player.avatarURL, fallback: player.name)
              .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 4) {
              Text(player.name)
                .foregroundStyle(.white)
                .font(.subheadline.weight(.semibold))
              if let elo = player.elo {
                Text("ELO \(elo)")
                  .font(.caption2)
                  .foregroundStyle(AppColors.muted)
              }
            }
            Spacer()
            Button {
              Haptics.tap()
              onRemove(player.id)
            } label: {
              Image(systemName: "xmark.circle.fill")
                .foregroundStyle(AppColors.muted)
            }
          } else {
            Circle()
              .stroke(AppColors.fieldBorder, lineWidth: 1)
              .frame(width: 40, height: 40)
              .overlay(Text("\(index + 1)").font(.caption).foregroundStyle(AppColors.muted))
            Text("Select player")
              .font(.caption)
              .foregroundStyle(AppColors.muted)
            Spacer()
          }
        }
        .padding(12)
        .background(AppColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
    }
  }
}

private struct TeamSelectionView: View {
  let selectedPlayers: [StartSessionPlayer]
  let maxSelections: Int
  let onRemove: (UUID) -> Void

  private let teamNames = ["Team A", "Team B", "Team C"]

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Teams")
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        Spacer()
        Text("\(selectedPlayers.count) / \(maxSelections)")
          .font(.caption.weight(.bold))
          .foregroundStyle(AppColors.primary)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(AppColors.primary.opacity(0.15))
          .clipShape(Capsule())
      }

      ForEach(0..<3, id: \.self) { teamIndex in
        let teamPlayers = teamPlayersFor(index: teamIndex)
        VStack(alignment: .leading, spacing: 10) {
          HStack {
            Text(teamNames[teamIndex])
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.white)
            Spacer()
            Text("\(teamPlayers.count) / 2")
              .font(.caption2.weight(.bold))
              .foregroundStyle(AppColors.primary)
          }

          HStack(spacing: 10) {
            ForEach(0..<2, id: \.self) { slot in
              let player = slot < teamPlayers.count ? teamPlayers[slot] : nil
              HStack(spacing: 8) {
                if let player {
                  AvatarView(url: player.avatarURL, fallback: player.name)
                    .frame(width: 36, height: 36)
                  VStack(alignment: .leading, spacing: 2) {
                    Text(player.name)
                      .font(.caption.weight(.semibold))
                      .foregroundStyle(.white)
                    if let elo = player.elo {
                      Text("ELO \(elo)")
                        .font(.caption2)
                        .foregroundStyle(AppColors.muted)
                    }
                  }
                  Spacer()
                  Button {
                    Haptics.tap()
                    onRemove(player.id)
                  } label: {
                    Image(systemName: "xmark.circle.fill")
                      .foregroundStyle(AppColors.muted)
                  }
                } else {
                  Text("Select player")
                    .font(.caption)
                    .foregroundStyle(AppColors.muted)
                  Spacer()
                }
              }
              .padding(10)
              .frame(maxWidth: .infinity)
              .background(AppColors.card.opacity(0.6))
              .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
          }
        }
        .padding(12)
        .background(AppColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      }
    }
  }

  private func teamPlayersFor(index: Int) -> [StartSessionPlayer] {
    let start = index * 2
    let end = min(start + 2, selectedPlayers.count)
    if start >= end { return [] }
    return Array(selectedPlayers[start..<end])
  }
}

// MARK: - Step 3 (Schedule)

private struct StartSessionScheduleStep: View {
  @ObservedObject var model: StartSessionFlowModel
  let onBack: () -> Void
  let onStart: () -> Void

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        StepIndicator(text: "Step 3 of 3")

        Button {
          Haptics.tap()
          Task { await model.randomizeSchedule() }
        } label: {
          HStack(spacing: 8) {
            Image(systemName: "shuffle")
            Text("Randomize schedule")
              .font(.subheadline.weight(.semibold))
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
          .background(AppColors.card)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(model.isShuffling)

        VStack(spacing: 16) {
          ForEach(model.rounds) { round in
            RoundCardView(round: round)
          }
        }

        HStack(spacing: 12) {
          Button("Back") {
            Haptics.tap()
            onBack()
          }
          .buttonStyle(.bordered)

          Button(model.isStartingSession ? "Creating..." : "Start Session") {
            Haptics.tap()
            onStart()
          }
          .buttonStyle(.borderedProminent)
          .disabled(model.isStartingSession)
        }
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
    .navigationTitle("Schedule")
  }
}

private struct RoundCardView: View {
  let round: StartSessionRound

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      ZStack {
        Circle()
          .stroke(round.isDynamic ? AppColors.primary : AppColors.fieldBorder, lineWidth: 2)
          .frame(width: 40, height: 40)
        Text("\(round.roundNumber)")
          .font(.caption.weight(.bold))
          .foregroundStyle(.white)
      }

      VStack(alignment: .leading, spacing: 10) {
        if round.isDynamic {
          Text("Dynamic round")
            .font(.caption.weight(.semibold))
            .foregroundStyle(AppColors.primary)
          Text("Schedule will update after the previous round finishes.")
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }

        ForEach(round.matches.indices, id: \.self) { index in
          MatchRowView(match: round.matches[index])
        }
      }
      .padding(12)
      .background(AppColors.card)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
  }
}

private struct MatchRowView: View {
  let match: StartSessionMatch

  var body: some View {
    HStack(spacing: 8) {
      if match.type == "singles" {
        playerChip(match.players.first)
        Text("VS")
          .font(.caption2.weight(.bold))
          .foregroundStyle(AppColors.muted)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(AppColors.card.opacity(0.6))
          .clipShape(RoundedRectangle(cornerRadius: 6))
        playerChip(match.players.dropFirst().first)
      } else {
        teamChip(players: Array(match.players.prefix(2)))
        Text("VS")
          .font(.caption2.weight(.bold))
          .foregroundStyle(AppColors.muted)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(AppColors.card.opacity(0.6))
          .clipShape(RoundedRectangle(cornerRadius: 6))
        teamChip(players: Array(match.players.suffix(2)))
      }
    }
    .padding(8)
    .background(Color.white.opacity(0.04))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }

  private func playerChip(_ player: StartSessionPayloadPlayer?) -> some View {
    HStack(spacing: 6) {
      AvatarView(url: player?.avatar.flatMap(URL.init(string:)), fallback: player?.name ?? "User")
        .frame(width: 28, height: 28)
      Text(player?.name ?? "TBD")
        .font(.caption)
        .foregroundStyle(.white)
    }
  }

  private func teamChip(players: [StartSessionPayloadPlayer]) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(players.indices, id: \.self) { index in
        let player = players[index]
        Text(player.name)
          .font(.caption2)
          .foregroundStyle(.white)
      }
    }
  }
}

// MARK: - Flow Model

@MainActor
final class StartSessionFlowModel: ObservableObject {
  @Published var sessionDate: Date = Date()
  @Published var selectedCount: Int?
  @Published var players: [StartSessionPlayer] = []
  @Published var selectedPlayers: [StartSessionPlayer] = []
  @Published var rounds: [StartSessionRound] = []
  @Published var isLoadingPlayers = false
  @Published var isShuffling = false
  @Published var isStartingSession = false
  @Published var errorMessage: String?

  private var originalSchedule: [StartSessionRound] = []
  private var shuffledPlayers: [StartSessionPlayer] = []

  var maxSelections: Int { selectedCount ?? 0 }
  var isComplete: Bool { selectedCount != nil && selectedPlayers.count == maxSelections }
  var isDoubles: Bool { selectedCount == 6 }
  var canSelectMore: Bool { selectedCount != nil && selectedPlayers.count < maxSelections }

  var availablePlayers: [StartSessionPlayer] {
    let selectedIds = Set(selectedPlayers.map { $0.id })
    return players.filter { !selectedIds.contains($0.id) }
  }

  var sessionDateDisplay: String {
    let date = sessionDate
    let formatter = DateFormatter()
    formatter.dateFormat = "EEE, d MMM · HH:mm"
    return formatter.string(from: date)
  }

  func loadPlayers(force: Bool = false) async {
    if !players.isEmpty && !force { return }
    isLoadingPlayers = true
    errorMessage = nil
    defer { isLoadingPlayers = false }

    do {
      let supabase = SupabaseService.shared.client
      let session = try await supabase.auth.refreshSession()

      let apiBaseURL = SupabaseService.shared.apiBaseURL
      guard let apiBaseURL else { throw StartSessionError.missingApiBase }

      var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/admin/users"))
      request.httpMethod = "GET"
      request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
      request.setValue(session.accessToken, forHTTPHeaderField: "X-Supabase-Token")

      let (data, response) = try await URLSession.shared.data(for: request)
      guard let httpResponse = response as? HTTPURLResponse else {
        throw StartSessionError.badResponse
      }
      if httpResponse.statusCode >= 300 {
        let body = String(data: data, encoding: .utf8) ?? ""
        if httpResponse.statusCode == 401 {
          if let debugInfo = try? await fetchDebugMe(apiBaseURL: apiBaseURL, token: session.accessToken) {
            throw StartSessionError.serverError(
              status: httpResponse.statusCode,
              body: "\(body)\nDetected role: \(debugInfo.detectedRole)\nuser_metadata: \(debugInfo.userMetadataSummary)\napp_metadata: \(debugInfo.appMetadataSummary)"
            )
          }
        }
        throw StartSessionError.serverError(status: httpResponse.statusCode, body: body)
      }

      let decoded = try JSONDecoder().decode(AdminUsersResponse.self, from: data)

      let ratings: [PlayerRatingRow] = try await supabase
        .from("player_ratings")
        .select("player_id, elo, matches_played")
        .execute()
        .value

      let ratingMap = Dictionary(uniqueKeysWithValues: ratings.map { ($0.player_id, $0) })

      let merged = decoded.users.compactMap { user -> StartSessionPlayer? in
        guard let id = UUID(uuidString: user.id) else { return nil }
        let rating = ratingMap[id]
        return StartSessionPlayer(
          id: id,
          name: user.name,
          avatarURL: user.avatar.flatMap(URL.init(string:)),
          elo: rating?.elo,
          matchesPlayed: rating?.matches_played ?? 0
        )
      }

      players = merged.sorted { $0.matchesPlayed > $1.matchesPlayed }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func selectPlayer(_ player: StartSessionPlayer) {
    guard canSelectMore else { return }
    if selectedPlayers.contains(where: { $0.id == player.id }) { return }
    selectedPlayers.append(player)
  }

  func removePlayer(_ id: UUID) {
    selectedPlayers.removeAll { $0.id == id }
  }

  func prepareSchedule() {
    guard isComplete else { return }
    shuffledPlayers = selectedPlayers
    originalSchedule = generateSchedule(players: selectedPlayers)
    rounds = generateSchedule(players: shuffledPlayers)
  }

  func randomizeSchedule() async {
    guard isComplete else { return }
    isShuffling = true
    defer { isShuffling = false }

    try? await Task.sleep(nanoseconds: 450_000_000)

    let playerCount = maxSelections
    var doublesRoundsToPreserve: [StartSessionRound] = []
    var mixedRoundsToPreserve: [StartSessionRound] = []

    if playerCount == 4 {
      doublesRoundsToPreserve = originalSchedule.filter { $0.roundNumber >= 4 && $0.roundNumber <= 6 }
    } else if playerCount == 6 {
      mixedRoundsToPreserve = originalSchedule.filter { $0.roundNumber >= 5 && $0.roundNumber <= 7 }
    }

    let preservedSingles = playerCount == 6 ? singlesMatchups(from: mixedRoundsToPreserve) : []

    var finalRounds: [StartSessionRound] = []
    var attempts = 0

    while attempts < 10 {
      let shuffled = selectedPlayers.shuffled()
      let newRounds = generateSchedule(players: shuffled)

      if playerCount == 6 {
        let singlesRounds = newRounds.filter { $0.roundNumber <= 4 }
        let newSingles = singlesMatchups(from: singlesRounds)
        let hasConflict = !preservedSingles.isDisjoint(with: newSingles)
        if hasConflict {
          attempts += 1
          continue
        }
        finalRounds = singlesRounds + mixedRoundsToPreserve
        shuffledPlayers = shuffled
        break
      } else if playerCount == 4 {
        let singlesRounds = newRounds.filter { $0.roundNumber <= 3 }
        finalRounds = singlesRounds + doublesRoundsToPreserve
        shuffledPlayers = shuffled
        break
      } else {
        finalRounds = newRounds
        shuffledPlayers = shuffled
        break
      }
    }

    if finalRounds.isEmpty {
      let shuffled = selectedPlayers.shuffled()
      let newRounds = generateSchedule(players: shuffled)
      if playerCount == 4 {
        let singlesRounds = newRounds.filter { $0.roundNumber <= 3 }
        finalRounds = singlesRounds + doublesRoundsToPreserve
      } else if playerCount == 6 {
        let singlesRounds = newRounds.filter { $0.roundNumber <= 4 }
        finalRounds = singlesRounds + mixedRoundsToPreserve
      } else {
        finalRounds = newRounds
      }
      shuffledPlayers = shuffled
    }

    rounds = finalRounds
  }

  func startSession() async throws -> UUID {
    guard isComplete else { throw StartSessionError.notAuthenticated }

    let supabase = SupabaseService.shared.client
    let session = try await supabase.auth.refreshSession()

    guard let apiBaseURL = SupabaseService.shared.apiBaseURL else {
      throw StartSessionError.missingApiBase
    }

    let payloadPlayers = (maxSelections == 2 ? selectedPlayers : shuffledPlayers).map { $0.payload }
    let payloadRounds = maxSelections == 2 ? generateSchedule(players: selectedPlayers) : rounds

    let payload = StartSessionPayload(
      playerCount: maxSelections,
      players: payloadPlayers,
      rounds: payloadRounds,
      createdAt: ISO8601DateFormatter().string(from: sessionDate)
    )

    var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/sessions"))
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
      throw StartSessionError.serverError(status: httpResponse.statusCode, body: String(data: data, encoding: .utf8) ?? "")
    }

    let decoded = try JSONDecoder().decode(StartSessionResponse.self, from: data)
    return decoded.sessionId
  }

  private func generateSchedule(players: [StartSessionPlayer]) -> [StartSessionRound] {
    switch players.count {
    case 2:
      return ScheduleRules.schedule2(players)
    case 3:
      return ScheduleRules.schedule3(players)
    case 4:
      return ScheduleRules.schedule4(players)
    case 5:
      return ScheduleRules.schedule5(players)
    case 6:
      return ScheduleRules.schedule6(players)
    default:
      return []
    }
  }

  private func singlesMatchups(from rounds: [StartSessionRound]) -> Set<String> {
    var matchups = Set<String>()
    for round in rounds {
      for match in round.matches where match.type == "singles" && match.players.count == 2 {
        let ids = match.players.map { $0.id }.sorted()
        matchups.insert("\(ids[0])-\(ids[1])")
      }
    }
    return matchups
  }

  private func fetchDebugMe(apiBaseURL: URL, token: String) async throws -> DebugMeResponse {
    var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/debug/me"))
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(token, forHTTPHeaderField: "X-Supabase-Token")

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode < 300 else {
      throw StartSessionError.serverError(status: (response as? HTTPURLResponse)?.statusCode ?? 500, body: String(data: data, encoding: .utf8) ?? "")
    }
    return try JSONDecoder().decode(DebugMeResponse.self, from: data)
  }
}

struct StartSessionPlayer: Identifiable, Hashable {
  let id: UUID
  let name: String
  let avatarURL: URL?
  let elo: Int?
  let matchesPlayed: Int

  var payload: StartSessionPayloadPlayer {
    StartSessionPayloadPlayer(id: id.uuidString, name: name, avatar: avatarURL?.absoluteString)
  }
}

struct StartSessionRound: Identifiable, Encodable, Hashable {
  let id: String
  let roundNumber: Int
  let matches: [StartSessionMatch]
  let isDynamic: Bool

  enum CodingKeys: String, CodingKey {
    case id, roundNumber, matches
  }
}

struct StartSessionMatch: Encodable, Hashable {
  let type: String
  let players: [StartSessionPayloadPlayer]
}

struct StartSessionPayloadPlayer: Encodable, Hashable {
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

struct AdminUsersResponse: Decodable {
  let users: [AdminUser]
}

struct AdminUser: Decodable {
  let id: String
  let email: String
  let name: String
  let avatar: String?
}

private struct DebugMeResponse: Decodable {
  let id: String
  let email: String?
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

private struct PlayerRatingRow: Decodable {
  let player_id: UUID
  let elo: Int?
  let matches_played: Int?

  enum CodingKeys: String, CodingKey {
    case player_id, elo, matches_played
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    player_id = try container.decode(UUID.self, forKey: .player_id)
    elo = decodeInt(container, forKey: .elo)
    matches_played = decodeInt(container, forKey: .matches_played)
  }
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

private enum ScheduleRules {
  static func schedule2(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 2 else { return [] }
    let match = StartSessionMatch(type: "singles", players: [players[0].payload, players[1].payload])
    return [StartSessionRound(id: "1", roundNumber: 1, matches: [match], isDynamic: false)]
  }

  static func schedule3(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 3 else { return [] }
    let A = players[0]
    let B = players[1]
    let C = players[2]
    return [
      StartSessionRound(id: "1", roundNumber: 1, matches: [StartSessionMatch(type: "singles", players: [A.payload, B.payload])], isDynamic: false),
      StartSessionRound(id: "2", roundNumber: 2, matches: [StartSessionMatch(type: "singles", players: [C.payload, A.payload])], isDynamic: false),
      StartSessionRound(id: "3", roundNumber: 3, matches: [StartSessionMatch(type: "singles", players: [B.payload, C.payload])], isDynamic: false)
    ]
  }

  static func schedule4(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
    guard players.count == 4 else { return [] }
    let A = players[0]
    let B = players[1]
    let C = players[2]
    let D = players[3]

    return [
      StartSessionRound(id: "1", roundNumber: 1, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, B.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ], isDynamic: false),
      StartSessionRound(id: "2", roundNumber: 2, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, D.payload])
      ], isDynamic: false),
      StartSessionRound(id: "3", roundNumber: 3, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, C.payload])
      ], isDynamic: false),
      StartSessionRound(id: "4", roundNumber: 4, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, C.payload, D.payload])
      ], isDynamic: false),
      StartSessionRound(id: "5", roundNumber: 5, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, C.payload, B.payload, D.payload])
      ], isDynamic: false),
      StartSessionRound(id: "6", roundNumber: 6, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, D.payload, B.payload, C.payload])
      ], isDynamic: false)
    ]
  }

  static func schedule5(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
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
      ], isDynamic: false),
      StartSessionRound(id: "2", roundNumber: 2, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, E.payload])
      ], isDynamic: false),
      StartSessionRound(id: "3", roundNumber: 3, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, E.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, D.payload])
      ], isDynamic: false),
      StartSessionRound(id: "4", roundNumber: 4, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, E.payload])
      ], isDynamic: false),
      StartSessionRound(id: "5", roundNumber: 5, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, B.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ], isDynamic: false)
    ]
  }

  static func schedule6(_ players: [StartSessionPlayer]) -> [StartSessionRound] {
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
      ], isDynamic: false),
      StartSessionRound(id: "2", roundNumber: 2, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, E.payload])
      ], isDynamic: false),
      StartSessionRound(id: "3", roundNumber: 3, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, E.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, F.payload])
      ], isDynamic: false),
      StartSessionRound(id: "4", roundNumber: 4, matches: [
        StartSessionMatch(type: "singles", players: [A.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [B.payload, C.payload]),
        StartSessionMatch(type: "singles", players: [D.payload, E.payload])
      ], isDynamic: false),
      StartSessionRound(id: "5", roundNumber: 5, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, C.payload, D.payload]),
        StartSessionMatch(type: "singles", players: [E.payload, F.payload])
      ], isDynamic: false),
      StartSessionRound(id: "6", roundNumber: 6, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, E.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ], isDynamic: true),
      StartSessionRound(id: "7", roundNumber: 7, matches: [
        StartSessionMatch(type: "doubles", players: [A.payload, B.payload, E.payload, F.payload]),
        StartSessionMatch(type: "singles", players: [C.payload, D.payload])
      ], isDynamic: false)
    ]
  }
}

private func decodeInt<T: CodingKey>(_ container: KeyedDecodingContainer<T>, forKey key: T) -> Int? {
  if let value = try? container.decode(Int.self, forKey: key) { return value }
  if let value = try? container.decode(Double.self, forKey: key) { return Int(value) }
  if let value = try? container.decode(String.self, forKey: key) { return Int(value) }
  return nil
}
