import Observation
import SwiftUI

enum PlayerProfileEntranceStage: Int, CaseIterable {
    case portrait, name, elo, form, record, chart, matches
}

/// A profile gets one entrance, not a new animation on refresh or chart selection.
@Observable
@MainActor
final class PlayerProfileEntranceSequence {
    private(set) var revealedStages: Set<PlayerProfileEntranceStage> = []
    private(set) var hasStarted = false
    private(set) var suppressesMotion = false

    static let sectionAnimation = GweiloEntranceMotion.section
    static let numberAnimation = GweiloEntranceMotion.number

    func run(skipMotion: Bool) async {
        guard !hasStarted else { return }
        hasStarted = true
        guard !skipMotion, !Task.isCancelled else {
            finishImmediately()
            return
        }

        do {
            // Commit the initial frame before starting native numeric transitions.
            try await Task.sleep(for: .milliseconds(16))
            for stage in PlayerProfileEntranceStage.allCases {
                try Task.checkCancellation()
                guard !suppressesMotion else { return }
                revealedStages.insert(stage)
                if stage != .matches {
                    try await Task.sleep(for: .milliseconds(120))
                }
            }
        } catch {
            // A popped/backgrounded view must never return partially hidden.
            finishImmediately()
        }
    }

    func finishImmediately() {
        guard hasStarted else { return }
        suppressesMotion = true
        revealedStages = Set(PlayerProfileEntranceStage.allCases)
    }
}

private struct PlayerProfileEntranceModifier: ViewModifier {
    @Environment(PlayerProfileEntranceSequence.self) private var entrance
    let stage: PlayerProfileEntranceStage

    func body(content: Content) -> some View {
        let revealed = entrance.revealedStages.contains(stage)
        content
            .opacity(revealed ? 1 : 0)
            .offset(y: revealed ? 0 : 6)
            .animation(
                entrance.suppressesMotion ? nil : PlayerProfileEntranceSequence.sectionAnimation,
                value: revealed
            )
    }
}

extension View {
    func playerProfileEntrance(_ stage: PlayerProfileEntranceStage) -> some View {
        modifier(PlayerProfileEntranceModifier(stage: stage))
    }
}

struct PlayerProfileAnimatedNumber: View {
    @Environment(PlayerProfileEntranceSequence.self) private var entrance
    let value: Int
    let stage: PlayerProfileEntranceStage

    var body: some View {
        let revealed = entrance.revealedStages.contains(stage)
        GweiloEntranceNumber(
            value: value,
            revealed: revealed,
            suppressesMotion: entrance.suppressesMotion,
            locale: Locale(identifier: "sr_Latn_RS")
        )
    }
}

