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
                    LiveStatusLabel(state: context.state, compact: true)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RoundCounter(state: context.state, compact: true)
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

            VStack(spacing: 9) {
                HStack {
                    LiveStatusLabel(state: context.state)
                    Spacer()
                    RoundCounter(state: context.state)
                }
                .overlay {
                    GweiloRallyMark(size: 38)
                        .accessibilityHidden(true)
                }

                if let primaryMatchup = context.state.matchups.first {
                    HeroMatchup(matchup: primaryMatchup)

                    if context.state.matchups.count > 1 {
                        SecondaryMatchup(
                            matchup: context.state.matchups[1]
                        )
                    }
                } else {
                    CompletedSessionHeadline(state: context.state)
                }

                ProgressSummary(state: context.state)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 12)
        }
        .accessibilityElement(children: .contain)
    }
}

private struct ExpandedIslandContent: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 8) {
            if let primaryMatchup = state.matchups.first {
                HeroMatchup(matchup: primaryMatchup, compact: true)
            } else {
                CompletedSessionHeadline(state: state, compact: true)
            }

            ProgressSummary(state: state, compact: true)
        }
        .padding(.horizontal, 4)
    }
}

private struct LiveStatusLabel: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    private var isCompleted: Bool {
        state.status == "completed"
    }

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            Circle()
                .fill(isCompleted
                    ? LiveActivityStyle.purple
                    : LiveActivityStyle.lime
                )
                .frame(
                    width: compact ? 6 : 7,
                    height: compact ? 6 : 7
                )
                .shadow(
                    color: isCompleted
                        ? LiveActivityStyle.purple.opacity(0.65)
                        : LiveActivityStyle.lime.opacity(0.65),
                    radius: 4
                )

            Text(isCompleted ? "ZAVRŠENO" : "UŽIVO")
                .font(
                    .system(
                        size: compact ? 9 : 10,
                        weight: .black
                    )
                )
                .tracking(compact ? 0.6 : 1)
                .foregroundStyle(
                    isCompleted
                        ? LiveActivityStyle.bone
                        : LiveActivityStyle.lime
                )
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            isCompleted ? "Sesija je završena" : "Sesija je uživo"
        )
    }
}

private struct RoundCounter: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("RUNDA")
                .font(
                    .system(
                        size: compact ? 8 : 9,
                        weight: .bold
                    )
                )
                .tracking(0.8)
                .foregroundStyle(LiveActivityStyle.muted)

            Text("\(state.currentRound)/\(state.totalRounds)")
                .font(
                    .system(
                        size: compact ? 15 : 18,
                        weight: .black
                    )
                )
                .monospacedDigit()
                .foregroundStyle(LiveActivityStyle.bone)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Runda \(state.currentRound) od \(state.totalRounds)"
        )
    }
}

private struct HeroMatchup: View {
    let matchup: GweiloSessionActivityAttributes.Matchup
    var compact = false

    var body: some View {
        VStack(spacing: compact ? 4 : 5) {
            Text(matchup.kind.uppercased())
                .font(
                    .system(
                        size: compact ? 8 : 9,
                        weight: .black
                    )
                )
                .tracking(1.1)
                .foregroundStyle(LiveActivityStyle.purple)

            HStack(spacing: compact ? 8 : 11) {
                TeamName(matchup.left, alignment: .trailing, compact: compact)

                VersusMark(compact: compact)

                TeamName(matchup.right, alignment: .leading, compact: compact)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(matchup.kind), \(matchup.left) protiv \(matchup.right)"
        )
    }
}

private struct TeamName: View {
    let name: String
    let alignment: Alignment
    let compact: Bool

    init(
        _ name: String,
        alignment: Alignment,
        compact: Bool
    ) {
        self.name = name
        self.alignment = alignment
        self.compact = compact
    }

    var body: some View {
        Text(name)
            .font(
                .system(
                    size: compact ? 15 : 18,
                    weight: .heavy
                )
            )
            .foregroundStyle(LiveActivityStyle.bone)
            .lineLimit(1)
            .minimumScaleFactor(0.68)
            .frame(maxWidth: .infinity, alignment: alignment)
    }
}

private struct VersusMark: View {
    var compact = false

    var body: some View {
        ZStack {
            Circle()
                .fill(LiveActivityStyle.purple.opacity(0.16))

            Circle()
                .stroke(LiveActivityStyle.purple.opacity(0.55), lineWidth: 1)

            Text("VS")
                .font(
                    .system(
                        size: compact ? 8 : 9,
                        weight: .black
                    )
                )
                .foregroundStyle(LiveActivityStyle.lime)
        }
        .frame(
            width: compact ? 25 : 29,
            height: compact ? 25 : 29
        )
        .shadow(
            color: LiveActivityStyle.purple.opacity(0.24),
            radius: 5
        )
    }
}

private struct SecondaryMatchup: View {
    let matchup: GweiloSessionActivityAttributes.Matchup

    var body: some View {
        HStack(spacing: 7) {
            Text("MEČ 2")
                .font(.system(size: 8, weight: .black))
                .tracking(0.9)
                .foregroundStyle(LiveActivityStyle.muted)

            Text(matchup.left)
                .lineLimit(1)
            Text("VS")
                .font(.system(size: 8, weight: .black))
                .foregroundStyle(LiveActivityStyle.purple)
            Text(matchup.right)
                .lineLimit(1)

            Spacer(minLength: 0)

            Text(matchup.kind.uppercased())
                .font(.system(size: 8, weight: .black))
                .tracking(0.7)
                .foregroundStyle(LiveActivityStyle.lime.opacity(0.82))
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(LiveActivityStyle.bone.opacity(0.88))
        .padding(.horizontal, 10)
        .frame(height: 24)
        .background(
            LiveActivityStyle.subtle,
            in: Capsule()
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Drugi meč: \(matchup.left) protiv \(matchup.right)"
        )
    }
}

private struct CompletedSessionHeadline: View {
    let state: GweiloSessionActivityAttributes.ContentState
    var compact = false

    var body: some View {
        VStack(spacing: compact ? 3 : 5) {
            Text("SESIJA JE ZAVRŠENA")
                .font(
                    .system(
                        size: compact ? 15 : 18,
                        weight: .heavy
                    )
                )
                .foregroundStyle(LiveActivityStyle.bone)

            if let latestResult = state.latestResult {
                Text(latestResult)
                    .font(
                        .system(
                            size: compact ? 10 : 11,
                            weight: .semibold
                        )
                    )
                    .foregroundStyle(LiveActivityStyle.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .accessibilityElement(children: .combine)
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
