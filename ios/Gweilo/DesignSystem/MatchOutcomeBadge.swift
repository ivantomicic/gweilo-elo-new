import SwiftUI

extension MatchOutcome {
    var color: Color {
        switch self {
        case .win:
            GweiloTheme.lime
        case .loss:
            GweiloTheme.coral
        case .draw:
            GweiloTheme.amber
        }
    }

    fileprivate var assetName: String {
        switch self {
        case .win:
            "MatchResultWin"
        case .loss:
            "MatchResultLoss"
        case .draw:
            "MatchResultDraw"
        }
    }
}

struct MatchOutcomeBadge: View {
    let outcome: MatchOutcome

    @ScaledMetric(relativeTo: .caption) private var size = 34.0

    var body: some View {
        Image(outcome.assetName)
            .resizable()
            .interpolation(.high)
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(.rect(cornerRadius: size * 0.18))
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.18)
                    .stroke(outcome.color.opacity(0.48), lineWidth: 0.8)
            }
            .shadow(color: outcome.color.opacity(0.22), radius: 4)
            .accessibilityLabel(outcome.label)
    }
}
