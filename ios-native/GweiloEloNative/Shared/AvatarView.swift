import SwiftUI

struct AvatarView: View {
  let url: URL?
  let fallback: String

  var body: some View {
    ZStack {
      Circle().fill(Color.white.opacity(0.08))
      if let url {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          Color.black.opacity(0.35)
        }
        .clipShape(Circle())
      } else {
        Text(String(fallback.prefix(1)).uppercased())
          .font(.headline)
          .foregroundStyle(.white)
      }
    }
  }
}
