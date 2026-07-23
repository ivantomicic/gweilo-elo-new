import SwiftUI

enum GweiloTheme {
    static let accent = Color(red: 0.40, green: 0.22, blue: 0.96)
    static let cyan = Color(red: 0.10, green: 0.72, blue: 0.88)
    static let coral = Color(red: 0.94, green: 0.25, blue: 0.31)
    static let lime = Color(red: 0.45, green: 0.78, blue: 0.18)

    static func background(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark
            ? Color(red: 0.025, green: 0.025, blue: 0.032)
            : Color(red: 0.975, green: 0.975, blue: 0.98)
    }

    static func surface(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark
            ? .white.opacity(0.055)
            : .black.opacity(0.035)
    }

    static func hairline(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark
            ? .white.opacity(0.14)
            : .black.opacity(0.12)
    }
}

struct ArenaBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GweiloTheme.background(for: colorScheme)
            .ignoresSafeArea()
    }
}

struct FlatSurfaceModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(
                GweiloTheme.surface(for: colorScheme),
                in: .rect(cornerRadius: cornerRadius)
            )
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(GweiloTheme.hairline(for: colorScheme), lineWidth: 0.75)
            }
    }
}

struct AdaptiveSurfaceModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let cornerRadius: CGFloat
    let interactive: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    interactive ? .regular.interactive() : .regular,
                    in: .rect(cornerRadius: cornerRadius)
                )
        } else {
            content
                .background(
                    GweiloTheme.surface(for: colorScheme),
                    in: .rect(cornerRadius: cornerRadius)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(.white.opacity(colorScheme == .dark ? 0.10 : 0.70))
                }
        }
    }
}

extension View {
    func flatSurface(cornerRadius: CGFloat = 16) -> some View {
        modifier(FlatSurfaceModifier(cornerRadius: cornerRadius))
    }

    func adaptiveSurface(
        cornerRadius: CGFloat = 24,
        interactive: Bool = false
    ) -> some View {
        modifier(
            AdaptiveSurfaceModifier(
                cornerRadius: cornerRadius,
                interactive: interactive
            )
        )
    }
}
