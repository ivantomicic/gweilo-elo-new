import SwiftUI

enum GweiloTheme {
    static let background = Color(red: 0.012, green: 0.012, blue: 0.016)
    static let surface = Color(red: 0.055, green: 0.052, blue: 0.072)
    static let raisedSurface = Color(red: 0.078, green: 0.072, blue: 0.105)
    static let accent = Color(red: 0.47, green: 0.19, blue: 1.00)
    static let accentBright = Color(red: 0.61, green: 0.38, blue: 1.00)
    static let lime = Color(red: 0.76, green: 1.00, blue: 0.12)
    static let coral = Color(red: 1.00, green: 0.27, blue: 0.36)
    static let amber = Color(red: 1.00, green: 0.70, blue: 0.10)
    static let cyan = Color(red: 0.10, green: 0.78, blue: 0.88)
    static let bone = Color(red: 0.96, green: 0.95, blue: 0.91)
    static let muted = Color(red: 0.58, green: 0.57, blue: 0.63)
    static let hairline = Color.white.opacity(0.13)

    static func background(for _: ColorScheme) -> Color {
        background
    }

    static func surface(for _: ColorScheme) -> Color {
        surface
    }

    static func hairline(for _: ColorScheme) -> Color {
        hairline
    }

    static func displayFont(
        size: CGFloat,
        relativeTo textStyle: Font.TextStyle
    ) -> Font {
        .custom(
            "AvenirNextCondensed-Heavy",
            size: size,
            relativeTo: textStyle
        )
    }

    static func labelFont(
        size: CGFloat,
        relativeTo textStyle: Font.TextStyle
    ) -> Font {
        .custom(
            "AvenirNextCondensed-DemiBold",
            size: size,
            relativeTo: textStyle
        )
    }
}

struct ArenaBackground: View {
    var body: some View {
        ZStack {
            GweiloTheme.background

            RadialGradient(
                colors: [
                    GweiloTheme.accent.opacity(0.16),
                    GweiloTheme.accent.opacity(0.035),
                    .clear
                ],
                center: .topTrailing,
                startRadius: 0,
                endRadius: 430
            )
        }
        .ignoresSafeArea()
    }
}

struct FlatSurfaceModifier: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(
                GweiloTheme.surface,
                in: .rect(cornerRadius: cornerRadius)
            )
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(
                        LinearGradient(
                            colors: [
                                GweiloTheme.accent.opacity(0.32),
                                GweiloTheme.hairline,
                                GweiloTheme.lime.opacity(0.10)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.8
                    )
            }
    }
}

struct AdaptiveSurfaceModifier: ViewModifier {
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
                    GweiloTheme.raisedSurface,
                    in: .rect(cornerRadius: cornerRadius)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(GweiloTheme.hairline)
                }
        }
    }
}

struct PhantomMark: View {
    let size: CGFloat
    var showsGlow = true

    var body: some View {
        Canvas { context, canvasSize in
            let scale = min(canvasSize.width, canvasSize.height)

            var lowerTrail = Path()
            lowerTrail.move(to: CGPoint(x: scale * 0.02, y: scale * 0.83))
            lowerTrail.addLine(to: CGPoint(x: scale * 0.73, y: scale * 0.51))
            lowerTrail.addLine(to: CGPoint(x: scale * 0.35, y: scale * 0.88))
            lowerTrail.closeSubpath()
            context.fill(lowerTrail, with: .color(GweiloTheme.accent))

            var signalTrail = Path()
            signalTrail.move(to: CGPoint(x: scale * 0.23, y: scale * 0.86))
            signalTrail.addLine(to: CGPoint(x: scale * 0.77, y: scale * 0.55))
            signalTrail.addLine(to: CGPoint(x: scale * 0.52, y: scale * 0.84))
            signalTrail.closeSubpath()
            context.fill(signalTrail, with: .color(GweiloTheme.lime))

            let head = Path(
                ellipseIn: CGRect(
                    x: scale * 0.29,
                    y: scale * 0.08,
                    width: scale * 0.62,
                    height: scale * 0.62
                )
            )
            context.fill(head, with: .color(GweiloTheme.bone))

            var leftEye = Path()
            leftEye.move(to: CGPoint(x: scale * 0.40, y: scale * 0.40))
            leftEye.addLine(to: CGPoint(x: scale * 0.58, y: scale * 0.45))
            leftEye.addLine(to: CGPoint(x: scale * 0.43, y: scale * 0.51))
            leftEye.closeSubpath()
            context.fill(leftEye, with: .color(GweiloTheme.background))

            var rightEye = Path()
            rightEye.move(to: CGPoint(x: scale * 0.64, y: scale * 0.45))
            rightEye.addLine(to: CGPoint(x: scale * 0.83, y: scale * 0.36))
            rightEye.addLine(to: CGPoint(x: scale * 0.78, y: scale * 0.50))
            rightEye.closeSubpath()
            context.fill(rightEye, with: .color(GweiloTheme.background))
        }
        .frame(width: size, height: size)
        .shadow(
            color: showsGlow ? GweiloTheme.accent.opacity(0.55) : .clear,
            radius: size * 0.16
        )
        .accessibilityHidden(true)
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
