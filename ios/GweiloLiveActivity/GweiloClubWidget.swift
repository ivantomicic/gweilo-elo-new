import SwiftUI
import WidgetKit

private enum ClubWidgetStyle {
    static let lime = Color(red: 0.69, green: 1, blue: 0.04)
    static let purple = Color(red: 0.53, green: 0.24, blue: 1)
    static let bone = Color(red: 0.96, green: 0.95, blue: 0.91)
    static let amber = Color(red: 0.96, green: 0.68, blue: 0.20)
    static let coral = Color(red: 1, green: 0.28, blue: 0.36)
    static let muted = Color.white.opacity(0.46)
    static let hairline = Color.white.opacity(0.11)
    static let surface = Color.white.opacity(0.07)
    static let panel = Color(red: 0.018, green: 0.014, blue: 0.028)

    static func formColor(_ value: Int?) -> Color {
        guard let value else { return surface }
        if value > 5 { return lime }
        if value < -5 { return coral }
        return amber
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
                    ClubWidgetStyle.panel
                }
                .widgetURL(URL(string: "gweilo://statistics"))
        }
        .configurationDisplayName("Gweilo statistika")
        .description("Tvoja forma, poslednji mečevi i tabela singlova.")
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
                PlayerFormWidget(snapshot: entry.snapshot)
            }
        }
        .environment(\.locale, Locale(identifier: "sr_Latn_RS"))
    }
}

private struct PlayerFormWidget: View {
    let snapshot: GweiloWidgetSnapshot

    var body: some View {
        if let player = snapshot.player {
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    WidgetEyebrow("MOJA FORMA")
                    Spacer(minLength: 4)
                    Text("#\(player.rank)")
                        .font(.caption2.monospacedDigit().weight(.black))
                        .foregroundStyle(ClubWidgetStyle.purple)
                }

                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(player.name)
                        .font(.headline.weight(.black))
                        .foregroundStyle(ClubWidgetStyle.bone)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text("\(player.elo)")
                        .font(.headline.monospacedDigit().weight(.black))
                        .foregroundStyle(ClubWidgetStyle.lime)
                }

                FormStrip(values: player.recentForm)

                Rectangle()
                    .fill(ClubWidgetStyle.hairline)
                    .frame(height: 1)

                WidgetEyebrow("POSLEDNJI MEČEVI")

                VStack(spacing: 4) {
                    ForEach(
                        Array(player.recentMatches.prefix(2).enumerated()),
                        id: \.offset
                    ) { _, match in
                        RecentMatchRow(match: match)
                    }
                }

                if player.recentMatches.isEmpty {
                    Text("Poslednji mečevi pojaviće se nakon osvežavanja.")
                        .font(.caption2)
                        .foregroundStyle(ClubWidgetStyle.muted)
                        .lineLimit(2)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(
                "\(player.name), mesto \(player.rank), \(player.elo) Elo"
            )
        } else {
            WidgetEmptyState(
                title: "MOJA FORMA",
                message: "Otvori Gweilo da učitamo tvoju statistiku."
            )
        }
    }
}

private struct RecentMatchRow: View {
    let match: GweiloWidgetMatch

    private var outcomeLabel: String {
        switch match.outcome {
        case "win": "P"
        case "loss": "I"
        case "draw": "N"
        default: "·"
        }
    }

    private var outcomeColor: Color {
        switch match.outcome {
        case "win": ClubWidgetStyle.lime
        case "loss": ClubWidgetStyle.coral
        case "draw": ClubWidgetStyle.amber
        default: ClubWidgetStyle.muted
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(outcomeLabel)
                .font(.caption2.weight(.black))
                .foregroundStyle(ClubWidgetStyle.panel)
                .frame(width: 17, height: 17)
                .background(outcomeColor, in: .rect(cornerRadius: 4))

            Text(match.opponent)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(ClubWidgetStyle.bone)
                .lineLimit(1)

            Spacer(minLength: 2)

            if let score = match.score {
                Text(score)
                    .font(.caption2.monospacedDigit().weight(.bold))
                    .foregroundStyle(ClubWidgetStyle.bone)
            }

            if let delta = match.eloDelta {
                Text(delta > 0 ? "+\(delta)" : "\(delta)")
                    .font(.caption2.monospacedDigit().weight(.black))
                    .foregroundStyle(ClubWidgetStyle.formColor(delta))
                    .frame(minWidth: 23, alignment: .trailing)
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
                title: "SINGL STATISTIKA",
                message: "Otvori Gweilo da učitamo tabelu."
            )
        } else {
            VStack(spacing: 0) {
                StandingsHeader(savedAt: snapshot.savedAt)
                    .padding(.bottom, 12)

                StandingsColumnHeader()

                ForEach(snapshot.standings.prefix(5), id: \.rank) {
                    standing in
                    StandingRow(standing: standing)
                }

                Spacer(minLength: 4)

                HStack {
                    Text("P–N–I")
                        .foregroundStyle(ClubWidgetStyle.muted)
                    Spacer()
                    Text("DODIRNI ZA CELU TABELU")
                        .foregroundStyle(ClubWidgetStyle.lime)
                }
                .font(.system(size: 8, weight: .black))
                .tracking(0.45)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Tabela singl statistike")
        }
    }
}

private struct StandingsHeader: View {
    let savedAt: Date

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                WidgetEyebrow("GWEILO / NOVI SAD")
                Text("SINGL STATISTIKA")
                    .font(.title3.weight(.black))
                    .foregroundStyle(ClubWidgetStyle.bone)
            }
            Spacer()
            Text(savedAt, style: .relative)
                .font(.caption2.weight(.medium))
                .foregroundStyle(ClubWidgetStyle.muted)
        }
    }
}

