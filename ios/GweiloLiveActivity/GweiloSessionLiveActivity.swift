import ActivityKit
import SwiftUI
import WidgetKit

private enum LiveActivityStyle {
    static let lime = Color(red: 0.69, green: 1, blue: 0.04)
    static let purple = Color(red: 0.53, green: 0.24, blue: 1)
    static let bone = Color(red: 0.96, green: 0.95, blue: 0.91)
    static let muted = Color.white.opacity(0.54)
    static let panel = Color(red: 0.04, green: 0.03, blue: 0.07)
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
                    ActivityMark()
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RoundCounter(state: context.state)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.headline)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(LiveActivityStyle.bone)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 10) {
                        MatchupList(state: context.state, compact: true)
                        ProgressLine(state: context.state)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                ActivityMark(compact: true)
            } compactTrailing: {
                Text("\(context.state.currentRound)/\(context.state.totalRounds)")
                    .font(.caption.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(LiveActivityStyle.lime)
            } minimal: {
                Circle()
                    .fill(LiveActivityStyle.lime)
                    .frame(width: 9, height: 9)
                    .shadow(color: LiveActivityStyle.lime.opacity(0.7), radius: 4)
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                ActivityMark()
                VStack(alignment: .leading, spacing: 2) {
                    Text("GWEILO · NOVI SAD")
                        .font(.caption2.weight(.bold))
                        .tracking(1.25)
                        .foregroundStyle(LiveActivityStyle.lime)
                    Text(context.state.headline)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(LiveActivityStyle.bone)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                RoundCounter(state: context.state)
            }

            MatchupList(state: context.state, compact: false)
            ProgressLine(state: context.state)

            if let latestResult = context.state.latestResult {
                Text(latestResult)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LiveActivityStyle.muted)
                    .lineLimit(1)
                    .transition(.opacity)
            }
        }
        .padding(16)
    }
}

private struct ActivityMark: View {
    var compact = false

    var body: some View {
        ZStack {
            Circle()
                .fill(LiveActivityStyle.purple.opacity(0.2))
            Image(systemName: "figure.table.tennis")
                .font(compact ? .caption2.weight(.bold) : .caption.weight(.bold))
                .foregroundStyle(LiveActivityStyle.lime)
        }
        .frame(width: compact ? 22 : 36, height: compact ? 22 : 36)
    }
}

private struct RoundCounter: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text("RUNDA")
                .font(.system(size: 9, weight: .bold))
                .tracking(1)
                .foregroundStyle(LiveActivityStyle.muted)
            Text("\(state.currentRound)/\(state.totalRounds)")
                .font(.title3.weight(.black))
                .monospacedDigit()
                .foregroundStyle(LiveActivityStyle.lime)
        }
    }
}

private struct MatchupList: View {
    let state: GweiloSessionActivityAttributes.ContentState
    let compact: Bool

    var body: some View {
        VStack(spacing: compact ? 4 : 7) {
            ForEach(Array(state.matchups.prefix(2).enumerated()), id: \.offset) {
                _, matchup in
                HStack(spacing: 8) {
                    Text(matchup.kind)
                        .font(.system(size: 9, weight: .bold))
                        .tracking(0.7)
                        .foregroundStyle(LiveActivityStyle.purple)
                        .frame(width: 34, alignment: .leading)
                    Text(matchup.left)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Text("VS")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(LiveActivityStyle.muted)
                    Text(matchup.right)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(LiveActivityStyle.bone)
                .lineLimit(1)
            }
        }
    }
}

private struct ProgressLine: View {
    let state: GweiloSessionActivityAttributes.ContentState

    var body: some View {
        GeometryReader { proxy in
            let progress = state.totalMatches > 0
                ? Double(state.completedMatches) / Double(state.totalMatches)
                : 0
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.11))
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                LiveActivityStyle.purple,
                                LiveActivityStyle.lime
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: proxy.size.width * progress)
            }
        }
        .frame(height: 4)
        .accessibilityLabel("Napredak sesije")
        .accessibilityValue(
            "\(state.completedMatches) od \(state.totalMatches) mečeva"
        )
    }
}
