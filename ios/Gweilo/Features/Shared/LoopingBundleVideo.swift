import AVFoundation
import SwiftUI
import UIKit

private struct ActiveAppTabEnvironmentKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var isActiveAppTab: Bool {
        get { self[ActiveAppTabEnvironmentKey.self] }
        set { self[ActiveAppTabEnvironmentKey.self] = newValue }
    }
}

struct LoopingBundleVideo: UIViewRepresentable {
    let resourceName: String
    let isPlaying: Bool
    var videoGravity: AVLayerVideoGravity = .resizeAspect

    func makeUIView(context: Context) -> LoopingBundlePlayerView {
        let view = LoopingBundlePlayerView()
        view.configure(
            resourceName: resourceName,
            videoGravity: videoGravity
        )
        return view
    }

    func updateUIView(
        _ view: LoopingBundlePlayerView,
        context: Context
    ) {
        view.configure(
            resourceName: resourceName,
            videoGravity: videoGravity
        )
        view.setPlaying(isPlaying)
    }

    static func dismantleUIView(
        _ view: LoopingBundlePlayerView,
        coordinator: Void
    ) {
        view.stop()
    }
}

final class LoopingBundlePlayerView: UIView {
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var configuredResourceName: String?
    private var isCurrentlyPlaying = false

    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear

        let playerLayer = layer as? AVPlayerLayer
        playerLayer?.player = player
        playerLayer?.backgroundColor = UIColor.clear.cgColor

        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func configure(
        resourceName: String,
        videoGravity: AVLayerVideoGravity
    ) {
        (layer as? AVPlayerLayer)?.videoGravity = videoGravity

        guard configuredResourceName != resourceName else { return }
        configuredResourceName = resourceName
        player.pause()
        player.removeAllItems()
        looper = nil

        guard let url = Bundle.main.url(
            forResource: resourceName,
            withExtension: "mp4"
        ) else {
            return
        }

        let item = AVPlayerItem(url: url)
        looper = AVPlayerLooper(player: player, templateItem: item)
    }

    func setPlaying(_ isPlaying: Bool) {
        guard isCurrentlyPlaying != isPlaying else { return }
        isCurrentlyPlaying = isPlaying

        if isPlaying {
            player.play()
        } else {
            player.pause()
        }
    }

    func stop() {
        configuredResourceName = nil
        isCurrentlyPlaying = false
        player.pause()
        player.removeAllItems()
        looper = nil
    }
}
