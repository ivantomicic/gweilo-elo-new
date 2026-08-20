import AppIntents
import SwiftUI
import WidgetKit

@main
struct GweiloWatchWidgetBundle: WidgetBundle {
    var body: some Widget {
        GweiloPersonalEloWidget()
        GweiloEloChartWidget()
        GweiloFormWidget()
        GweiloAverageFormWidget()
    }
}

private enum GweiloEloHistoryRange: String, AppEnum {
    case lastSeven
    case lastThirty
    case all

    static let typeDisplayRepresentation: TypeDisplayRepresentation =
        "Elo history"

    static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
        .lastSeven: "Last 7 matches",
        .lastThirty: "Last 30 matches",
        .all: "All history"
    ]

    var maximumMatchCount: Int? {
        switch self {
        case .lastSeven:
            7
        case .lastThirty:
            30
        case .all:
            nil
        }
    }
}

private struct GweiloEloConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Elo chart"
    static let description = IntentDescription(
        "Choose how much of your singles Elo history the chart shows."
    )

    @Parameter(title: "History")
    var historyRange: GweiloEloHistoryRange?

    init() {
        historyRange = .all
    }
}

private struct GweiloPersonalEloWidget: Widget {
    // Preserve the original static configuration contract so existing face slots
    // continue to resolve after updating the app.
    private let kind = GweiloWidgetSnapshot.watchWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: GweiloStaticEloProvider()
        ) { entry in
            GweiloEloComplicationView(entry: entry)
                .containerBackground(for: .widget) {
                    Color.clear
                }
        }
        .configurationDisplayName("My Gweilo Elo")
        .description("See your current Elo rating and recent progress.")
        .supportedFamilies([
            .accessoryRectangular,
            .accessoryCircular,
            .accessoryInline
        ])
    }
}

private struct GweiloEloChartWidget: Widget {
    private let kind = GweiloWidgetSnapshot.watchEloChartWidgetKind

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: GweiloEloConfigurationIntent.self,
            provider: GweiloEloProvider()
        ) { entry in
            GweiloEloComplicationView(entry: entry)
                .containerBackground(for: .widget) {
                    Color.clear
                }
        }
        .configurationDisplayName("Gweilo Elo History")
        .description("A configurable chart of your singles Elo history.")
        .supportedFamilies([.accessoryRectangular])
    }
}

private struct GweiloStaticEloProvider: TimelineProvider {
    func placeholder(in context: Context) -> GweiloEloEntry {
        .preview
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (GweiloEloEntry) -> Void
    ) {
        completion(context.isPreview ? .preview : currentEntry())
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<GweiloEloEntry>) -> Void
    ) {
        completion(
            Timeline(
                entries: [currentEntry()],
                policy: .after(.now.addingTimeInterval(60 * 60))
            )
        )
    }

    private func currentEntry() -> GweiloEloEntry {
        guard let snapshot = GweiloWidgetSnapshotStore().load() else {
            return .unavailable
        }
        return GweiloEloEntry(snapshot: snapshot, range: .all)
    }
}

private struct GweiloEloProvider: AppIntentTimelineProvider {
    func recommendations() -> [AppIntentRecommendation<GweiloEloConfigurationIntent>] {
        []
    }

    func placeholder(in context: Context) -> GweiloEloEntry {
        .preview
    }

    func snapshot(
        for configuration: GweiloEloConfigurationIntent,
        in context: Context,
    ) async -> GweiloEloEntry {
        context.isPreview
            ? .preview
            : currentEntry(range: configuration.historyRange ?? .all)
    }

    func timeline(
        for configuration: GweiloEloConfigurationIntent,
        in context: Context,
    ) async -> Timeline<GweiloEloEntry> {
        Timeline(
            entries: [currentEntry(range: configuration.historyRange ?? .all)],
            policy: .after(.now.addingTimeInterval(60 * 60))
        )
    }

