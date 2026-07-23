import SwiftUI

struct SessionDetailView: View {
    let session: SessionSummary
    let dataStore: AppDataStore

    @State private var detail: SessionDetail?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 28) {
                    SessionDetailHeader(session: session)
                    SessionDetailContent(
                        detail: detail,
                        isLoading: isLoading,
                        errorMessage: errorMessage,
                        retry: load
                    )
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .refreshable {
                await load()
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle("Session")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarVisibility(.visible, for: .navigationBar)
        .task(id: session.id) {
            await load()
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            detail = try await dataStore.sessionDetail(for: session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct SessionDetailHeader: View {
    let session: SessionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(session.status == .active ? "LIVE SESSION" : "SESSION RESULT")
                        .font(.caption2.weight(.bold))
                        .tracking(1.3)
                        .foregroundStyle(
                            session.status == .active
                                ? GweiloTheme.lime
                                : GweiloTheme.accent
                        )

                    Text(session.dateLabel)
                        .font(.title2.weight(.bold))
                }

                Spacer()

                Text(session.status.label)
                    .font(.caption2.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 0) {
                DetailMetric(value: "\(session.playerCount)", label: "PLAYERS")
                DetailMetric(value: "\(session.totalRounds)", label: "ROUNDS")
                DetailMetric(
                    value: "\(session.singlesMatches + session.doublesMatches)",
                    label: "FINISHED"
                )
            }
        }
        .padding(.top, 12)
    }
}

private struct DetailMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.title2.monospacedDigit().weight(.bold))
            Text(label)
                .font(.caption2.weight(.semibold))
                .tracking(0.5)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SessionDetailContent: View {
    let detail: SessionDetail?
    let isLoading: Bool
    let errorMessage: String?
    let retry: () async -> Void

    var body: some View {
        if let detail {
            ParticipantsSection(participants: detail.participants)
            RoundsSection(detail: detail)
        } else if isLoading {
            ProgressView("Loading session…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let errorMessage {
            ContentUnavailableView {
                Label("Couldn’t load session", systemImage: "wifi.exclamationmark")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Try again") {
                    Task { await retry() }
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}

private struct ParticipantsSection: View {
    let participants: [SessionParticipant]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            DetailSectionTitle(
                title: "Players",
                trailing: "\(participants.count)"
            )

            VStack(spacing: 0) {
                ForEach(participants) { participant in
                    ParticipantRow(participant: participant)

                    if participant.id != participants.last?.id {
                        Divider()
                    }
                }
            }
        }
    }
}

private struct ParticipantRow: View {
    let participant: SessionParticipant

    var body: some View {
        HStack(spacing: 12) {
            Text(participant.initials)
                .font(.caption2.weight(.bold))
                .frame(width: 34, height: 34)
                .background(Color.primary.opacity(0.08), in: .circle)
                .accessibilityHidden(true)

            Text(participant.name)
                .font(.body.weight(.semibold))

            Spacer()

            if let team = participant.team {
                Text("TEAM \(team)")
                    .font(.caption2.weight(.bold))
                    .tracking(0.6)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}

private struct RoundsSection: View {
    let detail: SessionDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            DetailSectionTitle(
                title: "Rounds",
                trailing: "\(detail.rounds.count)"
            )

            if detail.rounds.isEmpty {
                ContentUnavailableView(
                    "No matches",
                    systemImage: "list.number",
                    description: Text("This session does not have any generated matches.")
                )
            } else {
                ForEach(detail.rounds) { round in
                    RoundRecord(
                        round: round,
                        detail: detail
                    )

                    if round.id != detail.rounds.last?.id {
                        Divider()
                    }
                }
            }
        }
    }
}

private struct RoundRecord: View {
    let round: SessionRound
    let detail: SessionDetail

    private var isCurrent: Bool {
        detail.session.status == .active
            && round.number == detail.session.currentRound
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("ROUND \(round.number)")
                    .font(.caption.weight(.bold))
                    .tracking(0.9)

                if isCurrent {
                    Label("CURRENT", systemImage: "circle.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(GweiloTheme.lime)
                }

                Spacer()

                Text(round.matches.allSatisfy(\.isCompleted) ? "COMPLETE" : "PENDING")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }

            ForEach(round.matches) { match in
                MatchRecord(match: match, detail: detail)
            }

            if !round.restingPlayers.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("RESTING")
                        .font(.caption2.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(.secondary)
                    Text(round.restingPlayers.map(\.name).joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.leading, isCurrent ? 12 : 0)
        .overlay(alignment: .leading) {
            if isCurrent {
                Capsule()
                    .fill(GweiloTheme.lime)
                    .frame(width: 3)
            }
        }
    }
}

private struct MatchRecord: View {
    let match: SessionMatch
    let detail: SessionDetail

    private var names: (teamOne: String, teamTwo: String) {
        detail.teamNames(for: match.playerIDs)
    }

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(match.type.label)
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(.secondary)

                Text(names.teamOne)
                    .font(.body.weight(.semibold))
                    .lineLimit(2)

                Text(names.teamTwo)
                    .font(.body.weight(.semibold))
                    .lineLimit(2)
            }

            Spacer(minLength: 10)

            MatchScore(match: match)
        }
        .padding(.vertical, 7)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        if let teamOneScore = match.teamOneScore,
           let teamTwoScore = match.teamTwoScore {
            return "\(match.type.label), \(names.teamOne), \(teamOneScore), \(names.teamTwo), \(teamTwoScore)"
        }
        return "\(match.type.label), \(names.teamOne) versus \(names.teamTwo), pending"
    }
}

private struct MatchScore: View {
    let match: SessionMatch

    var body: some View {
        if let teamOneScore = match.teamOneScore,
           let teamTwoScore = match.teamTwoScore {
            VStack(spacing: 4) {
                Text("\(teamOneScore)")
                    .foregroundStyle(teamOneScore > teamTwoScore ? GweiloTheme.lime : .primary)
                Divider()
                    .frame(width: 28)
                Text("\(teamTwoScore)")
                    .foregroundStyle(teamTwoScore > teamOneScore ? GweiloTheme.lime : .primary)
            }
            .font(.title3.monospacedDigit().weight(.bold))
        } else {
            Text("—")
                .font(.title2.monospacedDigit().weight(.bold))
                .foregroundStyle(.tertiary)
        }
    }
}

private struct DetailSectionTitle: View {
    let title: String
    let trailing: String

    var body: some View {
        HStack {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .tracking(1.3)
                .foregroundStyle(.secondary)
            Spacer()
            Text(trailing)
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}
