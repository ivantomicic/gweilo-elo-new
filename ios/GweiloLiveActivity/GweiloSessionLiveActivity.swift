import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

private enum LiveActivityStyle {
    static let accent = Color(red: 0.56, green: 0.40, blue: 0.98)
    static let live = Color(red: 0.73, green: 0.94, blue: 0.22)
    static let text = Color.white
    static let secondaryText = Color.white.opacity(0.62)
    static let tertiaryText = Color.white.opacity(0.38)
    static let fill = Color.white.opacity(0.10)
    static let subtleFill = Color.white.opacity(0.055)
    static let background = Color(red: 0.055, green: 0.05, blue: 0.072)
}

struct GweiloSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GweiloSessionActivityAttributes.self) {
            context in
            LockScreenSessionView(state: context.state)
                .activityBackgroundTint(LiveActivityStyle.background)
                .activitySystemActionForegroundColor(LiveActivityStyle.text)
                .widgetURL(sessionURL(context.attributes.sessionID))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    LiveBrandLockup()
                }

                DynamicIslandExpandedRegion(.trailing) {
                    RoundLabel(state: context.state, compact: true)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedIslandContent(state: context.state)
                }
            } compactLeading: {
                CompactLiveMark()
            } compactTrailing: {
                Text("\(context.state.currentRound)/\(context.state.totalRounds)")
                    .font(.caption2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(LiveActivityStyle.text)
                    .accessibilityLabel(
                        "Runda \(context.state.currentRound) od \(context.state.totalRounds)"
                    )
            } minimal: {
                MinimalLiveMark()
            }
            .widgetURL(sessionURL(context.attributes.sessionID))
            .keylineTint(LiveActivityStyle.accent)
        }
    }

    private func sessionURL(_ sessionID: String) -> URL? {
        URL(string: "gweilo://session/\(sessionID)")
    }
}

private struct LockScreenSessionView: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if state.status == "active" {
                ActiveSessionContent(state: state)
            } else {
                FinishedSessionContent(state: state)
            }
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 9)
        .accessibilityElement(children: .contain)
    }
}

private struct ActiveSessionContent: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 10) {
                LiveBrandLockup()
                Spacer(minLength: 8)
                RoundLabel(state: state)
            }

            MatchupGroup(
                matchups: state.matchups,
                maximumVisible: 3,
                isPrimary: true,
                currentRound: state.currentRound,
                totalRounds: state.totalRounds
            )

            NextRoundSummary(
                roundLabel: nextRoundLabel,
                matchups: state.nextMatchups ?? [],
                compact: false
            )
        }
    }

    private var nextRoundLabel: String {
        guard state.currentRound < state.totalRounds else { return "Poslednja" }
        return "Runda \(state.currentRound + 1)"
    }
}

private struct ExpandedIslandContent: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        Group {
            if state.status == "active" {
                VStack(alignment: .leading, spacing: 7) {
                    MatchupGroup(
                        matchups: state.matchups,
                        maximumVisible: 3,
                        isPrimary: true,
                        currentRound: state.currentRound,
                        totalRounds: state.totalRounds,
                        compact: true
                    )

                    NextRoundSummary(
                        roundLabel: state.currentRound < state.totalRounds
                            ? "Runda \(state.currentRound + 1)"
                            : "Poslednja",
                        matchups: state.nextMatchups ?? []
                    )
                }
            } else {
                FinishedSessionContent(state: state, compact: true)
            }
        }
        .padding(.top, 5)
        .padding(.horizontal, 2)
    }
}

private struct LiveBrandLockup: View {
    var body: some View {
        HStack(spacing: 7) {
            BrandMark()

            Text("Gweilo")
                .font(.caption.weight(.semibold))
                .foregroundStyle(LiveActivityStyle.secondaryText)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Gweilo aktivnost uživo")
    }
}

private struct BrandMark: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(LiveActivityStyle.accent)
                .frame(width: 17, height: 17)

            Circle()
                .fill(LiveActivityStyle.live)
                .frame(width: 6, height: 6)
                .overlay {
                    Circle().stroke(LiveActivityStyle.background, lineWidth: 1.5)
                }
                .offset(x: 2, y: -2)
        }
        .accessibilityHidden(true)
    }
}

