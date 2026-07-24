import SwiftUI

struct PlayerIdentityAvatar: View {
    let name: String
    let initials: String
    let avatarURL: URL?
    let size: CGFloat

    var body: some View {
        AsyncImage(url: avatarURL, transaction: Transaction(animation: nil)) { phase in
            switch phase {
            case let .success(image):
                image
                    .resizable()
                    .scaledToFill()
            default:
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
        .clipShape(.circle)
        .overlay {
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
        .accessibilityLabel(name)
    }
}
