import SwiftUI

private enum GweiloLoadingQuote {
    static let all = [
        "Ping-pong—or, as the Chinese call it, ping-pong.",
        "Less talking, more ping-pong.",
        "What didn’t you understand about “sudden death”?",
        "Farewell, ladies, gentlemen, and athletes.",
        "Who told you to grab the cricket from my hand?",
        "Don’t hit flies—hit bees!",
        "I’m the Boggle master!",
        "Stop—this is boring. Eliminate them both.",
        "Welcome to ping-pong’s dangerous underworld.",
        "Defeat is so close, it smells like your cheap cologne."
    ]

    static func random() -> String {
        all.randomElement() ?? "Less talking, more ping-pong."
    }
}

struct GweiloLoadingView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @ScaledMetric(relativeTo: .body) private var defaultSize = 132.0
    @State private var quote = GweiloLoadingQuote.random()

    private let label: String
    private let requestedSize: CGFloat?
    private let showsLabel: Bool

    init(
        _ label: String = "Loading",
        size: CGFloat? = nil,
        showsLabel: Bool = true
    ) {
        self.label = label
        requestedSize = size
        self.showsLabel = showsLabel
    }

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Image("GweiloLoaderPoster")
                    .resizable()
                    .aspectRatio(contentMode: .fit)

                if !reduceMotion {
                    LoopingBundleVideo(
                        resourceName: "GweiloLoader",
                        isPlaying: scenePhase == .active
                    )
                }
            }
            .frame(width: loaderSize, height: loaderSize)

            if showsLabel {
                Text(quote)
                    .font(.subheadline.weight(.medium))
                    .italic()
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
                    .frame(maxWidth: 320)
                    .padding(.horizontal, 20)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private var loaderSize: CGFloat {
        requestedSize ?? min(defaultSize, 168)
    }
}

struct GweiloFullScreenLoadingView: View {
    private let label: String
    private let size: CGFloat?

    init(_ label: String = "Loading", size: CGFloat? = nil) {
        self.label = label
        self.size = size
    }

    var body: some View {
        GweiloLoadingView(label, size: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