private struct RoundLabel: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("Runda")
                .foregroundStyle(LiveActivityStyle.secondaryText)

            Text("\(state.currentRound)")
                .foregroundStyle(LiveActivityStyle.text)

            Text("od \(state.totalRounds)")
                .foregroundStyle(LiveActivityStyle.tertiaryText)
        }
        .font(
            compact
                ? .caption2.monospacedDigit().weight(.semibold)
                : .caption.monospacedDigit().weight(.semibold)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Runda \(state.currentRound) od \(state.totalRounds)"
        )
    }
}

private struct MatchupGroup: View {
    let matchups: [GweiloSessionActivityAttributes.Matchup]
    let maximumVisible: Int
    let isPrimary: Bool
    let currentRound: Int
    let totalRounds: Int
    var compact = false

    private var visibleMatchups: ArraySlice<
        GweiloSessionActivityAttributes.Matchup
    > {
        matchups.prefix(maximumVisible)
    }

    private var hiddenCount: Int {
        max(0, matchups.count - visibleMatchups.count)
    }

    private var progressRingCornerRadius: CGFloat {
        compact ? 18 : 22
    }

    private var progressRingGap: CGFloat {
        compact ? 4 : 5
    }

    private var innerCardCornerRadius: CGFloat {
        progressRingCornerRadius - progressRingGap
    }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 1 : 4) {
            if visibleMatchups.isEmpty {
                Text(isPrimary ? "Nema aktivnog meča" : "Još nije određeno")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(LiveActivityStyle.tertiaryText)
                    .lineLimit(1)
            } else {
                ForEach(Array(visibleMatchups.enumerated()), id: \.offset) {
                    _, matchup in
                    MatchupLine(
                        matchup: matchup,
                        isPrimary: isPrimary,
                        compact: compact
                    )
                }
            }

            if hiddenCount > 0 {
                Text("Još \(hiddenCount) \(hiddenCount == 1 ? "meč" : "meča")")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(LiveActivityStyle.tertiaryText)
            }
        }
        .padding(.horizontal, isPrimary ? (compact ? 7 : 9) : 1)
        .padding(.vertical, isPrimary ? (compact ? 4 : 7) : 0)
        .background {
            if isPrimary {
                RoundedRectangle(
                    cornerRadius: innerCardCornerRadius,
                    style: .continuous
                )
                .fill(LiveActivityStyle.subtleFill)
                .overlay {
                    RoundedRectangle(
                        cornerRadius: innerCardCornerRadius,
                        style: .continuous
                    )
                    .stroke(LiveActivityStyle.fill.opacity(0.55), lineWidth: 0.8)
                }
                .padding(progressRingGap)
            }
        }
        .overlay {
            if isPrimary {
                RoundProgressBorder(
                    currentRound: currentRound,
                    totalRounds: totalRounds,
                    cornerRadius: progressRingCornerRadius
                )
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct RoundProgressBorder: View {
    let currentRound: Int
    let totalRounds: Int
    let cornerRadius: CGFloat

    private var roundCount: Int {
        max(1, totalRounds)
    }

    private var segmentLength: CGFloat {
        1 / CGFloat(roundCount)
    }

    private let gap: CGFloat = 0.006

    var body: some View {
        ZStack {
            ForEach(1...roundCount, id: \.self) { round in
                let index = CGFloat(round - 1)
                let start = index == 0
                    ? 0
                    : index * segmentLength + gap / 2
                let rawEnd = CGFloat(round) * segmentLength
                let end = round == roundCount
                    ? rawEnd - gap
                    : rawEnd - gap / 2

                PerimeterProgressShape(
                    start: start,
                    end: end,
                    cornerRadius: cornerRadius
                )
                .stroke(
                    color(for: round),
                    style: StrokeStyle(
                        lineWidth: round == currentRound ? 3 : 2.2,
                        lineCap: .round
                    )
                )
            }
        }
        .accessibilityHidden(true)
    }

    private func color(for round: Int) -> Color {
        if round < currentRound {
            return LiveActivityStyle.accent.opacity(0.82)
        }
        if round == currentRound {
            return LiveActivityStyle.live
        }
        return LiveActivityStyle.fill
    }
}

private struct PerimeterProgressShape: Shape {
    let start: CGFloat
    let end: CGFloat
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        let radius = min(cornerRadius, min(rect.width, rect.height) / 2)
        var perimeter = Path()

        perimeter.move(to: CGPoint(x: rect.minX + radius, y: rect.minY))
        perimeter.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        perimeter.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + radius),
            control: CGPoint(x: rect.maxX, y: rect.minY)
        )
        perimeter.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        perimeter.addQuadCurve(
            to: CGPoint(x: rect.maxX - radius, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        perimeter.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        perimeter.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.maxY - radius),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        perimeter.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        perimeter.addQuadCurve(
            to: CGPoint(x: rect.minX + radius, y: rect.minY),
            control: CGPoint(x: rect.minX, y: rect.minY)
        )

        return perimeter.trimmedPath(
            from: min(1, max(0, start)),
            to: min(1, max(0, end))
        )
    }
}

