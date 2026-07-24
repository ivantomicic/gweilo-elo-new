import SwiftUI

struct HomeView: View {
    let dataStore: AppDataStore

    private var topSinglesPlayers: [RankingEntry] {
        Array(
            dataStore.singlesRankings
                .filter { $0.matches >= RankingCategory.singles.minimumMatches }
                .prefix(4)
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 30) {
                        HomeHeader()
                        HomeLiveSession(session: dataStore.activeSession)
                        CompactStandings(players: topSinglesPlayers)
                        LatestSessionResult(session: dataStore.latestCompletedSession)

                        if let errorMessage = dataStore.errorMessage {
                            DataErrorNotice(
                                message: errorMessage,
                                retry: {
                                    Task { await dataStore.load() }
                                }
                            )
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
            .navigationDestination(for: SessionSummary.self) { session in
                SessionDetailView(
                    session: session,
                    dataStore: dataStore
                )
            }
            .navigationDestination(for: RankingEntry.self) { player in
                PlayerProfileView(
                    player: player,
                    dataStore: dataStore
                )
            }
        }
    }
}

struct DataErrorNotice: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(GweiloTheme.coral)

            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer(minLength: 4)

            Button("Retry", action: retry)
                .font(.footnote.weight(.bold))
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) {
            Divider()
        }
    }
}

private struct HomeHeader: View {
    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text("GWEILO / NOVI SAD")
                    .font(
                        GweiloTheme.labelFont(
                            size: 12,
                            relativeTo: .caption
                        )
                    )
                    .tracking(2.2)
                    .foregroundStyle(GweiloTheme.lime)

                Text(Date.now.formatted(.dateTime.weekday(.wide)))
                    .font(
                        GweiloTheme.displayFont(
                            size: 44,
                            relativeTo: .largeTitle
                        )
                    )
                    .textCase(.uppercase)
                    .tracking(0.2)
            }

            Spacer()

            PhantomMark(size: 58)
        }
        .padding(.top, 18)
    }
}

private struct HomeLiveSession: View {
    let session: SessionSummary?

    var body: some View {
        if let session {
            NavigationLink(value: session) {
                LiveSessionFeature(session: session)
            }
            .buttonStyle(ResponsiveButtonStyle())
            .accessibilityHint("Opens the active session")
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("NO ACTIVE SESSION")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
                Text("The next live session will appear here.")
                    .font(.headline)

                Link(destination: URL(string: "https://www.gweilo.lol/start-session")!) {
                    Label("Start on the web", systemImage: "safari")
                        .font(.subheadline.weight(.semibold))
                }
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
    }
}

private struct LiveSessionFeature: View {
    let session: SessionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Label("LIVE SESSION", systemImage: "circle.fill")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(GweiloTheme.lime)

                Spacer()

                Text("\(session.playerCount) PLAYERS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Current round")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Text("Round \(session.currentRound ?? 1)")
                        .font(
                            GweiloTheme.displayFont(
                                size: 40,
                                relativeTo: .title
                            )
                        )
                        .textCase(.uppercase)
                        .tracking(0.4)
                }

                Spacer()

                Text("\(session.currentRound ?? 1) / \(session.totalRounds)")
                    .font(.caption.monospacedDigit().weight(.bold))
                    .foregroundStyle(.secondary)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }

            HStack(spacing: 18) {
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
        }
        .foregroundStyle(.primary)
        .padding(.vertical, 16)
        .padding(.leading, 17)
        .padding(.trailing, 14)
        .background(GweiloTheme.raisedSurface)
        .overlay(alignment: .leading) {
            LinearGradient(
                colors: [GweiloTheme.lime, GweiloTheme.accent],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(width: 3)
        }
        .overlay {
            Rectangle()
                .stroke(GweiloTheme.accent.opacity(0.28), lineWidth: 0.8)
        }
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
                        NavigationLink(value: player) {
                            StandingRow(rank: index + 1, player: player)
                        }
                        .buttonStyle(ResponsiveButtonStyle())

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
                .font(
                    GweiloTheme.displayFont(
                        size: 18,
                        relativeTo: .caption
                    )
                )
                .foregroundStyle(rank == 1 ? GweiloTheme.lime : .secondary)
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
                .font(
                    GweiloTheme.displayFont(
                        size: 21,
                        relativeTo: .body
                    )
                )
                .foregroundStyle(rank == 1 ? GweiloTheme.lime : GweiloTheme.bone)

            Image(systemName: "chevron.right")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .foregroundStyle(.primary)
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
                NavigationLink(value: session) {
                    HStack(alignment: .center, spacing: 14) {
                        VStack(alignment: .leading, spacing: 7) {
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
                                Text(
                                    "Best form: \(bestPlayer) \(bestDelta >= 0 ? "+" : "")\(bestDelta)"
                                )
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(GweiloTheme.lime)
                            }
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(ResponsiveButtonStyle())
                .accessibilityHint("Opens the latest session")
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
            .font(
                GweiloTheme.labelFont(
                    size: 12,
                    relativeTo: .caption
                )
            )
            .tracking(1.8)
            .foregroundStyle(GweiloTheme.accentBright)
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
