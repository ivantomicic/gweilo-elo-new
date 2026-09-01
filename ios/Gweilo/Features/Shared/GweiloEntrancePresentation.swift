import SwiftUI

enum GweiloEntranceMotion {
    static let section = Animation.timingCurve(0.22, 0.61, 0.36, 1, duration: 0.48)
    static let number = Animation.timingCurve(0.22, 0.61, 0.36, 1, duration: 0.65)
}

/// Real text owns the layout and accessibility; only the overlaid digits roll.
struct GweiloEntranceNumber: View {
    let value: Int
    let revealed: Bool
    let suppressesMotion: Bool
    var locale: Locale = .current

    var body: some View {
        let displayedValue = revealed ? value : 0
        Text(value, format: .number.locale(locale))
            .hidden()
            .overlay {
                Text(displayedValue, format: .number.locale(locale))
                    .contentTransition(.numericText(value: Double(displayedValue)))
                    .animation(suppressesMotion ? nil : GweiloEntranceMotion.number, value: revealed)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(value.formatted(.number.locale(locale)))
    }
}