private struct MatchupLine: View {
    let matchup: GweiloSessionActivityAttributes.Matchup
    let isPrimary: Bool
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 3 : 5) {
            MatchupSide(
                fallbackName: matchup.left,
                players: matchup.leftPlayers ?? [],
                isTrailing: true,
                compact: compact
            )

            Text("vs")
                .font(.system(size: compact ? 8 : 9, weight: .medium))
                .foregroundStyle(LiveActivityStyle.tertiaryText)
                .frame(width: compact ? 12 : 16)

            MatchupSide(
                fallbackName: matchup.right,
                players: matchup.rightPlayers ?? [],
                isTrailing: false,
                compact: compact
            )
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(matchup.left) protiv \(matchup.right), \(matchup.kind)"
        )
    }
}

private struct MatchupSide: View {
    let fallbackName: String
    let players: [GweiloSessionActivityAttributes.Player]
    let isTrailing: Bool
    let compact: Bool

    private var eloText: String? {
        let values = players.compactMap(\.elo).map(String.init)
        return values.isEmpty ? nil : values.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            if isTrailing {
                PlayerAvatarStack(players: players, compact: compact)
            }

            VStack(alignment: isTrailing ? .trailing : .leading, spacing: 0) {
                Text(fallbackName)
                    .font(
                        compact
                            ? .system(size: 9, weight: .semibold)
                            : .caption.weight(.semibold)
                    )
                    .foregroundStyle(LiveActivityStyle.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.76)

                if let eloText {
                    Text(eloText)
                        .font(.system(size: compact ? 7 : 8, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(LiveActivityStyle.tertiaryText)
                        .lineLimit(1)
                }
            }
            .layoutPriority(1)

            if !isTrailing {
                PlayerAvatarStack(players: players, compact: compact)
            }
        }
        .frame(
            maxWidth: .infinity,
            alignment: isTrailing ? .trailing : .leading
        )
    }
}

private struct PlayerAvatarStack: View {
    let players: [GweiloSessionActivityAttributes.Player]
    let compact: Bool

    private var visiblePlayers: ArraySlice<
        GweiloSessionActivityAttributes.Player
    > {
        players.prefix(2)
    }

    var body: some View {
        HStack(spacing: compact ? -5 : -6) {
            ForEach(visiblePlayers, id: \.name) { player in
                PlayerAvatar(player: player, compact: compact)
            }
        }
        .frame(minWidth: players.count > 1 ? (compact ? 23 : 28) : 0)
        .accessibilityHidden(true)
    }
}

private struct PlayerAvatar: View {
    let player: GweiloSessionActivityAttributes.Player
    let compact: Bool

    private var size: CGFloat { compact ? 15 : 18 }

    private var initials: String {
        player.name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }

    private var resolvedURL: URL? {
        if let avatarURL = player.avatarURL.flatMap(URL.init(string:)) {
            return avatarURL
        }
        guard var components = URLComponents(
            string: "https://api.dicebear.com/10.x/waves/png"
        ) else {
            return nil
        }
        components.queryItems = [URLQueryItem(name: "seed", value: player.name)]
        return components.url
    }

    var body: some View {
        AsyncImage(url: resolvedURL, transaction: Transaction(animation: nil)) {
            phase in
            if case let .success(image) = phase {
                image
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initials)
                    .font(.system(size: size * 0.36, weight: .bold))
                    .foregroundStyle(LiveActivityStyle.text.opacity(0.78))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(LiveActivityStyle.accent.opacity(0.22))
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .overlay {
            Circle()
                .stroke(LiveActivityStyle.background, lineWidth: 1.5)
                .overlay {
                    Circle()
                        .stroke(
                            LiveActivityStyle.accent.opacity(0.45),
                            lineWidth: 0.7
                        )
                        .padding(1)
                }
        }
    }
}

private struct NextRoundSummary: View {
    let roundLabel: String
    let matchups: [GweiloSessionActivityAttributes.Matchup]
    var compact = true