private struct StandingsColumnHeader: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("#")
                .frame(width: 18, alignment: .leading)
            Text("IGRAČ")
            Spacer()
            Text("FORMA")
                .frame(width: 66, alignment: .leading)
            Text("ELO")
                .frame(width: 43, alignment: .trailing)
        }
        .font(.system(size: 8, weight: .black))
        .tracking(0.6)
        .foregroundStyle(ClubWidgetStyle.muted)
        .padding(.bottom, 4)
    }
}

private struct StandingRow: View {
    let standing: GweiloWidgetStanding

    var body: some View {
        HStack(spacing: 8) {
            Text("\(standing.rank)")
                .font(.caption.monospacedDigit().weight(.black))
                .foregroundStyle(
                    standing.isCurrentUser
                        ? ClubWidgetStyle.lime
                        : ClubWidgetStyle.muted
                )
                .frame(width: 18, alignment: .leading)

            HStack(spacing: 7) {
                Text(initials)
                    .font(.system(size: 8, weight: .black))
                    .foregroundStyle(ClubWidgetStyle.bone)
                    .frame(width: 24, height: 24)
                    .background(
                        standing.isCurrentUser
                            ? ClubWidgetStyle.purple
                            : ClubWidgetStyle.surface,
                        in: .circle
                    )

                Text(standing.name)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ClubWidgetStyle.bone)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            FormStrip(values: standing.recentForm, height: 7)
                .frame(width: 66)

            Text("\(standing.elo)")
                .font(.caption.monospacedDigit().weight(.black))
                .foregroundStyle(ClubWidgetStyle.bone)
                .frame(width: 43, alignment: .trailing)
        }
        .frame(height: 42)
        .padding(.horizontal, 6)
        .background(
            standing.isCurrentUser
                ? ClubWidgetStyle.purple.opacity(0.13)
                : .clear,
            in: .rect(cornerRadius: 8)
        )
        .overlay(alignment: .bottom) {
            if !standing.isCurrentUser {
                Rectangle()
                    .fill(ClubWidgetStyle.hairline)
                    .frame(height: 1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Mesto \(standing.rank), \(standing.name), \(standing.elo) Elo"
        )
    }

    private var initials: String {
        standing.name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}

private struct FormStrip: View {
    let values: [Int]
    var height: CGFloat = 11

    private var paddedValues: [Int?] {
        let recent = values.suffix(5).map(Optional.some)
        return Array(
            repeating: nil,
            count: max(0, 5 - recent.count)
        ) + recent
    }

    private var gradientStops: [Gradient.Stop] {
        let colors = paddedValues.map(ClubWidgetStyle.formColor)
        guard let first = colors.first, let last = colors.last else {
            return [
                .init(color: ClubWidgetStyle.surface, location: 0),
                .init(color: ClubWidgetStyle.surface, location: 1)
            ]
        }

        let centerStops = colors.enumerated().map { index, color in
            Gradient.Stop(
                color: color,
                location: (CGFloat(index) + 0.5) / CGFloat(colors.count)
            )
        }

        return [.init(color: first, location: 0)]
            + centerStops
            + [.init(color: last, location: 1)]
    }

    var body: some View {
        ZStack {
            ClubWidgetStyle.surface

            LinearGradient(
                gradient: Gradient(stops: gradientStops),
                startPoint: .leading,
                endPoint: .trailing
            )

            LinearGradient(
                colors: [
                    .white.opacity(0.18),
                    .clear,
                    .black.opacity(0.16)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .frame(height: height)
        .clipShape(.capsule)
        .overlay {
            Capsule()
                .stroke(ClubWidgetStyle.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Forma")
        .accessibilityValue(accessibilityValue)
    }

    private var accessibilityValue: String {
        paddedValues.map { value in
            guard let value else { return "bez rezultata" }
            return value > 0 ? "+\(value) Elo" : "\(value) Elo"
        }
        .joined(separator: ", ")
    }
}

private struct WidgetEyebrow: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .black))
            .tracking(0.9)
            .foregroundStyle(ClubWidgetStyle.purple)
    }
}

private struct WidgetEmptyState: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WidgetEyebrow("GWEILO / NOVI SAD")
            Spacer()
            Image(systemName: "chart.bar.fill")
                .font(.title.weight(.bold))
                .foregroundStyle(ClubWidgetStyle.lime)
                .accessibilityHidden(true)
            Text(title)
                .font(.headline.weight(.black))
                .foregroundStyle(ClubWidgetStyle.bone)
            Text(message)
                .font(.caption)
                .foregroundStyle(ClubWidgetStyle.muted)
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