    private func currentEntry(
        range: GweiloEloHistoryRange
    ) -> GweiloEloEntry {
        guard let snapshot = GweiloWidgetSnapshotStore().load() else {
            return .unavailable
        }
        return GweiloEloEntry(snapshot: snapshot, range: range)
    }
}

private struct GweiloEloEntry: TimelineEntry {
    let date: Date
    let currentElo: Int?
    let latestSessionDelta: Int?
    let eloPoints: [GweiloWidgetEloPoint]

    var recentElo: [Int] {
        eloPoints.map(\.elo)
    }

    init(
        date: Date,
        currentElo: Int?,
        latestSessionDelta: Int?,
        eloPoints: [GweiloWidgetEloPoint]
    ) {
        self.date = date
        self.currentElo = currentElo
        self.latestSessionDelta = latestSessionDelta
        self.eloPoints = eloPoints
    }

    init(
        snapshot: GweiloWidgetSnapshot,
        range: GweiloEloHistoryRange
    ) {
        let player = snapshot.player
        let currentElo = player?.elo

        date = snapshot.savedAt
        self.currentElo = currentElo
        latestSessionDelta = player?.recentForm.last

        let allPoints: [GweiloWidgetEloPoint]
        if let actualHistory = player?.eloHistory, !actualHistory.isEmpty {
            allPoints = Self.addingInitialBaseline(to: actualHistory)
        } else if let legacyHistory = player?.recentElo,
                  !legacyHistory.isEmpty {
            allPoints = Self.points(from: legacyHistory)
        } else if let player, let currentElo {
            allPoints = Self.reconstructedHistory(
                currentElo: currentElo,
                deltas: player.recentForm
            )
        } else {
            allPoints = []
        }

        if let maximumMatchCount = range.maximumMatchCount {
            eloPoints = Array(allPoints.suffix(maximumMatchCount + 1))
        } else {
            eloPoints = allPoints
        }
    }

    private static func addingInitialBaseline(
        to points: [GweiloWidgetEloPoint]
    ) -> [GweiloWidgetEloPoint] {
        guard
            let first = points.first,
            let firstDelta = first.delta
        else {
            return points
        }

        return [
            GweiloWidgetEloPoint(
                elo: first.elo - firstDelta,
                delta: nil
            )
        ] + points
    }

    private static func points(
        from values: [Int]
    ) -> [GweiloWidgetEloPoint] {
        values.enumerated().map { index, elo in
            GweiloWidgetEloPoint(
                elo: elo,
                delta: index > 0 ? elo - values[index - 1] : nil
            )
        }
    }

    private static func reconstructedHistory(
        currentElo: Int,
        deltas: [Int]
    ) -> [GweiloWidgetEloPoint] {
        var history = [currentElo]
        var eloBeforeSession = currentElo

        for delta in deltas.reversed() {
            eloBeforeSession -= delta
            history.insert(eloBeforeSession, at: 0)
        }

        return points(from: history)
    }

    static let preview = GweiloEloEntry(
        date: .now,
        currentElo: 1428,
        latestSessionDelta: 12,
        eloPoints: [
            .init(elo: 1382, delta: nil),
            .init(elo: 1401, delta: 19),
            .init(elo: 1394, delta: -7),
            .init(elo: 1410, delta: 16),
            .init(elo: 1402, delta: -8),
            .init(elo: 1416, delta: 14),
            .init(elo: 1428, delta: 12)
        ]
    )

    static let unavailable = GweiloEloEntry(
        date: .now,
        currentElo: nil,
        latestSessionDelta: nil,
        eloPoints: []
    )
}

private struct GweiloEloComplicationView: View {
    @Environment(\.widgetFamily) private var family

