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
                            isLoading: dataStore.isLoading,
                            errorMessage: dataStore.errorMessage
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
    let isLoading: Bool
    let errorMessage: String?

    var body: some View {
        if isLoading, entries.isEmpty {
            ProgressView("Loading rankings…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let errorMessage, entries.isEmpty {
            ContentUnavailableView(
                "Couldn’t load rankings",
                systemImage: "wifi.exclamationmark",
                description: Text(errorMessage)
            )
        } else if entries.isEmpty {
            ContentUnavailableView(
                "No eligible players",
                systemImage: "chart.line.uptrend.xyaxis",
                description: Text("Players will appear after enough completed matches.")
            )
        } else {
            RankingsTable(entries: entries)
        }
    }
}

private struct RankingsTable: View {
    let entries: [RankingEntry]

    var body: some View {
        VStack(spacing: 0) {
            RankingColumnLabels()
            Divider()

            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                RankingRecord(rank: index + 1, entry: entry)

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
        }
        .padding(.vertical, 13)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Rank \(rank), \(entry.name), \(entry.elo) Elo, \(entry.wins) wins, \(entry.draws) draws, \(entry.losses) losses"
        )
    }
}
