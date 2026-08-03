import SwiftUI
import UIKit

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
    static let rankGold = Color(red: 0.88, green: 0.66, blue: 0.22)
    static let rankSilver = Color(red: 0.68, green: 0.72, blue: 0.78)
    static let rankBronze = Color(red: 0.72, green: 0.38, blue: 0.20)
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

    static func headingFont(
        size: CGFloat,
        relativeTo textStyle: Font.TextStyle
    ) -> Font {
        .custom(
            "AvenirNextCondensed-Bold",
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

struct RankPlacementBadge: View {
    let rank: Int

    @ViewBuilder
    var body: some View {
        switch rank {
        case 1:
            placementBadge(named: "RankGold")
        case 2:
            placementBadge(named: "RankSilver")
        case 3:
            placementBadge(named: "RankBronze")
        default:
            EmptyView()
        }
    }

    private func placementBadge(named assetName: String) -> some View {
        Image(assetName)
            .resizable()
            .scaledToFit()
            .frame(width: 17, height: 17)
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

enum GweiloCardStyle {
    case accent
    case live
    case neutral
    case tinted(Color)

    fileprivate var baseColor: Color {
        switch self {
        case .accent:
            GweiloTheme.raisedSurface
        case .live:
            GweiloTheme.raisedSurface
        case .neutral:
            Color(red: 0.075, green: 0.074, blue: 0.082)
        case .tinted:
            GweiloTheme.raisedSurface
        }
    }

    fileprivate var gradientColors: [Color] {
        switch self {
        case .accent:
            [
                GweiloTheme.accent.opacity(0.30),
                GweiloTheme.accent.opacity(0.12)
            ]
        case .live:
            [
                GweiloTheme.lime.opacity(0.11),
                GweiloTheme.lime.opacity(0.025)
            ]
        case .neutral:
            [
                Color.white.opacity(0.045),
                Color.white.opacity(0.012)
            ]
        case let .tinted(color):
            [
                color.opacity(0.18),
                color.opacity(0.055)
            ]
        }
    }

    fileprivate var borderOpacity: Double {
        switch self {
        case .accent: 0.11
        case .live: 0.10
        case .neutral: 0.08
        case .tinted: 0.10
        }
    }
}

struct GweiloCard<Content: View>: View {
    let style: GweiloCardStyle
    let minHeight: CGFloat?
    let contentPadding: CGFloat
    @ViewBuilder let content: Content

    init(
        style: GweiloCardStyle = .neutral,
        minHeight: CGFloat? = nil,
        contentPadding: CGFloat = 14,
        @ViewBuilder content: () -> Content
    ) {
        self.style = style
        self.minHeight = minHeight
        self.contentPadding = contentPadding
        self.content = content()
    }

    var body: some View {
        content
            .padding(contentPadding)
            .frame(
                maxWidth: .infinity,
                minHeight: minHeight,
                alignment: .topLeading
            )
            .background {
                GweiloCardSurface(style: style)
            }
    }
}

struct GweiloCardCarousel<Content: View>: View {
    @State private var settledIndex = 0
    @State private var candidateIndex = 0
    @State private var scrollPhase = ScrollPhase.idle

    let itemCount: Int
    @ViewBuilder let content: Content

    init(
        itemCount: Int,
        @ViewBuilder content: () -> Content
    ) {
        self.itemCount = itemCount
        self.content = content()
    }

    private var canScrollLeft: Bool {
        itemCount > 1 && settledIndex > 0
    }

    private var canScrollRight: Bool {
        itemCount > 1 && settledIndex < itemCount - 1
    }

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: 12) {
                content
            }
            .scrollTargetLayout()
            .background(FastScrollDecelerationConfigurator())
        }
        .contentMargins(.horizontal, 20, for: .scrollContent)
        .defaultScrollAnchor(.leading)
        .scrollTargetBehavior(
            CenteredViewAlignedScrollTargetBehavior(itemCount: itemCount)
        )
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .onScrollTargetVisibilityChange(
            idType: Int.self,
            threshold: 0.80
        ) { visibleIDs in
            guard let visibleIndex = visibleIDs.first else { return }

            if candidateIndex != visibleIndex {
                candidateIndex = visibleIndex
            }

            if scrollPhase == .idle,
               settledIndex != visibleIndex {
                settledIndex = visibleIndex
            }
        }
        .onScrollPhaseChange { _, newPhase in
            scrollPhase = newPhase

            if newPhase == .idle,
               settledIndex != candidateIndex {
                settledIndex = candidateIndex
            }
        }
        .mask {
            LinearGradient(
                stops: [
                    .init(
                        color: canScrollLeft ? .clear : .black,
                        location: 0
                    ),
                    .init(color: .black, location: 0.11),
                    .init(color: .black, location: 0.89),
                    .init(
                        color: canScrollRight ? .clear : .black,
                        location: 1
                    )
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        }
        .padding(.horizontal, -20)
    }
}

private struct FastScrollDecelerationConfigurator: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        configureNearestScrollView(from: view)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        configureNearestScrollView(from: uiView)
    }

    private func configureNearestScrollView(from view: UIView) {
        DispatchQueue.main.async { [weak view] in
            var ancestor = view?.superview

            while let currentView = ancestor {
                if let scrollView = currentView as? UIScrollView {
                    scrollView.decelerationRate = .fast
                    return
                }

                ancestor = currentView.superview
            }
        }
    }
}

private struct CenteredViewAlignedScrollTargetBehavior: ScrollTargetBehavior {
    let itemCount: Int

    private let baseBehavior = ViewAlignedScrollTargetBehavior(
        limitBehavior: .always
    )

    func updateTarget(
        _ target: inout ScrollTarget,
        context: TargetContext
    ) {
        baseBehavior.updateTarget(&target, context: context)
        let cardWidth = min(
            context.containerSize.width * 0.72,
            272
        )
        let cardStride = cardWidth + 12
        let selectedIndex = Int(
            (target.rect.minX / cardStride).rounded()
        )

        guard selectedIndex > 0,
              selectedIndex < itemCount - 1 else {
            target.anchor = .topLeading
            return
        }

        let centeringInset = max(
            (context.containerSize.width - cardWidth) / 2,
            0
        )

        target.rect.origin.x -= centeringInset
        target.anchor = .topLeading
    }
}

private struct GweiloCardSurface: View {
    let style: GweiloCardStyle
    private let shape = RoundedRectangle(cornerRadius: 20)

    var body: some View {
        shape
            .fill(style.baseColor)
            .overlay {
                shape.fill(
                    LinearGradient(
                        colors: style.gradientColors,
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
            .overlay {
                shape.stroke(
                    Color.white.opacity(style.borderOpacity),
                    lineWidth: 0.8
                )
            }
            .shadow(
                color: Color.black.opacity(0.28),
                radius: 10,
                y: 6
            )
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

struct AdaptiveSurfaceModifier<SurfaceShape: Shape>: ViewModifier {
    let shape: SurfaceShape
    let interactive: Bool
    let tint: Color?

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if let tint {
                content
                    .glassEffect(
                        interactive
                            ? .regular.tint(tint).interactive()
                            : .regular.tint(tint),
                        in: shape
                    )
            } else {
                content
                    .glassEffect(
                        interactive ? .regular.interactive() : .regular,
                        in: shape
                    )
            }
        } else {
            if let tint {
                content
                    .background {
                        shape
                            .fill(.ultraThinMaterial)
                            .overlay {
                                shape.fill(tint.opacity(0.28))
                            }
                    }
                    .overlay {
                        shape.stroke(tint.opacity(0.58), lineWidth: 0.8)
                    }
            } else {
                content
                    .background(
                        GweiloTheme.raisedSurface,
                        in: shape
                    )
                    .overlay {
                        shape
                            .stroke(GweiloTheme.hairline)
                    }
            }
        }
    }
}

struct FloatingTabBarAccessoryModifier<Accessory: View>: ViewModifier {
    let isPresented: Bool
    let accessory: Accessory

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if isPresented {
                    accessory
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                }
            }
    }
}

struct GweiloPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    var keepsColorWhenDisabled = false
    var height: CGFloat = 56

    func makeBody(configuration: Configuration) -> some View {
        let usesProminentColors = isEnabled || keepsColorWhenDisabled

        configuration.label
            .font(.headline.weight(.bold))
            .foregroundStyle(
                usesProminentColors
                    ? GweiloTheme.background
                    : GweiloTheme.muted
            )
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                usesProminentColors
                    ? GweiloTheme.lime
                    : GweiloTheme.raisedSurface,
                in: .capsule
            )
            .opacity(
                configuration.isPressed
                    ? 0.82
                    : (isEnabled || !keepsColorWhenDisabled ? 1 : 0.72)
            )
            .scaleEffect(configuration.isPressed ? 0.965 : 1)
            .animation(
                .smooth(duration: 0.12),
                value: configuration.isPressed
            )
            .sensoryFeedback(
                .impact(weight: .light, intensity: 0.65),
                trigger: configuration.isPressed
            ) { wasPressed, isPressed in
                !wasPressed && isPressed
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
        interactive: Bool = false,
        tint: Color? = nil
    ) -> some View {
        modifier(
            AdaptiveSurfaceModifier(
                shape: RoundedRectangle(cornerRadius: cornerRadius),
                interactive: interactive,
                tint: tint
            )
        )
    }

    func adaptiveSurface<SurfaceShape: Shape>(
        in shape: SurfaceShape,
        interactive: Bool = false,
        tint: Color? = nil
    ) -> some View {
        modifier(
            AdaptiveSurfaceModifier(
                shape: shape,
                interactive: interactive,
                tint: tint
            )
        )
    }

    func floatingTabBarAccessory<Accessory: View>(
        isPresented: Bool = true,
        @ViewBuilder accessory: () -> Accessory
    ) -> some View {
        modifier(
            FloatingTabBarAccessoryModifier(
                isPresented: isPresented,
                accessory: accessory()
            )
        )
    }
}