    let entry: GweiloEloEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular:
                rectangularView
            case .accessoryCircular:
                circularView
            case .accessoryInline:
                inlineView
            default:
                rectangularView
            }
        }
    }

    private var trendDelta: Int {
        guard
            let currentElo = entry.currentElo,
            let firstElo = entry.recentElo.first
        else {
            return 0
        }
        return currentElo - firstElo
    }

    @ViewBuilder
    private var rectangularView: some View {
        if let currentElo = entry.currentElo {
            VStack(spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("ELO")
                        .font(.caption2)
                        .foregroundStyle(GweiloWidgetColor.purple)

                    Text(String(currentElo))
                        .font(.headline)

                    Spacer(minLength: 4)

                    Label(
                        signed(trendDelta),
                        systemImage: trendSymbol(for: trendDelta)
                    )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }

                GweiloEloSparkline(points: entry.eloPoints)
                    .padding(.vertical, 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "Current Elo \(currentElo), recent trend \(spokenDelta(trendDelta))"
            )
        } else {
            unavailableView
        }
    }

    private var circularView: some View {
        VStack(spacing: 0) {
            Text(entry.currentElo.map(String.init) ?? "—")
                .font(.headline)
                .minimumScaleFactor(0.8)

            Text("ELO")
                .font(.caption2)
                .foregroundStyle(GweiloWidgetColor.purple)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            entry.currentElo.map { "Current Elo \($0)" }
                ?? "Open Gweilo on iPhone to sync Elo"
        )
    }

    @ViewBuilder
    private var inlineView: some View {
        if let latestSessionDelta = entry.latestSessionDelta {
            Label(
                "Last session \(signed(latestSessionDelta)) ELO",
                systemImage: trendSymbol(for: latestSessionDelta)
            )
            .accessibilityLabel(
                "Latest session Elo change \(spokenDelta(latestSessionDelta))"
            )
        } else {
            Label("Open Gweilo to sync", systemImage: "iphone.and.arrow.forward")
        }
    }

    private var unavailableView: some View {
        Label("Open Gweilo to sync", systemImage: "iphone.and.arrow.forward")
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityLabel("Open Gweilo on iPhone to sync Elo")
    }

    private func signed(_ value: Int) -> String {
        value > 0 ? "+\(value)" : "\(value)"
    }

    private func trendSymbol(for value: Int) -> String {
        if value > 0 {
            return "arrow.up.right"
        }
        if value < 0 {
            return "arrow.down.right"
        }
        return "arrow.right"
    }

    private func spokenDelta(_ value: Int) -> String {
        if value > 0 {
            return "up \(value) points"
        }
        if value < 0 {
            return "down \(abs(value)) points"
        }
        return "unchanged"
    }
}

private enum GweiloWidgetColor {
    static let purple = Color(red: 0.61, green: 0.38, blue: 1.00)
    static let lime = Color(red: 0.76, green: 1.00, blue: 0.12)
    static let amber = Color(red: 1.00, green: 0.70, blue: 0.10)
    static let coral = Color(red: 1.00, green: 0.27, blue: 0.36)
    static let empty = Color.white.opacity(0.14)
}

private enum GweiloWidgetPerformanceBand {
    case gain
    case steady
    case loss

    init(eloDelta: Int) {
        if eloDelta > 5 {
            self = .gain
        } else if eloDelta < -5 {
            self = .loss
        } else {
            self = .steady
        }
    }

    init(formScore: Double) {
        if formScore >= 0.3 {
            self = .gain
        } else if formScore <= -0.3 {
            self = .loss
        } else {
            self = .steady
        }
    }

    var color: Color {
        switch self {
        case .gain:
            GweiloWidgetColor.lime
        case .steady:
            GweiloWidgetColor.amber
        case .loss:
            GweiloWidgetColor.coral
        }
    }

    var label: String {
        switch self {
        case .gain:
            "GOOD"
        case .steady:
            "NEUTRAL"
        case .loss:
            "BAD"
        }
    }

    var artwork: ImageResource {
        switch self {
        case .gain:
            .matchResultWin
        case .steady:
            .matchResultDraw
        case .loss:
            .matchResultLoss
        }
    }
}

