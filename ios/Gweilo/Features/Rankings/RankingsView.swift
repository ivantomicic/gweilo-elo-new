import Charts
import SwiftUI

struct RankingsView: View {
    let dataStore: AppDataStore
    @State private var category = RankingCategory.singles

    private var entries: [RankingEntry] {
        dataStore.rankings(for: category)
            .filter { $0.matches >= category.minimumMatches }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        RankingsHeader(category: $category)
                        EligibilityNote(category: category)
                        RankingsContent(
                            entries: entries,
                            allowsPlayerProfiles: category == .singles,
                            isLoading: dataStore.isLoading,
                            errorMessage: dataStore.errorMessage,
                            retry: {
                                Task { await dataStore.load() }
                            }
                        )
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .refreshable {
                    await dataStore.load()
                }
                .scrollIndicators(.hidden)
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: RankingEntry.self) { player in
                PlayerProfileView(
                    player: player,
                    dataStore: dataStore
                )
            }
        }
    }
}
private struct RankingsHeader: View {
    @Binding var category: RankingCategory

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 5) {
                Text("CURRENT ELO")
                    .font(.caption2.weight(.bold))
                    .tracking(1.3)
                    .foregroundStyle(GweiloTheme.accent)

                Text("Rankings")
                    .font(.largeTitle.weight(.bold))
                    .tracking(-0.7)
            }

            Picker("Ranking category", selection: $category) {
                ForEach(RankingCategory.allCases) { category in
                    Text(category.rawValue).tag(category)
                }
            }
            .pickerStyle(.segmented)
        }
        .padding(.top, 18)
    }
}

private struct EligibilityNote: View {
    let category: RankingCategory

    var body: some View {
        Text("Ranked after \(category.minimumMatches) completed matches")
            .font(.caption)
            .foregroundStyle(.secondary)
    }
}

private struct RankingsContent: View {
    let entries: [RankingEntry]
    let allowsPlayerProfiles: Bool
    let isLoading: Bool
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        if isLoading, entries.isEmpty {
            ProgressView("Loading rankings…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let errorMessage, entries.isEmpty {
            ContentUnavailableView {
                Label("Couldn’t load rankings", systemImage: "wifi.exclamationmark")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Try again", action: retry)
                    .buttonStyle(.borderedProminent)
            }
        } else if entries.isEmpty {
            ContentUnavailableView(
                "No eligible players",
                systemImage: "chart.line.uptrend.xyaxis",
                description: Text("Players will appear after enough completed matches.")
            )
        } else {
            RankingsTable(
                entries: entries,
                allowsPlayerProfiles: allowsPlayerProfiles
            )
        }
    }
}

private struct RankingsTable: View {
    let entries: [RankingEntry]
    let allowsPlayerProfiles: Bool

    var body: some View {
        VStack(spacing: 0) {
            RankingColumnLabels()
            Divider()

            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                if allowsPlayerProfiles {
                    NavigationLink(value: entry) {
                        RankingRecord(
                            rank: index + 1,
                            entry: entry,
                            showsDisclosure: true
                        )
                    }
                    .buttonStyle(ResponsiveButtonStyle())
                } else {
                    RankingRecord(
                        rank: index + 1,
                        entry: entry,
                        showsDisclosure: false
                    )
                }

                if entry.id != entries.last?.id {
                    Divider()
                }
            }
        }
    }
}

private struct RankingColumnLabels: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("#")
                .frame(width: 24, alignment: .leading)
            Text("PLAYER")
            Spacer()
            Text("W-D-L")
                .frame(width: 62, alignment: .trailing)
            Text("ELO")
                .frame(width: 48, alignment: .trailing)
        }
        .font(.caption2.weight(.bold))
        .tracking(0.8)
        .foregroundStyle(.secondary)
        .padding(.vertical, 9)
    }
}

private struct RankingRecord: View {
    let rank: Int
    let entry: RankingEntry
    let showsDisclosure: Bool

