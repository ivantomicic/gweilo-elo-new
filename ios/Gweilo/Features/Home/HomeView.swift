import SwiftUI

struct HomeView: View {
    let dataStore: AppDataStore

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 30) {
                        HomeHeader()
                        HomeLiveSession(session: dataStore.activeSession)
                        CompactStandings(
                            players: Array(
                                dataStore.singlesRankings
                                    .filter { $0.matches >= RankingCategory.singles.minimumMatches }
                                    .prefix(4)
                            )
                        )
                        LatestSessionResult(session: dataStore.latestCompletedSession)

                        if let errorMessage = dataStore.errorMessage {
                            Label(errorMessage, systemImage: "wifi.exclamationmark")
                                .font(.footnote)
                                .foregroundStyle(GweiloTheme.coral)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .refreshable {
                    await dataStore.load()
                }
                .scrollIndicators(.hidden)
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
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

                Text(Date.now.formatted(.dateTime.weekday(.wide)))
                    .font(.largeTitle.weight(.bold))
                    .tracking(-0.7)
            }

            Spacer()

            Image(systemName: "figure.table.tennis")
                .font(.title3.weight(.semibold))
                .frame(width: 42, height: 42)
                .background(Color.primary.opacity(0.08), in: .circle)
                .accessibilityHidden(true)
        }
        .padding(.top, 18)
    }
}

private struct HomeLiveSession: View {
    let session: SessionSummary?

    var body: some View {
        if let session {
            LiveSessionFeature(session: session)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("NO ACTIVE SESSION")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
                Text("The next live session will appear here.")
                    .font(.headline)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
    }
}

private struct LiveSessionFeature: View {
    let session: SessionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                Label("ACTIVE SESSION", systemImage: "circle.fill")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)

                Spacer()

                Text("\(session.playerCount) PLAYERS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.72))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Current round")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.68))

                Text("Round \(session.currentRound ?? 1) of \(session.totalRounds)")
                    .font(.title.weight(.bold))

                Text(
                    "\(session.singlesMatches) singles completed · \(session.doublesMatches) doubles completed"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white.opacity(0.76))
            }

            Label("Live from Supabase", systemImage: "checkmark.icloud.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.78))
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
        .accessibilityElement(children: .combine)
    }
}

private struct CompactStandings: View {
    let players: [RankingEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "Current ranking")

            if players.isEmpty {
                Text("No eligible singles rankings yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
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
}

private struct StandingRow: View {
    let rank: Int
    let player: RankingEntry

    var body: some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(rank == 1 ? GweiloTheme.accent : .secondary)
                .frame(width: 18, alignment: .leading)

            PlayerIdentityAvatar(
                name: player.name,
                initials: player.initials,
                avatarURL: player.avatarURL,
                size: 34
            )
            .accessibilityHidden(true)

            Text(player.name)
                .font(.body.weight(.semibold))

            Spacer()

            Text("\(player.elo)")
                .font(.body.monospacedDigit().weight(.bold))
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Rank \(rank), \(player.name), \(player.elo) Elo")
    }
}

private struct LatestSessionResult: View {
    let session: SessionSummary?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "Latest session")

            if let session {
                VStack(alignment: .leading, spacing: 8) {
                    Text(session.dateLabel)
                        .font(.headline)

                    HStack {
                        Label(
                            "\(session.singlesMatches) singles",
                            systemImage: "person.2.fill"
                        )
                        Label(
                            "\(session.doublesMatches) doubles",
                            systemImage: "person.3.fill"
                        )
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                    if let bestPlayer = session.bestPlayer,
                       let bestDelta = session.bestDelta {
                        Text("Best form: \(bestPlayer) \(bestDelta >= 0 ? "+" : "")\(bestDelta)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(GweiloTheme.lime)
                    }
                }
            } else {
                Text("No completed sessions yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct SectionHeading: View {
    let title: String

    var body: some View {
        Text(title.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.3)
            .foregroundStyle(.secondary)
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
