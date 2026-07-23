import SwiftUI

struct ComingSoonView: View {
    let title: String
    let subtitle: String
    let symbol: String

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                VStack(spacing: 18) {
                    Image(systemName: symbol)
                        .font(.system(size: 44, weight: .bold))
                        .foregroundStyle(GweiloTheme.accent)

                    Text(title)
                        .font(.largeTitle.weight(.bold))

                    Text(subtitle)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                }
                .padding(28)
                .flatSurface(cornerRadius: 16)
                .padding()
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
    }
}
