import SwiftUI

struct SessionsView: View {
    private let sessions = DemoSession.all

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 26) {
                        SessionsHeader()

                        ForEach(sessions) { session in
                            SessionRecord(session: session)

                            if session.id != sessions.last?.id {
                                Divider()
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
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

            Button("Start", systemImage: "plus") {}
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.bordered)
        }
        .padding(.top, 18)
    }
}

private struct SessionRecord: View {
    let session: DemoSession

    var body: some View {
        Button(action: {}) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(session.dateLabel)
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Spacer()

                    Text(session.status.rawValue)
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

                if session.status == .active {
                    HStack {
                        Text("Round \(session.currentRound ?? 1) of \(session.totalRounds)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)

                        Spacer()

                        Label("Resume", systemImage: "arrow.right")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(GweiloTheme.accent)
                    }
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
            }
            .padding(.vertical, 4)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
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