private struct GweiloEloSparkline: View {
    let points: [GweiloWidgetEloPoint]

    var body: some View {
        Canvas { context, size in
            let plotPoints = plotPoints(in: size)

            guard plotPoints.count > 1 else {
                return
            }

            for index in 0..<(plotPoints.count - 1) {
                let previous = index > 0
                    ? plotPoints[index - 1]
                    : plotPoints[index]
                let current = plotPoints[index]
                let next = plotPoints[index + 1]
                let following = index + 2 < plotPoints.count
                    ? plotPoints[index + 2]
                    : next
                let drawingRect = CGRect(origin: .zero, size: size)
                    .insetBy(dx: 1.5, dy: 1.5)
                let firstControl = clamped(
                    CGPoint(
                        x: current.x + ((next.x - previous.x) / 6),
                        y: current.y + ((next.y - previous.y) / 6)
                    ),
                    to: drawingRect
                )
                let secondControl = clamped(
                    CGPoint(
                        x: next.x - ((following.x - current.x) / 6),
                        y: next.y - ((following.y - current.y) / 6)
                    ),
                    to: drawingRect
                )
                var segment = Path()
                segment.move(to: current)
                segment.addCurve(
                    to: next,
                    control1: firstControl,
                    control2: secondControl
                )

                let delta = points[index + 1].delta
                    ?? points[index + 1].elo - points[index].elo
                let color = GweiloWidgetPerformanceBand(
                    eloDelta: delta
                ).color
                context.stroke(
                    segment,
                    with: .color(color),
                    style: StrokeStyle(
                        lineWidth: 2.5,
                        lineCap: .round,
                        lineJoin: .round
                    )
                )
            }
        }
    }

    private func plotPoints(in size: CGSize) -> [CGPoint] {
        let values = points.map(\.elo)

        guard values.count > 1,
              let minimum = values.min(),
              let maximum = values.max() else {
            return []
        }

        let drawingRect = CGRect(origin: .zero, size: size)
            .insetBy(dx: 1.5, dy: 1.5)
        let valueRange = max(maximum - minimum, 1)
        let horizontalStep = drawingRect.width / CGFloat(values.count - 1)

        return values.enumerated().map { index, value in
            let x = drawingRect.minX + (CGFloat(index) * horizontalStep)
            let normalizedValue = CGFloat(value - minimum) / CGFloat(valueRange)
            let y = drawingRect.maxY - (normalizedValue * drawingRect.height)
            return CGPoint(x: x, y: y)
        }
    }

    private func clamped(_ point: CGPoint, to rect: CGRect) -> CGPoint {
        CGPoint(
            x: min(max(point.x, rect.minX), rect.maxX),
            y: min(max(point.y, rect.minY), rect.maxY)
        )
    }
}

private struct GweiloFormWidget: Widget {
    private let kind = GweiloWidgetSnapshot.watchFormWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: GweiloFormProvider()
        ) { entry in
            GweiloFormComplicationView(entry: entry)
                .containerBackground(for: .widget) {
                    Color.clear
                }
        }
        .configurationDisplayName("My Gweilo Form")
        .description(
            "Your opportunity-adjusted form across recent singles sessions."
        )
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular
        ])
    }
}

private struct GweiloAverageFormWidget: Widget {
    private let kind = GweiloWidgetSnapshot.watchAverageFormWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: GweiloAverageFormProvider()
        ) { entry in
            GweiloAverageFormComplicationView(entry: entry)
                .containerBackground(for: .widget) {
                    Color.clear
                }
        }
        .configurationDisplayName("5-Session Form")
        .description(
            "Your average opportunity-adjusted form across the latest five singles sessions."
        )
        .supportedFamilies([.accessoryCircular])
    }
}