struct PlayerProfileHeader: View {
    let player: RankingEntry
    let goBack: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: -32) {
                portrait
                    .playerProfileEntrance(.portrait)

                Text(player.name.uppercased())
                    .font(GweiloTheme.displayFont(size: 40, relativeTo: .largeTitle))
                    .tracking(-0.4)
                    .foregroundStyle(GweiloTheme.bone)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)
                    .accessibilityAddTraits(.isHeader)
                    .playerProfileEntrance(.name)
            }

            VStack(spacing: 4) {
                Text("SINGL ELO")
                    .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                    .tracking(1.4)
                    .foregroundStyle(GweiloTheme.muted)

                PlayerProfileAnimatedNumber(value: player.elo, stage: .elo)
                    .font(GweiloTheme.displayFont(size: 44, relativeTo: .largeTitle).monospacedDigit())
                    .tracking(-0.6)
                    .foregroundStyle(GweiloTheme.bone)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Singl Elo, \(player.elo)")
            .playerProfileEntrance(.elo)

            if !player.recentForm.isEmpty {
                PlayerProfileFormStrip(
                    deltas: player.recentForm,
                    scores: player.recentFormScores
                )
                .padding(.top, 4)
                .playerProfileEntrance(.form)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
        .padding(.bottom, 4)
        .overlay(alignment: .topLeading) {
            // Keep native back navigation without consuming a separate header row.
            PlayerProfileBackButton(action: goBack)
                .padding(.top, 12)
        }
    }

    private var portrait: some View {
        CachedRemoteImage(url: player.avatarURL, pointSize: 200) { image in
            image.resizable().interpolation(.high).scaledToFill()
        } placeholder: {
            Text(player.initials)
                .font(GweiloTheme.displayFont(size: 64, relativeTo: .largeTitle))
                .foregroundStyle(GweiloTheme.bone)
                .offset(y: -24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(GweiloTheme.raisedSurface)
        }
        .frame(width: 200, height: 200)
        .clipShape(.circle)
        .mask {
            LinearGradient(
                stops: [
                    .init(color: .black, location: 0.25),
                    .init(color: .black.opacity(0.65), location: 0.48),
                    .init(color: .black.opacity(0.2), location: 0.65),
                    .init(color: .clear, location: 0.82)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .accessibilityHidden(true)
    }
}

struct PlayerProfileFormEntry: Equatable {
    let delta: Double
    let band: EloPerformanceBand

    /// The web's five chronological slots, left-padded for short histories.
    static func slots(deltas: [Double], scores: [Double]?) -> [Self?] {
        let alignedScores = scores?.count == deltas.count ? scores : nil
        let entries: [Self?] = deltas.enumerated().suffix(5).map { index, delta in
            guard delta.isFinite else { return nil }
            let score = alignedScores?[index]
            return Self(
                delta: delta,
                band: EloPerformanceBand(
                    formScore: score?.isFinite == true ? score : FormPerformanceScore.fallback(for: delta)
                )
            )
        }
        return Array(repeating: nil, count: 5 - entries.count) + entries
    }

    var color: Color {
        switch band {
        case .gain: GweiloTheme.lime
        case .steady: GweiloTheme.amber
        case .loss: GweiloTheme.coral
        }
    }

    var formattedDelta: String {
        let magnitude = abs(delta).formatted(.number.precision(.fractionLength(0)).locale(Locale(identifier: "sr_Latn_RS")))
        return delta > 0 ? "+\(magnitude)" : delta < 0 ? "−\(magnitude)" : "0"
    }

    var accessibilityDescription: String {
        let form: String = switch band {
        case .gain: "dobra forma"
        case .steady: "stabilna forma"
        case .loss: "slaba forma"
        }
        return "\(formattedDelta) Elo, \(form)"
    }
}

struct PlayerProfileFormStrip: View {
    let deltas: [Double]
    let scores: [Double]?

    private var entries: [PlayerProfileFormEntry?] {
        PlayerProfileFormEntry.slots(deltas: deltas, scores: scores)
    }

    var body: some View {
        let slots = entries
        VStack(spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack {
                    Text("FORMA · POSLEDNJIH 5 TERMINA")
                    Spacer(minLength: 8)
                    Text("Elo Δ").tracking(0)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("FORMA · POSLEDNJIH 5 TERMINA")
                    Text("Elo Δ").tracking(0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
            .tracking(0.8)
            .foregroundStyle(GweiloTheme.muted)

            VStack(spacing: 8) {
                LinearGradient(
                    stops: slots.enumerated().map { index, entry in
                        .init(color: entry?.color ?? GweiloTheme.muted.opacity(0.3), location: (Double(index) + 0.5) / 5)
                    },
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(height: 8)
                .clipShape(.rect(cornerRadius: 3))

                HStack(spacing: 8) {
                    // Identity is the stable slot position, including empty slots.
                    ForEach(0..<5) { index in
                        Text(slots[index]?.formattedDelta ?? "—")
                            .font(.system(.caption2, design: .monospaced, weight: .semibold))
                            .foregroundStyle(slots[index]?.color ?? GweiloTheme.muted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Forma, poslednjih pet termina, od najstarijeg ka najnovijem")
        .accessibilityValue(slots.map { $0?.accessibilityDescription ?? "Nema termina" }.joined(separator: "; "))
    }
}