    var body: some View {
        HStack(spacing: 8) {
            Text("\(rank)")
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(rank <= 3 ? GweiloTheme.accent : .secondary)
                .frame(width: 24, alignment: .leading)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 9) {
                    PlayerIdentityAvatar(
                        name: entry.name,
                        initials: entry.initials,
                        avatarURL: entry.avatarURL,
                        size: 30
                    )
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.name)
                            .font(.body.weight(.semibold))
                            .lineLimit(1)
                        Text("\(entry.matches) matches")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer(minLength: 8)

            Text("\(entry.wins)-\(entry.draws)-\(entry.losses)")
                .font(.caption.monospacedDigit().weight(.medium))
                .frame(width: 62, alignment: .trailing)

            Text("\(entry.elo)")
                .font(.body.monospacedDigit().weight(.bold))
                .frame(width: 48, alignment: .trailing)

            if showsDisclosure {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.tertiary)
                    .frame(width: 8)
            }
        }
        .foregroundStyle(.primary)
        .padding(.vertical, 13)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Rank \(rank), \(entry.name), \(entry.elo) Elo, \(entry.wins) wins, \(entry.draws) draws, \(entry.losses) losses"
        )
    }
}

private struct PlayerProfileView: View {
    let player: RankingEntry
    let dataStore: AppDataStore

    @State private var history: PlayerEloHistory?
    @State private var isLoading = false
    @State private var errorMessage: String?

    init(
        player: RankingEntry,
        dataStore: AppDataStore,
        initialHistory: PlayerEloHistory? = nil
    ) {
        self.player = player
        self.dataStore = dataStore
        _history = State(initialValue: initialHistory)
    }

    private var recentResults: [PlayerEloHistoryPoint] {
        Array(
            (history?.points ?? [])
                .filter { $0.match > 0 && $0.opponent != nil }
                .suffix(5)
                .reversed()
        )
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 30) {
                    PlayerProfileHeader(player: player)
                    PlayerRecordStrip(player: player)

                    VStack(alignment: .leading, spacing: 14) {
                        SectionHeading(title: "Singles Elo")

                        if let history {
                            PlayerEloChart(history: history)
                        } else if isLoading {
                            ProgressView("Loading Elo history…")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 60)
                        } else if let errorMessage {
                            DataErrorNotice(
                                message: errorMessage,
                                retry: {
                                    Task { await load() }
                                }
                            )
                        }
                    }

