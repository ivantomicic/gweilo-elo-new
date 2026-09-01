import SwiftUI

private enum GweiloLoadingQuote {
    private static let fallback = "Less talking, more ping-pong."

    static let all: [String] = {
        guard
            let url = Bundle.main.url(
                forResource: "loading-quotes",
                withExtension: "json"
            ),
            let data = try? Data(contentsOf: url),
            let quotes = try? JSONDecoder().decode([String].self, from: data),
            !quotes.isEmpty
        else {
            return [fallback]
        }

        return quotes
    }()

    static func random() -> String {
        all.randomElement() ?? fallback
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
        _ label: String = "Učitavam…",
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

    init(_ label: String = "Učitavam…", size: CGFloat? = nil) {
        self.label = label
        self.size = size
    }

    var body: some View {
        GweiloLoadingView(label, size: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
