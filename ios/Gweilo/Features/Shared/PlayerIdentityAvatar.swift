import Foundation
import ImageIO
import SwiftUI
import UIKit

private final class SendableAvatarImage: @unchecked Sendable {
    nonisolated let image: UIImage

    nonisolated init(_ image: UIImage) {
        self.image = image
    }
}

private actor AvatarImagePipeline {
    static let shared = AvatarImagePipeline()

    private let cache: NSCache<NSString, SendableAvatarImage> = {
        let cache = NSCache<NSString, SendableAvatarImage>()
        cache.countLimit = 150
        cache.totalCostLimit = 24 * 1_024 * 1_024
        return cache
    }()
    private var requests: [String: Task<SendableAvatarImage?, Never>] = [:]

    func image(url: URL, pixelSize: Int) async -> SendableAvatarImage? {
        let key = "\(url.absoluteString)#\(pixelSize)"
        if let cached = cache.object(forKey: key as NSString) {
            return cached
        }
        if let request = requests[key] {
            return await request.value
        }

        let request = Task<SendableAvatarImage?, Never> {
            guard let (data, response) = try? await URLSession.shared.data(
                from: url
            ),
            let httpResponse = response as? HTTPURLResponse,
            (200..<300).contains(httpResponse.statusCode),
            let source = CGImageSourceCreateWithData(
                data as CFData,
                nil
            ),
            let image = CGImageSourceCreateThumbnailAtIndex(
                source,
                0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceThumbnailMaxPixelSize: pixelSize,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceShouldCacheImmediately: true
                ] as CFDictionary
            ) else {
                return nil
            }
            return SendableAvatarImage(UIImage(cgImage: image))
        }
        requests[key] = request
        let result = await request.value
        requests[key] = nil
        if let result {
            let cost = result.image.cgImage.map {
                $0.bytesPerRow * $0.height
            } ?? pixelSize * pixelSize * 4
            cache.setObject(result, forKey: key as NSString, cost: cost)
        }
        return result
    }
}

struct CachedRemoteImage<Content: View, Placeholder: View>: View {
    let url: URL?
    let pointSize: CGFloat
    let content: (Image) -> Content
    let placeholder: () -> Placeholder
    @State private var loadedImage: SendableAvatarImage?

    init(
        url: URL?,
        pointSize: CGFloat,
        @ViewBuilder content: @escaping (Image) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.pointSize = pointSize
        self.content = content
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let loadedImage {
                content(Image(uiImage: loadedImage.image))
            } else {
                placeholder()
            }
        }
        .task(id: "\(url?.absoluteString ?? "")#\(pointSize)") {
            guard let url else {
                loadedImage = nil
                return
            }
            loadedImage = nil
            let image = await AvatarImagePipeline.shared.image(
                url: url,
                pixelSize: max(
                    64,
                    Int((pointSize * UIScreen.main.scale).rounded(.up))
                )
            )
            guard !Task.isCancelled else { return }
            loadedImage = image
        }
    }
}

enum DiceBearAvatar {
    private static let endpoint =
        "https://api.dicebear.com/10.x/waves/png"

    static func resolvedURL(customURL: URL?, seed: String) -> URL? {
        customURL ?? generatedURL(seed: seed)
    }

    static func generatedURL(seed: String) -> URL? {
        let trimmedSeed = seed.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !trimmedSeed.isEmpty,
              var components = URLComponents(string: endpoint) else {
            return nil
        }

        components.queryItems = [
            URLQueryItem(name: "seed", value: trimmedSeed)
        ]
        return components.url
    }
}

struct PlayerIdentityAvatar: View {
    let name: String
    let initials: String
    let avatarURL: URL?
    let size: CGFloat
    var showsBorder = true
    var softlyFadesAtEdge = false
    @State private var loadedAvatar: SendableAvatarImage?

    private var resolvedAvatarURL: URL? {
        DiceBearAvatar.resolvedURL(customURL: avatarURL, seed: name)
    }

    var body: some View {
        Group {
            if let loadedAvatar {
                Image(uiImage: loadedAvatar.image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initials)
                    .font(GweiloTheme.displayFont(
                        size: size * 0.32,
                        relativeTo: .body
                    ))
                    .foregroundStyle(GweiloTheme.bone)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(GweiloTheme.raisedSurface)
            }
        }
        .frame(width: size, height: size)
        .mask {
            if softlyFadesAtEdge {
                RadialGradient(
                    stops: [
                        .init(color: .white, location: 0),
                        .init(color: .white, location: 0.76),
                        .init(
                            color: .white.opacity(0.9),
                            location: 0.86
                        ),
                        .init(color: .clear, location: 1)
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: size / 2
                )
            } else {
                Circle()
            }
        }
        .overlay {
            if showsBorder {
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [
                                GweiloTheme.accent.opacity(0.65),
                                GweiloTheme.hairline
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.9
                    )
            }
        }
        .accessibilityLabel(name)
        .task(id: "\(resolvedAvatarURL?.absoluteString ?? "")#\(size)") {
            guard let resolvedAvatarURL else {
                loadedAvatar = nil
                return
            }
            loadedAvatar = nil
            let scale = UIScreen.main.scale
            let image = await AvatarImagePipeline.shared.image(
                url: resolvedAvatarURL,
                pixelSize: max(64, Int((size * scale).rounded(.up)))
            )
            guard !Task.isCancelled else { return }
            loadedAvatar = image
        }
    }
}