                    RecentSinglesResults(results: recentResults)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle(player.name)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: player.id) {
            if history == nil {
                await load()
            }
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            history = try await dataStore.playerEloHistory(for: player.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#if DEBUG
struct PlayerProfilePreviewScreen: View {
    private let player = RankingEntry(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
        name: "Ivan",
        avatarURL: nil,
        elo: 1_718,
        matches: 219,
        wins: 132,
        losses: 77,
        draws: 10,
        rankDays: nil
    )

    private let history = PlayerEloHistory(
        points: [
            .init(match: 1, elo: 1_660, date: .now.addingTimeInterval(-864_000), opponent: "Gara", delta: 9),
            .init(match: 2, elo: 1_649, date: .now.addingTimeInterval(-691_200), opponent: "Leo", delta: -11),
            .init(match: 3, elo: 1_674, date: .now.addingTimeInterval(-518_400), opponent: "Miladin", delta: 25),
            .init(match: 4, elo: 1_691, date: .now.addingTimeInterval(-345_600), opponent: "Andrej", delta: 17),
            .init(match: 5, elo: 1_704, date: .now.addingTimeInterval(-172_800), opponent: "Marie", delta: 13),
            .init(match: 6, elo: 1_718, date: .now, opponent: "Gara", delta: 14)
        ],
        currentElo: 1_718
    )

    private let dataStore = AppDataStore(
        configuration: AppConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            supabaseAnonKey: "preview",
            apiBaseURL: URL(string: "https://www.gweilo.lol")!
        ),
        session: AuthSession(
            accessToken: "preview",
            refreshToken: "preview",
            expiresIn: 3_600,
            expiresAt: nil,
            user: AuthenticatedUser(id: UUID(), email: "preview@example.com")
        )
    )

    var body: some View {
        NavigationStack {
            PlayerProfileView(
                player: player,
                dataStore: dataStore,
                initialHistory: history
            )
        }
    }
}
#endif

private struct PlayerProfileHeader: View {
    let player: RankingEntry

    var body: some View {
        HStack(spacing: 17) {
            PlayerIdentityAvatar(
                name: player.name,
                initials: player.initials,
                avatarURL: player.avatarURL,
                size: 72
            )

            VStack(alignment: .leading, spacing: 5) {
                Text("PLAYER PROFILE")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(GweiloTheme.accent)

                Text(player.name)
                    .font(.title.weight(.bold))
                    .tracking(-0.5)

                Text("\(player.elo) Elo")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 14)
    }
}

private struct PlayerRecordStrip: View {
    let player: RankingEntry

    var body: some View {
        HStack(spacing: 0) {
            ProfileMetric(value: "\(player.matches)", label: "MATCHES")
            ProfileMetric(value: "\(player.wins)", label: "WINS")
            ProfileMetric(value: "\(player.draws)", label: "DRAWS")
            ProfileMetric(value: "\(player.losses)", label: "LOSSES")
        }
        .padding(.vertical, 15)
        .overlay(alignment: .top) { Divider() }
        .overlay(alignment: .bottom) { Divider() }
    }
}

private struct ProfileMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.title3.monospacedDigit().weight(.bold))
            Text(label)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct PlayerEloChart: View {
    let history: PlayerEloHistory

    private var domain: ClosedRange<Double> {
        let values = history.points.map(\.elo)
        let minimum = values.min() ?? history.currentElo
        let maximum = values.max() ?? history.currentElo
        return (minimum - 25)...(maximum + 25)
    }

    var body: some View {
        if history.points.count <= 1 {
            ContentUnavailableView(
                "No singles history yet",
                systemImage: "chart.xyaxis.line",
                description: Text("The first completed singles result will start this chart.")
            )
            .frame(maxWidth: .infinity)
        } else {
            Chart(history.points) { point in
                LineMark(
                    x: .value("Match", point.match),
                    y: .value("Elo", point.elo)
                )
                .foregroundStyle(GweiloTheme.accent)
                .lineStyle(StrokeStyle(lineWidth: 2.5))
                .interpolationMethod(.catmullRom)

                if point.id == history.points.last?.id {
                    PointMark(
                        x: .value("Match", point.match),
                        y: .value("Elo", point.elo)
                    )
                    .foregroundStyle(GweiloTheme.accent)
                    .symbolSize(56)
                }
            }
            .chartYScale(domain: domain)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 5)) {
                    AxisGridLine().foregroundStyle(Color.clear)
                    AxisValueLabel()
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) {
                    AxisGridLine()
                        .foregroundStyle(Color.primary.opacity(0.08))
                    AxisValueLabel()
                }
            }
            .frame(height: 220)
            .accessibilityLabel(
                "Singles Elo trend, \(Int(history.currentElo.rounded())) current Elo"
            )
        }
    }
}

private struct RecentSinglesResults: View {
    let results: [PlayerEloHistoryPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "Recent singles")

            if results.isEmpty {
                Text("Recent singles results will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(results) { result in
                        HStack(spacing: 12) {
                            Circle()
                                .fill(resultColor(for: result))
                                .frame(width: 7, height: 7)

                            VStack(alignment: .leading, spacing: 3) {
                                Text("vs \(result.opponent ?? "Unknown")")
                                    .font(.body.weight(.semibold))
                                Text(
                                    result.date.formatted(
                                        .dateTime.day().month(.abbreviated).year()
                                    )
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Text(formattedDelta(result.delta))
                                .font(.body.monospacedDigit().weight(.bold))
                                .foregroundStyle(resultColor(for: result))

                            Text("\(Int(result.elo.rounded()))")
                                .font(.caption.monospacedDigit().weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 40, alignment: .trailing)
                        }
                        .padding(.vertical, 12)

                        if result.id != results.last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
    }

    private func formattedDelta(_ delta: Double?) -> String {
        guard let delta else { return "—" }
        let value = Int(delta.rounded())
        return value > 0 ? "+\(value)" : "\(value)"
    }

    private func resultColor(for result: PlayerEloHistoryPoint) -> Color {
        guard let delta = result.delta else { return .secondary }
        if delta > 0 { return GweiloTheme.lime }
        if delta < 0 { return GweiloTheme.coral }
        return .orange
    }
}