private struct GweiloAverageFormProvider: TimelineProvider {
    func placeholder(in context: Context) -> GweiloAverageFormEntry {
        .preview
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (GweiloAverageFormEntry) -> Void
    ) {
        completion(context.isPreview ? .preview : currentEntry())
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<GweiloAverageFormEntry>) -> Void
    ) {
        completion(
            Timeline(
                entries: [currentEntry()],
                policy: .after(.now.addingTimeInterval(60 * 60))
            )
        )
    }

    private func currentEntry() -> GweiloAverageFormEntry {
        guard let snapshot = GweiloWidgetSnapshotStore().load() else {
            return .unavailable
        }
        return GweiloAverageFormEntry(snapshot: snapshot)
    }
}

private struct GweiloAverageFormEntry: TimelineEntry {
    let date: Date
    let scores: [Double]

    init(date: Date, scores: [Double]) {
        self.date = date
        self.scores = Array(scores.suffix(5))
    }

    init(snapshot: GweiloWidgetSnapshot) {
        date = snapshot.savedAt

        if let actualScores = snapshot.player?.recentFormScores,
           !actualScores.isEmpty {
            scores = Array(actualScores.suffix(5))
        } else {
            scores = Array(
                (snapshot.player?.recentForm ?? [])
                    .suffix(5)
                    .map { min(max(Double($0) / 5, -1), 1) }
            )
        }
    }

    var averageBand: GweiloWidgetPerformanceBand? {
        guard !scores.isEmpty else { return nil }
        let average = scores.reduce(0, +) / Double(scores.count)
        return GweiloWidgetPerformanceBand(formScore: average)
    }

    static let preview = GweiloAverageFormEntry(
        date: .now,
        scores: [0.62, 0.41, -0.08, 0.78, 0.36]
    )

    static let unavailable = GweiloAverageFormEntry(date: .now, scores: [])
}

private struct GweiloAverageFormComplicationView: View {
    let entry: GweiloAverageFormEntry

    var body: some View {
        Group {
            if let averageBand = entry.averageBand {
                Image(averageBand.artwork)
                .resizable()
                .interpolation(.high)
                .widgetAccentedRenderingMode(.accentedDesaturated)
                .scaledToFit()
            } else {
                Image(systemName: "iphone.and.arrow.forward")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(.circle)
        .unredacted()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        guard let averageBand = entry.averageBand else {
            return "Open Gweilo on iPhone to sync form"
        }
        return "Average form across the latest \(entry.scores.count) singles sessions: \(averageBand.label.lowercased())"
    }
}

private struct GweiloFormProvider: TimelineProvider {
    func placeholder(in context: Context) -> GweiloFormEntry {
        .preview
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (GweiloFormEntry) -> Void
    ) {
        completion(context.isPreview ? .preview : currentEntry())
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<GweiloFormEntry>) -> Void
    ) {
        completion(
            Timeline(
                entries: [currentEntry()],
                policy: .after(.now.addingTimeInterval(60 * 60))
            )
        )
    }

    private func currentEntry() -> GweiloFormEntry {
        guard let snapshot = GweiloWidgetSnapshotStore().load() else {
            return .unavailable
        }
        return GweiloFormEntry(snapshot: snapshot)
    }
}

private struct GweiloFormEntry: TimelineEntry {
    let date: Date
    let scores: [Double]

    init(date: Date, scores: [Double]) {
        self.date = date
        self.scores = Array(scores.suffix(7))
    }

    init(snapshot: GweiloWidgetSnapshot) {
        date = snapshot.savedAt

        if let actualScores = snapshot.player?.recentFormScores,
           !actualScores.isEmpty {
            scores = Array(actualScores.suffix(7))
        } else {
            scores = Array(
                (snapshot.player?.recentForm ?? [])
                    .suffix(7)
                    .map { min(max(Double($0) / 5, -1), 1) }
            )
        }
    }

    static let preview = GweiloFormEntry(
        date: .now,
        scores: [0.62, 0.41, -0.08, -0.55, 0.24, 0.78, 0.36]
    )

