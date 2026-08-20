import AVFoundation
import SwiftUI
import UIKit

struct OneShotBundleVideo: UIViewRepresentable {
    let resourceName: String
    let resourceExtension: String
    let isPlaying: Bool
    var playbackRate: Float = 1
    var onProgress: (Double) -> Void = { _ in }
    var videoGravity: AVLayerVideoGravity = .resizeAspect

    func makeUIView(context: Context) -> OneShotBundlePlayerView {
        let view = OneShotBundlePlayerView()
        view.setProgressHandler(onProgress)
        view.configure(
            resourceName: resourceName,
            resourceExtension: resourceExtension,
            playbackRate: playbackRate,
            videoGravity: videoGravity
        )
        return view
    }

    func updateUIView(
        _ view: OneShotBundlePlayerView,
        context: Context
    ) {
        view.setProgressHandler(onProgress)
        view.configure(
            resourceName: resourceName,
            resourceExtension: resourceExtension,
            playbackRate: playbackRate,
            videoGravity: videoGravity
        )
        view.setPlaying(isPlaying)
    }

    static func dismantleUIView(
        _ view: OneShotBundlePlayerView,
        coordinator: Void
    ) {
        view.stop()
    }
}

final class OneShotBundlePlayerView: UIView {
    private let player = AVPlayer()
    private var configuredResourceKey: String?
    private var progressObserver: Any?
    private var progressHandler: ((Double) -> Void)?
    private var lastReportedProgress = -1.0
    private var playbackRate: Float = 1

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
        player.actionAtItemEnd = .pause
        player.preventsDisplaySleepDuringVideoPlayback = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func setProgressHandler(
        _ progressHandler: @escaping (Double) -> Void
    ) {
        self.progressHandler = progressHandler
        installProgressObserverIfNeeded()
    }

    func configure(
        resourceName: String,
        resourceExtension: String,
        playbackRate: Float,
        videoGravity: AVLayerVideoGravity
    ) {
        (layer as? AVPlayerLayer)?.videoGravity = videoGravity

        let resolvedPlaybackRate = max(playbackRate, 0.1)
        if self.playbackRate != resolvedPlaybackRate {
            self.playbackRate = resolvedPlaybackRate
            if player.rate > 0 {
                player.rate = resolvedPlaybackRate
            }
        }

        let resourceKey = "\(resourceName).\(resourceExtension)"
        guard configuredResourceKey != resourceKey else { return }
        configuredResourceKey = resourceKey

        player.pause()
        lastReportedProgress = -1
        progressHandler?(0)

        guard let url = Bundle.main.url(
            forResource: resourceName,
            withExtension: resourceExtension
        ) else {
            player.replaceCurrentItem(with: nil)
            return
        }

        player.replaceCurrentItem(with: AVPlayerItem(url: url))
    }

    func setPlaying(_ isPlaying: Bool) {
        if isPlaying {
            guard
                player.rate == 0
                    || abs(player.rate - playbackRate) > 0.001
            else {
                return
            }
            player.playImmediately(atRate: playbackRate)
        } else {
            player.pause()
        }
    }

    func stop() {
        configuredResourceKey = nil
        player.pause()
        player.replaceCurrentItem(with: nil)
        removeProgressObserver()
        progressHandler = nil
    }

    private func installProgressObserverIfNeeded() {
        guard progressObserver == nil else { return }

        let interval = CMTime(seconds: 1.0 / 12.0, preferredTimescale: 600)
        progressObserver = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        ) { [weak self] currentTime in
            MainActor.assumeIsolated {
                self?.reportProgress(currentTime)
            }
        }
    }

    private func reportProgress(_ currentTime: CMTime) {
        guard
            let duration = player.currentItem?.duration.seconds,
            duration.isFinite,
            duration > 0
        else {
            return
        }

        let progress = min(max(currentTime.seconds / duration, 0), 1)
        guard
            abs(progress - lastReportedProgress) >= 0.012
                || progress == 1
        else {
            return
        }

        lastReportedProgress = progress
        progressHandler?(progress)
    }

    private func removeProgressObserver() {
        guard let progressObserver else { return }
        player.removeTimeObserver(progressObserver)
        self.progressObserver = nil
    }
}
