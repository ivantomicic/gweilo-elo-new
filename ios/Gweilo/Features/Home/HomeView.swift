import SwiftUI

struct HomeView: View {
    @State private var showsScoring = false

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 30) {
                        HomeHeader()
                        LiveSessionFeature(action: openScoring)
                        CompactStandings(players: Array(DemoPlayer.leaderboard.prefix(4)))
                        LatestResult()
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .fullScreenCover(isPresented: $showsScoring) {
                ScoreEntryView()
            }
        }
    }

    private func openScoring() {
        showsScoring = true
    }
}

private struct HomeHeader: View {
    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text("GWEILO / BELGRADE")
                    .font(.caption2.weight(.bold))
                    .tracking(1.5)
                    .foregroundStyle(GweiloTheme.accent)

                Text("Thursday")
                    .font(.largeTitle.weight(.bold))
                    .tracking(-0.7)
            }

            Spacer()

            PlayerAvatar(player: .ivan, size: 42)
        }
        .padding(.top, 18)
    }
}

private struct LiveSessionFeature: View {
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                Label("ACTIVE SESSION", systemImage: "circle.fill")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)

                Spacer()

                Text("6 PLAYERS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.72))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Current round")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.68))

                Text("Round 5 of 7")
                    .font(.title.weight(.bold))

                Text("1 doubles · 1 singles")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.76))
            }

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("MATCHES IN THIS ROUND")
                        .font(.caption2.weight(.bold))
                        .tracking(1)
                        .foregroundStyle(.white.opacity(0.58))
                    Text("All six players active")
                        .font(.subheadline.weight(.bold))
                }

                Spacer()

                Button("Score match", systemImage: "arrow.up.right", action: action)
                    .font(.subheadline.weight(.bold))
                    .buttonStyle(.borderedProminent)
                    .tint(.white)
                    .foregroundStyle(GweiloTheme.accent)
                    .controlSize(.large)
            }
        }
        .foregroundStyle(.white)
        .padding(22)
        .background(
            LinearGradient(
                colors: [GweiloTheme.accent, Color(red: 0.24, green: 0.10, blue: 0.68)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: .rect(cornerRadius: 18)
        )
        .accessibilityElement(children: .contain)
    }
}

private struct CompactStandings: View {
    let players: [DemoPlayer]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "Current ranking", actionTitle: "See all")

            VStack(spacing: 0) {
                ForEach(Array(players.enumerated()), id: \.element.id) { index, player in
                    StandingRow(rank: index + 1, player: player)

                    if player.id != players.last?.id {
                        Divider()
                    }
                }
            }
        }
    }
}

private struct StandingRow: View {
    let rank: Int
    let player: DemoPlayer

    var body: some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(rank == 1 ? GweiloTheme.accent : .secondary)
                .frame(width: 18, alignment: .leading)

            PlayerAvatar(player: player, size: 34)

            Text(player.name)
                .font(.body.weight(.semibold))

            Spacer()

            Text("\(player.elo)")
                .font(.body.monospacedDigit().weight(.bold))

            MovementLabel(value: player.movement)
                .frame(width: 42, alignment: .trailing)
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Rank \(rank), \(player.name), \(player.elo) Elo, change \(player.movement)"
        )
    }
}

private struct LatestResult: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "Latest result")

            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Ivan + Luka")
                        .font(.headline)
                    Text("Round 3 · 12 min ago")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text("3")
                    .foregroundStyle(GweiloTheme.accent)
                Text("—")
                    .foregroundStyle(.tertiary)
                Text("1")
            }
            .font(.title.weight(.bold))
            .padding(.vertical, 4)
        }
    }
}

struct SectionHeading: View {
    let title: String
    var actionTitle: String?

    var body: some View {
        HStack {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .tracking(1.3)
                .foregroundStyle(.secondary)

            Spacer()

            if let actionTitle {
                Button(actionTitle) {}
                    .font(.caption.weight(.bold))
                    .foregroundStyle(GweiloTheme.accent)
            }
        }
    }
}

struct MovementLabel: View {
    let value: Int

    var body: some View {
        Text(value >= 0 ? "+\(value)" : "\(value)")
            .font(.caption.monospacedDigit().weight(.bold))
            .foregroundStyle(value >= 0 ? GweiloTheme.lime : GweiloTheme.coral)
    }
}

struct PlayerAvatar: View {
    let player: DemoPlayer
    let size: CGFloat

    var body: some View {
        Text(player.initials)
            .font(.system(size: size * 0.30, weight: .bold))
            .foregroundStyle(player.colorSeed.isMultiple(of: 2) ? .white : .primary)
            .frame(width: size, height: size)
            .background(
                player.colorSeed.isMultiple(of: 2)
                    ? GweiloTheme.accent
                    : Color.primary.opacity(0.08),
                in: .circle
            )
            .accessibilityLabel(player.name)
    }
}

struct ResponsiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.84 : 1)
            .animation(.smooth(duration: 0.12), value: configuration.isPressed)
    }
}
