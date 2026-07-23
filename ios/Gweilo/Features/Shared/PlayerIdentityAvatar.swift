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
                    .font(.system(size: size * 0.29, weight: .bold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.primary.opacity(0.07))
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .overlay {
            Circle()
                .stroke(Color.primary.opacity(0.10), lineWidth: 0.75)
        }
        .accessibilityLabel(name)
    }
}
