import SwiftUI
import WidgetKit

private enum ClubWidgetStyle {
    static let accent = Color(red: 0.56, green: 0.40, blue: 0.98)
    static let positive = Color(red: 0.73, green: 0.94, blue: 0.22)
    static let negative = Color(red: 1, green: 0.34, blue: 0.39)
    static let neutral = Color.orange.opacity(0.88)
    static let text = Color.white
    static let secondaryText = Color.white.opacity(0.60)
    static let tertiaryText = Color.white.opacity(0.36)
    static let separator = Color.white.opacity(0.09)
    static let fill = Color.white.opacity(0.08)
    static let background = Color(red: 0.055, green: 0.05, blue: 0.072)

    static func formColor(_ score: Double?) -> Color {
        guard let score else { return fill }
        if score >= 0.3 { return positive }
        if score <= -0.3 { return negative }
        return neutral
    }
}

struct GweiloClubEntry: TimelineEntry {
    let date: Date
    let snapshot: GweiloWidgetSnapshot
}

struct GweiloClubProvider: TimelineProvider {
    private let store = GweiloWidgetSnapshotStore()

    func placeholder(in context: Context) -> GweiloClubEntry {
        GweiloClubEntry(date: .now, snapshot: .preview)
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (GweiloClubEntry) -> Void
    ) {
        let snapshot = context.isPreview
            ? GweiloWidgetSnapshot.preview
            : store.load() ?? .empty
        completion(GweiloClubEntry(date: .now, snapshot: snapshot))
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<GweiloClubEntry>) -> Void
    ) {
        let entry = GweiloClubEntry(
            date: .now,
            snapshot: store.load() ?? .empty
        )
        let refreshDate = entry.date.addingTimeInterval(30 * 60)
        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
    }
}

struct GweiloClubWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: GweiloWidgetSnapshot.widgetKind,
            provider: GweiloClubProvider()
        ) { entry in
            GweiloClubWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    ClubWidgetStyle.background
                }
                .widgetURL(URL(string: "gweilo://statistics"))
        }
        .configurationDisplayName("Gweilo statistika")
        .description("Tvoja forma i tabela singlova.")
        .supportedFamilies([.systemSmall, .systemLarge])
    }
}

private struct GweiloClubWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: GweiloClubEntry

    var body: some View {
        Group {
            switch family {
            case .systemLarge:
                StandingsWidget(snapshot: entry.snapshot)
            default:
                PlayerRatingWidget(snapshot: entry.snapshot)
            }
        }
        .environment(\.locale, Locale(identifier: "sr_Latn_RS"))
    }
}

private struct PlayerRatingWidget: View {
    let snapshot: GweiloWidgetSnapshot

    var body: some View {
        if let player = snapshot.player {
            VStack(alignment: .leading, spacing: 0) {
                WidgetBrandRow(trailingText: "#\(player.rank)")

                Spacer(minLength: 8)

                Text(player.name)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(ClubWidgetStyle.text)
                    .lineLimit(1)

                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("\(player.elo)")
                        .font(.system(.title, design: .rounded).weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(ClubWidgetStyle.text)

                    Text("Elo")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ClubWidgetStyle.secondaryText)
                }

                FormDots(
                    values: player.recentForm,
                    formScores: player.recentFormScores
                )
                    .padding(.top, 8)

                Spacer(minLength: 8)

                if let latestMatch = player.recentMatches.first {
                    LatestMatchSummary(match: latestMatch)
                } else {
                    Text("Nema nedavnih mečeva")
                        .font(.caption2)
                        .foregroundStyle(ClubWidgetStyle.tertiaryText)
                        .lineLimit(1)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(
                "\(player.name), mesto \(player.rank), \(player.elo) Elo"
            )
        } else {
            WidgetEmptyState(
                title: "Tvoja statistika",
                message: "Otvori Gweilo da osvežiš podatke."
            )
        }
    }
}

private struct WidgetBrandRow: View {
    var trailingText: String?

    var body: some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(ClubWidgetStyle.accent)
                .frame(width: 13, height: 13)
                .accessibilityHidden(true)

            Text("Gweilo")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ClubWidgetStyle.secondaryText)

            Spacer(minLength: 6)

            if let trailingText {
                Text(trailingText)
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(ClubWidgetStyle.accent)
            }
        }
    }
}

private struct LatestMatchSummary: View {
    let match: GweiloWidgetMatch

    private var color: Color {
        switch match.outcome {
        case "win": ClubWidgetStyle.positive
        case "loss": ClubWidgetStyle.negative
        default: ClubWidgetStyle.neutral
        }
    }