    static let unavailable = GweiloFormEntry(date: .now, scores: [])
}

private struct GweiloFormComplicationView: View {
    @Environment(\.widgetFamily) private var family

    let entry: GweiloFormEntry

    private var paddedScores: [Double?] {
        var values = Array<Double?>(
            repeating: nil,
            count: max(7 - entry.scores.count, 0)
        )
        values.append(contentsOf: entry.scores.map(Optional.some))
        return values
    }

    private var overallBand: GweiloWidgetPerformanceBand? {
        guard !entry.scores.isEmpty else {
            return nil
        }
        let average = entry.scores.reduce(0, +) / Double(entry.scores.count)
        return GweiloWidgetPerformanceBand(formScore: average)
    }

    var body: some View {
        Group {
            if family == .accessoryCircular {
                circularView
            } else {
                rectangularView
            }
        }
    }

    private var circularScores: [Double?] {
        let scores = Array(entry.scores.suffix(5))
        return Array<Double?>(
            repeating: nil,
            count: max(5 - scores.count, 0)
        ) + scores.map(Optional.some)
    }

    private var circularView: some View {
        VStack(spacing: 4) {
            HStack(spacing: 2.5) {
                ForEach(
                    Array(circularScores.enumerated()),
                    id: \.offset
                ) { _, score in
                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .fill(color(for: score))
                        .frame(width: 5, height: 12)
                }
            }

            Text("FORMA")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(GweiloWidgetColor.purple)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(circularAccessibilitySummary)
    }

    private var rectangularView: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("FORMA")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(GweiloWidgetColor.purple)

                Spacer(minLength: 4)

                if let overallBand {
                    Text(overallBand.label)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(overallBand.color)
                } else {
                    Text("SYNC")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 3) {
                ForEach(Array(paddedScores.enumerated()), id: \.offset) { _, score in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(color(for: score))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 17, maxHeight: 17)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private func color(for score: Double?) -> Color {
        score.map {
            GweiloWidgetPerformanceBand(formScore: $0).color
        } ?? GweiloWidgetColor.empty
    }

    private var circularAccessibilitySummary: String {
        let availableScores = circularScores.compactMap { $0 }
        guard !availableScores.isEmpty else {
            return "Open Gweilo on iPhone to sync form"
        }

        return "Form across the last \(availableScores.count) singles sessions"
    }

    private var accessibilitySummary: String {
        guard let overallBand else {
            return "Open Gweilo on iPhone to sync form"
        }

        let goodCount = entry.scores.filter {
            GweiloWidgetPerformanceBand(formScore: $0) == .gain
        }.count
        let neutralCount = entry.scores.filter {
            GweiloWidgetPerformanceBand(formScore: $0) == .steady
        }.count
        let badCount = entry.scores.count - goodCount - neutralCount
        return "Form \(overallBand.label.lowercased()). Last \(entry.scores.count) sessions: \(goodCount) good, \(neutralCount) neutral, \(badCount) bad."
    }
}

#Preview("Rectangular", as: .accessoryRectangular) {
    GweiloPersonalEloWidget()
} timeline: {
    GweiloEloEntry.preview
}

#Preview("Circular", as: .accessoryCircular) {
    GweiloPersonalEloWidget()
} timeline: {
    GweiloEloEntry.preview
}

#Preview("Inline", as: .accessoryInline) {
    GweiloPersonalEloWidget()
} timeline: {
    GweiloEloEntry.preview
}

#Preview("Form", as: .accessoryRectangular) {
    GweiloFormWidget()
} timeline: {
    GweiloFormEntry.preview
}

#Preview("Form Small", as: .accessoryCircular) {
    GweiloFormWidget()
} timeline: {
    GweiloFormEntry.preview
}

#Preview("Average Form", as: .accessoryCircular) {
    GweiloAverageFormWidget()
} timeline: {
    GweiloAverageFormEntry.preview
}
