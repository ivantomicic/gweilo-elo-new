import ActivityKit
import SwiftUI
import WidgetKit

private enum LiveActivityStyle {
    static let lime = Color(red: 0.69, green: 1, blue: 0.04)
    static let purple = Color(red: 0.53, green: 0.24, blue: 1)
    static let bone = Color(red: 0.96, green: 0.95, blue: 0.91)
    static let muted = Color.white.opacity(0.52)
    static let subtle = Color.white.opacity(0.12)
    static let panel = Color(red: 0.025, green: 0.018, blue: 0.045)
}

struct GweiloSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GweiloSessionActivityAttributes.self) {
            context in
            LockScreenSessionView(context: context)
                .activityBackgroundTint(LiveActivityStyle.panel)
                .activitySystemActionForegroundColor(LiveActivityStyle.bone)
                .widgetURL(sessionURL(context.attributes.sessionID))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("RUNDA")
                        .font(.system(size: 9, weight: .black))
                        .tracking(0.9)
                        .foregroundStyle(LiveActivityStyle.muted)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RoundValue(state: context.state, compact: true)
                }
                DynamicIslandExpandedRegion(.center) {
                    GweiloRallyMark(size: 31)
                        .accessibilityHidden(true)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedIslandContent(state: context.state)
                }
            } compactLeading: {
                GweiloRallyMark(size: 21)
                    .accessibilityHidden(true)
            } compactTrailing: {
                Text(
                    "\(context.state.currentRound)/\(context.state.totalRounds)"
                )
                .font(.caption.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(LiveActivityStyle.lime)
            } minimal: {
                MinimalActivityMark()
            }
            .widgetURL(sessionURL(context.attributes.sessionID))
            .keylineTint(LiveActivityStyle.purple)
        }
    }

    private func sessionURL(_ sessionID: String) -> URL? {
        URL(string: "gweilo://session/\(sessionID)")
    }
}

private struct LockScreenSessionView: View {
    let context: ActivityViewContext<GweiloSessionActivityAttributes>

    var body: some View {
        ZStack {
            LiveActivityBackdrop()

            VStack(spacing: 5) {
                if context.state.status == "active" {
                    ProminentRoundHeader(state: context.state)

                    MatchupSummaryRow(
                        label: "SADA",
                        matchups: context.state.matchups,
                        tint: LiveActivityStyle.lime,
                        showsEveryMatch: true
                    )

                    MatchupSummaryRow(
                        label: "SLEDEĆI",
                        matchups: context.state.nextMatchups ?? [],
                        tint: LiveActivityStyle.purple,
                        showsEveryMatch: false
                    )

                    ProgressSummary(state: context.state)
                } else {
                    CompletedSessionHeadline(state: context.state)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
        }
        .accessibilityElement(children: .contain)
    }
}

private struct ExpandedIslandContent: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 8) {
            if state.status == "active" {
                MatchupSummaryRow(
                    label: "SADA",
                    matchups: state.matchups,
                    tint: LiveActivityStyle.lime,
                    showsEveryMatch: true,
                    compact: true
                )
                MatchupSummaryRow(
                    label: "SLEDEĆI",
                    matchups: state.nextMatchups ?? [],
                    tint: LiveActivityStyle.purple,
                    showsEveryMatch: false,
                    compact: true
                )

                ProgressSummary(state: state, compact: true)
            } else {
                CompletedSessionHeadline(state: state, compact: true)
            }
        }
        .padding(.horizontal, 4)
    }
}

private struct ProminentRoundHeader: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: -2) {
                Text("RUNDA")
                    .font(.system(size: 9, weight: .black))
                    .tracking(1.1)
                    .foregroundStyle(LiveActivityStyle.lime)

                RoundValue(state: state)
            }

            Spacer()

            GweiloRallyMark(size: 34)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Runda \(state.currentRound) od \(state.totalRounds)"
        )
    }
}

private struct RoundValue: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 3) {
            Text("\(state.currentRound)")
                .font(.system(size: compact ? 20 : 34, weight: .black))
                .foregroundStyle(LiveActivityStyle.bone)