    private var symbol: String {
        switch match.outcome {
        case "win": "arrow.up.right"
        case "loss": "arrow.down.right"
        default: "minus"
        }
    }

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: symbol)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(color)
                .frame(width: 20, height: 20)
                .background(color.opacity(0.13), in: .circle)

            VStack(alignment: .leading, spacing: 0) {
                Text("Poslednji meč")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(ClubWidgetStyle.tertiaryText)

                Text(match.opponent)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(ClubWidgetStyle.text)
                    .lineLimit(1)
            }

            Spacer(minLength: 2)

            if let score = match.score {
                Text(score)
                    .font(.caption2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(ClubWidgetStyle.secondaryText)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct StandingsWidget: View {
    let snapshot: GweiloWidgetSnapshot

    var body: some View {
        if snapshot.standings.isEmpty {
            WidgetEmptyState(
                title: "Singl tabela",
                message: "Otvori Gweilo da osvežiš podatke."
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                StandingsHeader(savedAt: snapshot.savedAt)
                    .padding(.bottom, 12)

                StandingsColumnHeader()

                ForEach(snapshot.standings.prefix(5), id: \.rank) {
                    standing in
                    StandingRow(standing: standing)
                }

                Spacer(minLength: 8)

                HStack(spacing: 5) {
                    Text("Otvori celu tabelu")
                    Image(systemName: "chevron.right")
                        .font(.system(size: 8, weight: .semibold))
                }
                .font(.caption2.weight(.medium))
                .foregroundStyle(ClubWidgetStyle.secondaryText)
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Tabela singl statistike")
        }
    }
}

private struct StandingsHeader: View {
    let savedAt: Date

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 5) {
                WidgetBrandRow()

                Text("Singl tabela")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(ClubWidgetStyle.text)
            }

            Spacer(minLength: 8)

            Text(savedAt, style: .relative)
                .font(.caption2.weight(.medium))
                .foregroundStyle(ClubWidgetStyle.tertiaryText)
                .padding(.top, 2)
        }
    }
}

private struct StandingsColumnHeader: View {
    var body: some View {
        HStack(spacing: 10) {
            Text("#")
                .frame(width: 18, alignment: .leading)
            Text("Igrač")
            Spacer()
            Text("Forma")
                .frame(width: 64, alignment: .leading)
            Text("Elo")
                .frame(width: 44, alignment: .trailing)
        }
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(ClubWidgetStyle.tertiaryText)
        .padding(.horizontal, 9)
        .padding(.bottom, 5)
    }
}

private struct StandingRow: View {
    let standing: GweiloWidgetStanding

    var body: some View {
        HStack(spacing: 10) {
            Text("\(standing.rank)")
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(
                    standing.isCurrentUser
                        ? ClubWidgetStyle.accent
                        : ClubWidgetStyle.tertiaryText
                )
                .frame(width: 18, alignment: .leading)

            Text(standing.name)
                .font(.caption.weight(standing.isCurrentUser ? .semibold : .medium))
                .foregroundStyle(ClubWidgetStyle.text)
                .lineLimit(1)

            Spacer(minLength: 4)

            FormDots(
                values: standing.recentForm,
                formScores: standing.recentFormScores,
                dotHeight: 5
            )
                .frame(width: 64)

            Text("\(standing.elo)")
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(ClubWidgetStyle.text)
                .frame(width: 44, alignment: .trailing)
        }
        .frame(height: 42)
        .padding(.horizontal, 9)
        .background(
            standing.isCurrentUser
                ? ClubWidgetStyle.accent.opacity(0.13)
                : .clear,
            in: .rect(cornerRadius: 10)
        )
        .overlay(alignment: .bottom) {
            if !standing.isCurrentUser {
                Rectangle()
                    .fill(ClubWidgetStyle.separator)
                    .frame(height: 0.5)
                    .padding(.leading, 37)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Mesto \(standing.rank), \(standing.name), \(standing.elo) Elo"
        )
    }
}

private struct FormDots: View {
    let values: [Int]
    let formScores: [Double]?
    var dotHeight: CGFloat = 7

    private var samples: [FormSample] {
        let recentValues = Array(values.suffix(5))
        let resolvedScores = formScores?.count == values.count
            ? Array((formScores ?? []).suffix(5))
            : recentValues.map { min(1, max(-1, Double($0) / 5)) }
        let paddingCount = max(0, 5 - recentValues.count)
        let paddedValues = Array<Int?>(repeating: nil, count: paddingCount)
            + recentValues.map(Optional.some)
        let paddedScores = Array<Double?>(repeating: nil, count: paddingCount)
            + resolvedScores.map(Optional.some)
        return paddedValues.indices.map {
            FormSample(
                id: $0,
                value: paddedValues[$0],
                score: paddedScores[$0]
            )
        }
    }

    var body: some View {
        HStack(spacing: 3) {
            ForEach(samples) { sample in
                Capsule()
                    .fill(ClubWidgetStyle.formColor(sample.score))
                    .frame(maxWidth: .infinity)
                    .frame(height: dotHeight)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Forma")
        .accessibilityValue(accessibilityValue)
    }

    private var accessibilityValue: String {
        samples.map { sample in
            guard let value = sample.value else { return "bez rezultata" }
            return value > 0 ? "+\(value) Elo" : "\(value) Elo"
        }
        .joined(separator: ", ")
    }
}

private struct FormSample: Identifiable {
    let id: Int
    let value: Int?
    let score: Double?
}

private struct WidgetEmptyState: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetBrandRow()

            Spacer()

            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.title2.weight(.medium))
                .foregroundStyle(ClubWidgetStyle.accent)
                .accessibilityHidden(true)

            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(ClubWidgetStyle.text)

            Text(message)
                .font(.caption)
                .foregroundStyle(ClubWidgetStyle.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview(as: .systemSmall) {
    GweiloClubWidget()
} timeline: {
    GweiloClubEntry(date: .now, snapshot: .preview)
}

#Preview(as: .systemLarge) {
    GweiloClubWidget()
} timeline: {
    GweiloClubEntry(date: .now, snapshot: .preview)
}
