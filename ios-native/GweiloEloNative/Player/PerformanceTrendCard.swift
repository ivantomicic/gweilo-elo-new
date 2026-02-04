import SwiftUI
import Charts

struct PerformanceTrendCard: View {
  let playerId: UUID?
  let secondaryPlayerId: UUID?
  let title: String

  @StateObject private var viewModel = PerformanceTrendViewModel()
  @State private var filter: PerformanceFilter = .all

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(title)
          .font(.caption.weight(.semibold))
          .foregroundStyle(AppColors.muted)
          .textCase(.uppercase)
        Spacer()
        Picker("Filter", selection: $filter) {
          Text("All").tag(PerformanceFilter.all)
          Text("4").tag(PerformanceFilter.last4)
          Text("2").tag(PerformanceFilter.last2)
          Text("1").tag(PerformanceFilter.last1)
        }
        .pickerStyle(.segmented)
        .frame(width: 180)
      }

      if viewModel.isLoading {
        ProgressView("Loading…")
          .frame(maxWidth: .infinity, minHeight: 180)
      } else if let error = viewModel.errorMessage {
        Text(error)
          .foregroundStyle(.red)
      } else if viewModel.filtered(primary: filter).count <= 1 {
        Text("Not enough match data to display chart")
          .foregroundStyle(AppColors.muted)
          .frame(maxWidth: .infinity, minHeight: 180)
      } else {
        summaryRow
        chartView
      }
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .task {
      await viewModel.load(primaryId: playerId, secondaryId: secondaryPlayerId)
    }
    .onChange(of: filter) { _ in }
  }

  private var summaryRow: some View {
    let points = viewModel.filtered(primary: filter)
    let current = points.last?.elo ?? 1500
    let peak = points.map { $0.elo }.max() ?? current
    let delta = (points.last?.elo ?? 1500) - (points.first?.elo ?? 1500)

    return HStack(spacing: 16) {
      StatBlock(label: "Current", value: String(Int(current)))
      StatBlock(label: "Peak", value: String(Int(peak)))
      StatBlock(label: "Δ", value: String(Int(delta)))
    }
  }

  private var chartView: some View {
    let primary = viewModel.filtered(primary: filter)
    let secondary = viewModel.filteredSecondary(primary: filter)

    return Chart {
      ForEach(primary) { point in
        LineMark(
          x: .value("Match", point.matchIndex),
          y: .value("ELO", point.elo)
        )
        .interpolationMethod(.catmullRom)
        .foregroundStyle(AppColors.primary)
      }

      if !secondary.isEmpty {
        ForEach(secondary) { point in
          LineMark(
            x: .value("Match", point.matchIndex),
            y: .value("ELO", point.elo)
          )
          .interpolationMethod(.catmullRom)
          .foregroundStyle(Color.white.opacity(0.6))
        }
      }
    }
    .frame(height: 200)
  }
}

private struct StatBlock: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label)
        .font(.caption)
        .foregroundStyle(AppColors.muted)
      Text(value)
        .font(.headline.weight(.bold))
        .foregroundStyle(.white)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

enum PerformanceFilter: String, CaseIterable {
  case all
  case last4
  case last2
  case last1
}

@MainActor
final class PerformanceTrendViewModel: ObservableObject {
  @Published var primaryPoints: [EloPoint] = []
  @Published var secondaryPoints: [EloPoint] = []
  @Published var isLoading = false
  @Published var errorMessage: String?

  func load(primaryId: UUID?, secondaryId: UUID?) async {
    isLoading = true
    errorMessage = nil

    do {
      let primary = try await fetchHistory(playerId: primaryId)
      primaryPoints = primary

      if let secondaryId {
        secondaryPoints = try await fetchHistory(playerId: secondaryId)
      } else {
        secondaryPoints = []
      }

      isLoading = false
    } catch {
      isLoading = false
      errorMessage = error.localizedDescription
    }
  }

  func filtered(primary filter: PerformanceFilter) -> [EloPoint] {
    filterPoints(primaryPoints, filter: filter)
  }

  func filteredSecondary(primary filter: PerformanceFilter) -> [EloPoint] {
    filterPoints(secondaryPoints, filter: filter)
  }

  private func filterPoints(_ points: [EloPoint], filter: PerformanceFilter) -> [EloPoint] {
    guard filter != .all else { return points }

    let sessions = Dictionary(grouping: points, by: { $0.sessionDateKey })
    let sortedKeys = sessions.keys.sorted(by: >)

    let count: Int
    switch filter {
    case .last4: count = 4
    case .last2: count = 2
    case .last1: count = 1
    default: count = sortedKeys.count
    }

    let selectedKeys = Set(sortedKeys.prefix(count))
    return points.filter { selectedKeys.contains($0.sessionDateKey) }
  }

  private func fetchHistory(playerId: UUID?) async throws -> [EloPoint] {
    let queryItems: [URLQueryItem]
    if let playerId {
      queryItems = [URLQueryItem(name: "playerId", value: playerId.uuidString)]
    } else {
      queryItems = []
    }

    let response: EloHistoryResponse = try await APIClient.get("api/player/elo-history", queryItems: queryItems)
    return response.data.enumerated().map { index, point in
      EloPoint(
        id: UUID(),
        matchIndex: index,
        elo: point.elo,
        sessionDate: ISO8601DateFormatter().date(from: point.date) ?? Date()
      )
    }
  }
}

struct EloPoint: Identifiable {
  let id: UUID
  let matchIndex: Int
  let elo: Double
  let sessionDate: Date

  var sessionDateKey: String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: sessionDate)
  }
}

struct EloHistoryResponse: Decodable {
  let data: [EloHistoryPoint]
  let currentElo: Double
}

struct EloHistoryPoint: Decodable {
  let match: Int
  let elo: Double
  let date: String
  let opponent: String
  let delta: Double
}
