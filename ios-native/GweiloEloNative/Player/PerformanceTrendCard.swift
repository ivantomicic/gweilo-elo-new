import SwiftUI
import Charts

struct PerformanceTrendCard: View {
  let playerId: UUID?
  let secondaryPlayerId: UUID?
  let title: String
  let refreshID: UUID?

  init(
    playerId: UUID?,
    secondaryPlayerId: UUID?,
    title: String,
    refreshID: UUID? = nil
  ) {
    self.playerId = playerId
    self.secondaryPlayerId = secondaryPlayerId
    self.title = title
    self.refreshID = refreshID
  }

  @StateObject private var viewModel = PerformanceTrendViewModel()
  @State private var filter: PerformanceFilter = .all
  @State private var selectedPoint: EloPoint?
  @State private var selectedLocation: CGPoint?
  @State private var lastHapticMatchIndex: Int?

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
    .task(id: refreshID) {
      await viewModel.loadIfNeeded(
        primaryId: playerId,
        secondaryId: secondaryPlayerId,
        refreshID: refreshID
      )
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
    let primaryValues = primary.map { $0.elo }
    let minValue = primaryValues.min() ?? 0
    let maxValue = primaryValues.max() ?? 0
    let range = maxValue - minValue
    let padding = max(10, range * 0.12)
    let lowerBound = minValue - padding
    let upperBound = maxValue + padding
    let maxMatch = max(primary.map { $0.matchIndex }.max() ?? 1, 1)

    return ZStack(alignment: .topLeading) {
      Chart {
      ForEach(primary) { point in
        LineMark(
          x: .value("Match", point.matchIndex),
          y: .value("ELO", point.elo)
        )
        .interpolationMethod(.catmullRom)
        .foregroundStyle(AppColors.primary)

        PointMark(
          x: .value("Match", point.matchIndex),
          y: .value("ELO", point.elo)
        )
        .symbolSize(36)
        .foregroundStyle(point.delta >= 0 ? Color.green : Color.red)
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

      if let selectedPoint {
        RuleMark(x: .value("Match", selectedPoint.matchIndex))
          .foregroundStyle(Color.white.opacity(0.2))
        PointMark(
          x: .value("Match", selectedPoint.matchIndex),
          y: .value("ELO", selectedPoint.elo)
        )
        .symbolSize(60)
        .foregroundStyle(Color.white)
      }
    }
    .chartYScale(domain: lowerBound...upperBound)
    .chartXScale(domain: 1...maxMatch)
    .chartYAxis {
      AxisMarks(values: [minValue, maxValue]) { _ in
        AxisGridLine().foregroundStyle(AppColors.fieldBorder)
        AxisTick()
      }
    }
    .chartXAxis(.hidden)
    .chartOverlay { proxy in
      GeometryReader { geometry in
        Rectangle()
          .fill(Color.clear)
          .contentShape(Rectangle())
          .gesture(
            DragGesture(minimumDistance: 0)
              .onChanged { value in
                let origin = geometry[proxy.plotAreaFrame].origin
                let locationX = value.location.x - origin.x
                guard let xValue: Double = proxy.value(atX: locationX) else { return }
                let closest = primary.min(by: { abs(Double($0.matchIndex) - xValue) < abs(Double($1.matchIndex) - xValue) })
                selectedPoint = closest

                if let matchIndex = closest?.matchIndex, matchIndex != lastHapticMatchIndex {
                  Haptics.tap()
                  lastHapticMatchIndex = matchIndex
                }

                if let selectedPoint,
                   let xPos = proxy.position(forX: selectedPoint.matchIndex),
                   let yPos = proxy.position(forY: selectedPoint.elo) {
                  selectedLocation = CGPoint(x: xPos + origin.x, y: yPos + origin.y)
                }
              }
              .onEnded { _ in
                selectedPoint = nil
                selectedLocation = nil
                lastHapticMatchIndex = nil
              }
          )
      }
    }
    .frame(height: 200)
      if let selectedPoint, let selectedLocation {
        TooltipView(point: selectedPoint)
          .position(x: min(max(selectedLocation.x, 70), 260), y: max(selectedLocation.y - 36, 12))
      }
    }
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
  private var lastPrimaryId: UUID?
  private var lastSecondaryId: UUID?
  private var lastRefreshID: UUID?

  func loadIfNeeded(primaryId: UUID?, secondaryId: UUID?, refreshID: UUID?) async {
    let needsRefresh = refreshID != nil && refreshID != lastRefreshID
    let samePlayers = lastPrimaryId == primaryId && lastSecondaryId == secondaryId
    if !needsRefresh && samePlayers && !primaryPoints.isEmpty {
      return
    }
    lastPrimaryId = primaryId
    lastSecondaryId = secondaryId
    lastRefreshID = refreshID
    await load(primaryId: primaryId, secondaryId: secondaryId)
  }

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
        matchIndex: max(1, point.match),
        elo: point.elo,
        delta: point.delta,
        opponent: point.opponent,
        sessionDate: ISO8601DateFormatter().date(from: point.date) ?? Date()
      )
    }
  }
}

struct EloPoint: Identifiable {
  let id: UUID
  let matchIndex: Int
  let elo: Double
  let delta: Double
  let opponent: String
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

private struct TooltipView: View {
  let point: EloPoint

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(point.opponent.isEmpty ? "Match" : point.opponent)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.white)
      Text("ELO \(Int(point.elo))  \(point.delta >= 0 ? "+" : "")\(Int(point.delta))")
        .font(.caption2)
        .foregroundStyle(point.delta >= 0 ? Color.green : Color.red)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.ultraThinMaterial)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(Color.white.opacity(0.2), lineWidth: 1)
    )
    .shadow(color: Color.black.opacity(0.25), radius: 10, x: 0, y: 6)
  }
}