            Text("/ \(state.totalRounds)")
                .font(.system(size: compact ? 10 : 12, weight: .bold))
                .foregroundStyle(LiveActivityStyle.muted)
        }
        .monospacedDigit()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Runda \(state.currentRound) od \(state.totalRounds)"
        )
    }
}

private struct MatchupSummaryRow: View {
    let label: String
    let matchups: [GweiloSessionActivityAttributes.Matchup]
    let tint: Color
    let showsEveryMatch: Bool
    var compact = false

    private var visibleMatchups: [GweiloSessionActivityAttributes.Matchup] {
        showsEveryMatch ? matchups : Array(matchups.prefix(1))
    }

    private var hiddenCount: Int {
        max(0, matchups.count - visibleMatchups.count)
    }

    private var summary: String {
        guard !visibleMatchups.isEmpty else {
            return "—"
        }
        let pairings = visibleMatchups
            .map { "\($0.left) VS \($0.right)" }
            .joined(separator: "  ·  ")
        return hiddenCount > 0 ? "\(pairings)  +\(hiddenCount)" : pairings
    }

    var body: some View {
        HStack(spacing: compact ? 7 : 9) {
            Text(label)
                .font(
                    .system(
                        size: compact ? 8 : 9,
                        weight: .black
                    )
                )
                .tracking(0.8)
                .foregroundStyle(tint)
                .frame(width: compact ? 48 : 57, alignment: .leading)

            Text(summary)
                .font(.system(size: compact ? 9 : 10, weight: .bold))
                .foregroundStyle(
                    visibleMatchups.isEmpty
                        ? LiveActivityStyle.muted
                        : LiveActivityStyle.bone
                )
                .lineLimit(1)
                .minimumScaleFactor(0.62)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, compact ? 7 : 9)
        .frame(height: compact ? 20 : 22)
        .background(
            LiveActivityStyle.subtle.opacity(0.68),
            in: .rect(cornerRadius: 6)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(summary)")
    }
}

private struct CompletedSessionHeadline: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    var body: some View {
        VStack(spacing: compact ? 5 : 7) {
            HStack {
                Text("SESIJA JE ZAVRŠENA")
                    .font(
                        .system(
                            size: compact ? 13 : 16,
                            weight: .heavy
                        )
                    )
                    .foregroundStyle(LiveActivityStyle.bone)

                Spacer()

                GweiloRallyMark(size: compact ? 22 : 28)
                    .accessibilityHidden(true)
            }

            if
                let bestPlayerName = state.bestPlayerName,
                let bestPlayerDelta = state.bestPlayerDelta,
                let worstPlayerName = state.worstPlayerName,
                let worstPlayerDelta = state.worstPlayerDelta
            {
                HStack(spacing: compact ? 5 : 7) {
                    PerformanceResult(
                        label: "NAJVEĆI PLUS",
                        name: bestPlayerName,
                        delta: bestPlayerDelta,
                        tint: LiveActivityStyle.lime,
                        compact: compact
                    )
                    PerformanceResult(
                        label: "NAJVEĆI MINUS",
                        name: worstPlayerName,
                        delta: worstPlayerDelta,
                        tint: .red,
                        compact: compact
                    )
                }
            } else if let latestResult = state.latestResult {
                Text(latestResult)
                    .font(.system(size: compact ? 9 : 11, weight: .semibold))
                    .foregroundStyle(LiveActivityStyle.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct PerformanceResult: View {
    let label: String
    let name: String
    let delta: Int
    let tint: Color
    let compact: Bool

    private var deltaLabel: String {
        "\(delta > 0 ? "+" : "")\(delta) ELO"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 1 : 2) {
            Text(label)
                .font(.system(size: compact ? 7 : 8, weight: .black))
                .tracking(0.6)
                .foregroundStyle(tint)

            HStack(spacing: 4) {
                Text(name)
                    .foregroundStyle(LiveActivityStyle.bone)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Spacer(minLength: 2)

                Text(deltaLabel)
                    .monospacedDigit()
                    .foregroundStyle(tint)
            }
            .font(.system(size: compact ? 9 : 11, weight: .bold))
        }
        .padding(.horizontal, compact ? 6 : 8)
        .frame(maxWidth: .infinity, minHeight: compact ? 34 : 40)
        .background(
            LiveActivityStyle.subtle.opacity(0.7),
            in: .rect(cornerRadius: 7)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(name), \(deltaLabel)")
    }
}

private struct ProgressSummary: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    private let segmentCount = 8

    private var filledSegments: Int {
        guard state.totalMatches > 0 else {
            return 0
        }
        let progress = Double(state.completedMatches)
            / Double(state.totalMatches)
        return min(
            segmentCount,
            Int(ceil(progress * Double(segmentCount)))
        )
    }

    var body: some View {
        HStack(spacing: compact ? 7 : 9) {
            HStack(spacing: 3) {
                ForEach(0..<segmentCount, id: \.self) { index in
                    Capsule()
                        .fill(
                            index < filledSegments
                                ? LiveActivityStyle.lime
                                : LiveActivityStyle.subtle
                        )
                        .frame(height: compact ? 3 : 4)
                }
            }

            Text("\(state.completedMatches)/\(state.totalMatches)")
                .font(
                    .system(
                        size: compact ? 9 : 10,
                        weight: .bold
                    )
                )
                .monospacedDigit()
                .foregroundStyle(LiveActivityStyle.muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Napredak sesije")
        .accessibilityValue(
            "\(state.completedMatches) od \(state.totalMatches) mečeva"
        )
    }
}

private struct LiveActivityBackdrop: View {
    var body: some View {
        ZStack {
            RadialGradient(
                colors: [
                    LiveActivityStyle.purple.opacity(0.2),
                    .clear
                ],
                center: .topTrailing,
                startRadius: 0,
                endRadius: 165
            )

            LinearGradient(
                colors: [
                    .clear,
                    LiveActivityStyle.purple.opacity(0.055),
                    .clear
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        }
        .accessibilityHidden(true)
    }
}

private struct GweiloRallyMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(LiveActivityStyle.purple.opacity(0.2))
                .blur(radius: size * 0.14)
                .scaleEffect(1.2)

            Ellipse()
                .trim(from: 0.08, to: 0.92)
                .stroke(
                    LinearGradient(
                        colors: [
                            LiveActivityStyle.purple.opacity(0.18),
                            LiveActivityStyle.purple,
                            LiveActivityStyle.lime
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    style: StrokeStyle(
                        lineWidth: max(1, size * 0.045),
                        lineCap: .round
                    )
                )
                .frame(width: size, height: size * 0.55)
                .rotationEffect(.degrees(-18))

            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            .white,
                            LiveActivityStyle.bone,
                            LiveActivityStyle.bone.opacity(0.72)
                        ],
                        center: .topLeading,
                        startRadius: 1,
                        endRadius: size * 0.45
                    )
                )
                .frame(width: size * 0.48, height: size * 0.48)
                .shadow(
                    color: LiveActivityStyle.purple.opacity(0.65),
                    radius: size * 0.12
                )
                .overlay {
                    MascotFace(size: size)
                }

            Circle()
                .fill(LiveActivityStyle.lime)
                .frame(width: size * 0.1, height: size * 0.1)
                .offset(x: size * 0.43, y: size * 0.06)
                .shadow(
                    color: LiveActivityStyle.lime.opacity(0.85),
                    radius: size * 0.11
                )
        }
        .frame(width: size, height: size)
    }
}

private struct MascotFace: View {
    let size: CGFloat

    var body: some View {
        HStack(spacing: size * 0.085) {
            Capsule()
                .fill(LiveActivityStyle.panel)
                .frame(width: size * 0.11, height: size * 0.035)
                .rotationEffect(.degrees(18))

            Capsule()
                .fill(LiveActivityStyle.panel)
                .frame(width: size * 0.11, height: size * 0.035)
                .rotationEffect(.degrees(-18))
        }
        .offset(y: -size * 0.015)
    }
}

private struct MinimalActivityMark: View {
    var body: some View {
        ZStack {
            Circle()
                .stroke(
                    LiveActivityStyle.purple.opacity(0.9),
                    lineWidth: 2
                )
                .frame(width: 15, height: 15)

            Circle()
                .fill(LiveActivityStyle.lime)
                .frame(width: 7, height: 7)
                .shadow(
                    color: LiveActivityStyle.lime.opacity(0.8),
                    radius: 3
                )
        }
        .accessibilityLabel("Gweilo sesija je uživo")
    }
}
