import SwiftUI

struct SessionsView: View {
    let dataStore: AppDataStore

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 26) {
                        SessionsHeader()
                        SessionsContent(dataStore: dataStore)
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
        }
    }
}
private struct SessionsHeader: View {
    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 5) {
                Text("MATCH HISTORY")
                    .font(.caption2.weight(.bold))
                    .tracking(1.3)
                    .foregroundStyle(GweiloTheme.accent)

                Text("Sessions")
                    .font(.largeTitle.weight(.bold))
                    .tracking(-0.7)
            }

            Spacer()

            if #available(iOS 26, *) {
                Image(systemName: "arrow.clockwise")
                    .font(.subheadline.weight(.semibold))
                    .padding(12)
                    .glassEffect(.regular, in: .circle)
                    .accessibilityHidden(true)
            }
        }
        .padding(.top, 18)
    }
}

private struct SessionsContent: View {
    let dataStore: AppDataStore

    var body: some View {
        if dataStore.isLoading, dataStore.sessions.isEmpty {
            ProgressView("Loading sessions…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let errorMessage = dataStore.errorMessage,
                  dataStore.sessions.isEmpty {
            ContentUnavailableView(
                "Couldn’t load sessions",
                systemImage: "wifi.exclamationmark",
                description: Text(errorMessage)
            )
        } else if dataStore.sessions.isEmpty {
            ContentUnavailableView(
                "No sessions yet",
                systemImage: "sportscourt",
                description: Text("Sessions created on the web will appear here.")
            )
        } else {
            ForEach(dataStore.sessions) { session in
                SessionRecord(session: session)

                if session.id != dataStore.sessions.last?.id {
                    Divider()
                }
            }
        }
    }
}

private struct SessionRecord: View {
    let session: SessionSummary

    var body: some View {
        NavigationLink(value: session) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(session.dateLabel)
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Spacer()

                    Text(session.status.label)
                        .font(.caption2.weight(.bold))
                        .tracking(0.8)
                        .foregroundStyle(
                            session.status == .active
                                ? GweiloTheme.lime
                                : .secondary
                        )
                }

                HStack(spacing: 0) {
                    SessionValue(value: "\(session.playerCount)", label: "PLAYERS")
                    SessionValue(value: "\(session.singlesMatches)", label: "SINGLES")
                    SessionValue(value: "\(session.doublesMatches)", label: "DOUBLES")
                    SessionValue(value: "\(session.totalRounds)", label: "ROUNDS")
                }

                HStack {
                    if session.status == .active {
                        Label(
                            "Round \(session.currentRound ?? 1) of \(session.totalRounds)",
                            systemImage: "circle.fill"
                        )
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(GweiloTheme.accent)
                    } else if let bestPlayer = session.bestPlayer,
                              let bestDelta = session.bestDelta,
                              let worstPlayer = session.worstPlayer,
                              let worstDelta = session.worstDelta {
                        HStack(spacing: 16) {
                            SessionDelta(
                                symbol: "arrow.up",
                                player: bestPlayer,
                                delta: bestDelta,
                                color: GweiloTheme.lime
                            )
                            SessionDelta(
                                symbol: "arrow.down",
                                player: worstPlayer,
                                delta: worstDelta,
                                color: GweiloTheme.coral
                            )
                        }
                    }

                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.vertical, 4)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens session details")
    }
}

private struct SessionValue: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.title3.monospacedDigit().weight(.semibold))
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SessionDelta: View {
    let symbol: String
    let player: String
    let delta: Int
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: symbol)
            Text(player)
            Text(delta > 0 ? "+\(delta)" : "\(delta)")
                .monospacedDigit()
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(color)
    }
}
