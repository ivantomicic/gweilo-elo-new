import AVFoundation
import SwiftUI
import UIKit

struct GweiloLoadingView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @ScaledMetric(relativeTo: .body) private var defaultSize = 132.0

    private let label: String
    private let requestedSize: CGFloat?

    init(_ label: String = "Loading", size: CGFloat? = nil) {
        self.label = label
        requestedSize = size
    }

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Image("GweiloLoaderPoster")
                    .resizable()
                    .aspectRatio(contentMode: .fit)

                if !reduceMotion {
                    LoopingLoaderVideo(isPlaying: scenePhase == .active)
                }
            }
            .frame(width: loaderSize, height: loaderSize)

            Text(label)
                .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(GweiloTheme.muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private var loaderSize: CGFloat {
        requestedSize ?? min(defaultSize, 168)
    }
}

private struct LoopingLoaderVideo: UIViewRepresentable {
    let isPlaying: Bool

    func makeUIView(context: Context) -> LoopingPlayerView {
        LoopingPlayerView()
    }

    func updateUIView(_ view: LoopingPlayerView, context: Context) {
        view.setPlaying(isPlaying)
    }

    static func dismantleUIView(
        _ view: LoopingPlayerView,
        coordinator: Void
    ) {
        view.stop()
    }
}

private final class LoopingPlayerView: UIView {
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?

    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        configurePlayer()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func setPlaying(_ isPlaying: Bool) {
        if isPlaying {
            player.play()
        } else {
            player.pause()
        }
    }

    func stop() {
        player.pause()
        player.removeAllItems()
        looper = nil
    }

    private func configurePlayer() {
        backgroundColor = .clear

        let playerLayer = layer as? AVPlayerLayer
        playerLayer?.player = player
        playerLayer?.videoGravity = .resizeAspect
        playerLayer?.backgroundColor = UIColor.clear.cgColor

        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false

        guard let url = Bundle.main.url(
            forResource: "GweiloLoader",
            withExtension: "mp4"
        ) else {
            return
        }

        let item = AVPlayerItem(url: url)
        looper = AVPlayerLooper(player: player, templateItem: item)
    }
}