    private var summary: String {
        guard !matchups.isEmpty else { return "Još nije određeno" }
        return matchups.prefix(3)
            .map { "\($0.left) vs \($0.right)" }
            .joined(separator: "  ·  ")
    }

    var body: some View {
        VStack(alignment: .center, spacing: 2) {
            Text(roundLabel)
                .font(
                    .system(size: compact ? 9 : 10, weight: .semibold)
                        .monospacedDigit()
                )
                .foregroundStyle(LiveActivityStyle.secondaryText)
                .frame(maxWidth: .infinity)

            Text(summary)
                .font(.system(size: compact ? 9 : 10, weight: .medium))
                .foregroundStyle(LiveActivityStyle.secondaryText)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct FinishedSessionContent: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    private var isCancelled: Bool {
        state.status == "cancelled"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 10) {
            HStack(spacing: 9) {
                Image(
                    systemName: isCancelled
                        ? "xmark.circle.fill"
                        : "checkmark.circle.fill"
                )
                .font(.title3)
                .foregroundStyle(
                    isCancelled
                        ? LiveActivityStyle.secondaryText
                        : LiveActivityStyle.live
                )

                VStack(alignment: .leading, spacing: 1) {
                    Text(state.headline)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(LiveActivityStyle.text)

                    if let latestResult = state.latestResult {
                        Text(latestResult)
                            .font(.caption)
                            .foregroundStyle(LiveActivityStyle.secondaryText)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 8)

                BrandMark()
            }

            if !isCancelled {
                PerformanceSummary(state: state)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct PerformanceSummary: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        if
            let bestName = state.bestPlayerName,
            let bestDelta = state.bestPlayerDelta,
            let worstName = state.worstPlayerName,
            let worstDelta = state.worstPlayerDelta
        {
            HStack(spacing: 12) {
                PerformanceValue(
                    name: bestName,
                    delta: bestDelta,
                    systemImage: "arrow.up.right"
                )

                Divider()
                    .overlay(LiveActivityStyle.fill)

                PerformanceValue(
                    name: worstName,
                    delta: worstDelta,
                    systemImage: "arrow.down.right"
                )
            }
            .frame(height: 32)
        }
    }
}

private struct PerformanceValue: View {
    let name: String
    let delta: Int
    let systemImage: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption2.weight(.bold))
                .foregroundStyle(
                    delta >= 0 ? LiveActivityStyle.live : .red.opacity(0.82)
                )

            Text(name)
                .lineLimit(1)

            Spacer(minLength: 2)

            Text(delta > 0 ? "+\(delta)" : "\(delta)")
                .monospacedDigit()
                .foregroundStyle(
                    delta >= 0 ? LiveActivityStyle.live : .red.opacity(0.82)
                )
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(LiveActivityStyle.text)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

private struct CompactLiveMark: View {
    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(LiveActivityStyle.live)
                .frame(width: 6, height: 6)
            Text("G")
                .font(.caption2.weight(.bold))
                .foregroundStyle(LiveActivityStyle.text)
        }
        .accessibilityLabel("Gweilo termin uživo")
    }
}

private struct MinimalLiveMark: View {
    var body: some View {
        Circle()
            .fill(LiveActivityStyle.live)
            .frame(width: 10, height: 10)
            .overlay {
                Circle().stroke(LiveActivityStyle.accent, lineWidth: 2)
                    .padding(-3)
            }
            .accessibilityLabel("Gweilo termin uživo")
    }
}

#Preview(
    "Lock Screen",
    as: .content,
    using: GweiloSessionActivityAttributes.preview,
    widget: { GweiloSessionLiveActivity() },
    contentStates: {
        GweiloSessionActivityAttributes.ContentState.previewActive
        GweiloSessionActivityAttributes.ContentState.previewCompleted
    }
)

#Preview(
    "Dynamic Island – Expanded",
    as: .dynamicIsland(.expanded),
    using: GweiloSessionActivityAttributes.preview,
    widget: { GweiloSessionLiveActivity() },
    contentStates: {
        GweiloSessionActivityAttributes.ContentState.previewActive
    }
)
