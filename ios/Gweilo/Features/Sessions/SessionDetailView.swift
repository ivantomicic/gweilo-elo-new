import SwiftUI

struct SessionDetailView: View {
    let session: SessionSummary
    let dataStore: AppDataStore

    @State private var detail: SessionDetail?
    @State private var expandedRounds: Set<Int> = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 30) {
                    SessionHero(
                        session: session,
                        totalMatchCount: detail?.rounds.reduce(0) {
                            $0 + $1.matches.count
                        }
                    )

                    if let detail {
                        if let currentRound = currentRound(in: detail) {
                            CurrentRoundStage(
                                round: currentRound,
                                detail: detail
                            )
                        }

                        PlayerRoster(participants: detail.participants)

                        RoundTimeline(
                            detail: detail,
                            expandedRounds: expandedRounds,
                            toggleRound: toggleRound
                        )
                    } else if isLoading {
                        SessionDetailSkeleton()
                    } else if let errorMessage {
                        SessionDetailError(
                            message: errorMessage,
                            retry: load
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 48)
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

    private func currentRound(in detail: SessionDetail) -> SessionRound? {
        guard
            detail.session.status == .active,
            let currentRoundNumber = detail.session.currentRound
        else {
            return nil
        }
        return detail.rounds.first { $0.number == currentRoundNumber }
    }

    private func toggleRound(_ roundNumber: Int) {
        withAnimation(.snappy(duration: 0.18)) {
            if expandedRounds.contains(roundNumber) {
                expandedRounds.remove(roundNumber)
            } else {
                expandedRounds.insert(roundNumber)
            }
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let loadedDetail = try await dataStore.sessionDetail(for: session)
            detail = loadedDetail

            if session.status == .completed,
               let latestRound = loadedDetail.rounds.last {
                expandedRounds = [latestRound.number]
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct SessionHero: View {
    let session: SessionSummary
    let totalMatchCount: Int?

    private var completedMatchCount: Int {
        session.singlesMatches + session.doublesMatches
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 7) {
                    Circle()
                        .fill(
                            session.status == .active
                                ? GweiloTheme.lime
                                : GweiloTheme.accent
                        )
                        .frame(width: 7, height: 7)

                    Text(session.status == .active ? "LIVE NOW" : "COMPLETED")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                }
                .foregroundStyle(
                    session.status == .active
                        ? GweiloTheme.lime
                        : GweiloTheme.accent
                )

                Text(
                    session.createdAt.formatted(
                        .dateTime.weekday(.wide).day().month(.wide)
                    )
                )
                .font(.title2.weight(.bold))
                .tracking(-0.4)

                Text(session.createdAt.formatted(.dateTime.hour().minute()))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            if let totalMatchCount {
                VStack(spacing: 10) {
                    ProgressView(
                        value: Double(completedMatchCount),
                        total: Double(max(totalMatchCount, 1))
                    )
                    .tint(
                        session.status == .active
                            ? GweiloTheme.lime
                            : GweiloTheme.accent
                    )

                    HStack {
                        Text("\(completedMatchCount) of \(totalMatchCount) matches")
                        Spacer()
                        Text("\(session.totalRounds) rounds")
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 0) {
                HeroMetric(value: "\(session.playerCount)", label: "PLAYERS")
                HeroMetric(value: "\(session.singlesMatches)", label: "SINGLES")
                HeroMetric(value: "\(session.doublesMatches)", label: "DOUBLES")
            }
        }
        .padding(.top, 10)
    }
}

private struct HeroMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.title3.monospacedDigit().weight(.bold))
            Text(label)
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct CurrentRoundStage: View {
    let round: SessionRound
    let detail: SessionDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("PLAYING NOW")
                        .font(.caption2.weight(.bold))
                        .tracking(1.3)
                        .foregroundStyle(GweiloTheme.lime)

                    Text("Round \(round.number)")
                        .font(.title.weight(.bold))
                        .tracking(-0.5)
                }

                Spacer()

                Text("\(round.number) / \(detail.session.totalRounds)")
                    .font(.caption.monospacedDigit().weight(.bold))
                    .foregroundStyle(.secondary)
            }

            ForEach(round.matches) { match in
                ScoreboardMatch(
                    match: match,
                    detail: detail,
                    emphasis: true
                )
            }

            RestingLine(players: round.restingPlayers)
        }
        .padding(.vertical, 15)
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .background(GweiloTheme.lime.opacity(0.055))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(GweiloTheme.lime)
                .frame(width: 3)
        }
    }
}

private struct PlayerRoster: View {
    let participants: [SessionParticipant]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(title: "Players", value: "\(participants.count)")

            ScrollView(.horizontal) {
                LazyHStack(spacing: 18) {
                    ForEach(participants) { participant in
                        VStack(spacing: 8) {
                            ZStack(alignment: .bottomTrailing) {
                                PlayerIdentityAvatar(
                                    name: participant.name,
                                    initials: participant.initials,
                                    avatarURL: participant.avatarURL,
                                    size: 46
                                )

                                if let team = participant.team {
                                    Text(team)
                                        .font(.caption2.monospacedDigit().weight(.bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 18, height: 18)
                                        .background(GweiloTheme.accent, in: .circle)
                                }
                            }

                            Text(participant.name)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                        }
                        .frame(width: 66)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }
}

private struct RoundTimeline: View {
    let detail: SessionDetail
    let expandedRounds: Set<Int>
    let toggleRound: (Int) -> Void
    let rounds: [SessionRound]

    init(
        detail: SessionDetail,
        expandedRounds: Set<Int>,
        toggleRound: @escaping (Int) -> Void
    ) {
        self.detail = detail
        self.expandedRounds = expandedRounds
        self.toggleRound = toggleRound

        if detail.session.status == .active,
           let currentRound = detail.session.currentRound {
            rounds = detail.rounds.filter { $0.number != currentRound }
        } else {
            rounds = detail.rounds
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(title: "Round history", value: "\(rounds.count)")

            if rounds.isEmpty {
                Text("Earlier rounds will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(rounds) { round in
                        RoundTimelineRow(
                            round: round,
                            detail: detail,
                            isExpanded: expandedRounds.contains(round.number),
                            action: { toggleRound(round.number) }
                        )

                        if round.id != rounds.last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
    }
}

private struct RoundTimelineRow: View {
    let round: SessionRound
    let detail: SessionDetail
    let isExpanded: Bool
    let action: () -> Void

    private var isComplete: Bool {
        round.matches.allSatisfy(\.isCompleted)
    }

    private var matchSummary: String {
        let singles = round.matches.filter { $0.type == .singles }.count
        let doubles = round.matches.count - singles
        var parts: [String] = []
        if singles > 0 { parts.append("\(singles) singles") }
        if doubles > 0 { parts.append("\(doubles) doubles") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(spacing: 0) {
            Button(action: action) {
                HStack(spacing: 13) {
                    Text("\(round.number)")
                        .font(.subheadline.monospacedDigit().weight(.bold))
                        .foregroundStyle(
                            isComplete ? .primary : GweiloTheme.accent
                        )
                        .frame(width: 32, height: 32)
                        .background(Color.primary.opacity(0.06), in: .circle)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Round \(round.number)")
                            .font(.body.weight(.semibold))
                        Text(matchSummary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(isComplete ? "DONE" : "PENDING")
                        .font(.caption2.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(isComplete ? .secondary : GweiloTheme.accent)

                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                }
                .padding(.vertical, 14)
                .contentShape(.rect)
            }
            .buttonStyle(ResponsiveButtonStyle())
            .accessibilityLabel(
                "Round \(round.number), \(matchSummary), \(isComplete ? "complete" : "pending")"
            )
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")

            if isExpanded {
                VStack(spacing: 12) {
                    ForEach(round.matches) { match in
                        ScoreboardMatch(
                            match: match,
                            detail: detail,
                            emphasis: false
                        )
                    }
                    RestingLine(players: round.restingPlayers)
                }
                .padding(.bottom, 16)
                .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .top)))
            }
        }
    }
}

private struct ScoreboardMatch: View {
    let match: SessionMatch
    let detail: SessionDetail
    let emphasis: Bool

    private var teamOneIDs: [UUID] {
        match.type == .doubles
            ? Array(match.playerIDs.prefix(2))
            : Array(match.playerIDs.prefix(1))
    }

    private var teamTwoIDs: [UUID] {
        match.type == .doubles
            ? Array(match.playerIDs.dropFirst(2).prefix(2))
            : Array(match.playerIDs.dropFirst().prefix(1))
    }

    private var teamOneWon: Bool {
        guard
            let teamOneScore = match.teamOneScore,
            let teamTwoScore = match.teamTwoScore
        else { return false }
        return teamOneScore > teamTwoScore
    }

    private var teamTwoWon: Bool {
        guard
            let teamOneScore = match.teamOneScore,
            let teamTwoScore = match.teamTwoScore
        else { return false }
        return teamTwoScore > teamOneScore
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(match.type.label)
                    .font(.caption2.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(match.isCompleted ? "FINAL" : "UP NEXT")
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(
                        match.isCompleted ? .secondary : GweiloTheme.accent
                    )
            }
            .padding(.bottom, 10)

            TeamScoreRow(
                playerIDs: teamOneIDs,
                score: match.teamOneScore,
                isWinner: teamOneWon,
                detail: detail
            )

            Divider()
                .padding(.leading, 44)

            TeamScoreRow(
                playerIDs: teamTwoIDs,
                score: match.teamTwoScore,
                isWinner: teamTwoWon,
                detail: detail
            )
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(
            Color.primary.opacity(emphasis ? 0.04 : 0.025),
            in: .rect(cornerRadius: 7)
        )
        .accessibilityElement(children: .combine)
    }
}

private struct TeamScoreRow: View {
    let playerIDs: [UUID]
    let score: Int?
    let isWinner: Bool
    let detail: SessionDetail

    private var teamName: String {
        playerIDs.map { detail.name(for: $0) }.joined(separator: " + ")
    }

    var body: some View {
        HStack(spacing: 12) {
            AvatarStack(
                participants: playerIDs.compactMap {
                    detail.participant(for: $0)
                }
            )

            Text(teamName)
                .font(.body.weight(isWinner ? .bold : .semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)

            Spacer(minLength: 8)

            Text(score.map(String.init) ?? "—")
                .font(.title2.monospacedDigit().weight(.bold))
                .foregroundStyle(isWinner ? GweiloTheme.lime : .primary)
                .frame(minWidth: 28, alignment: .trailing)
        }
        .padding(.vertical, 7)
    }
}

private struct AvatarStack: View {
    let participants: [SessionParticipant]

    var body: some View {
        HStack(spacing: -8) {
            ForEach(participants) { participant in
                PlayerIdentityAvatar(
                    name: participant.name,
                    initials: participant.initials,
                    avatarURL: participant.avatarURL,
                    size: 30
                )
                .overlay {
                    Circle()
                        .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                }
            }
        }
        .frame(width: participants.count > 1 ? 52 : 34, alignment: .leading)
    }
}

private struct RestingLine: View {
    let players: [SessionParticipant]

    var body: some View {
        if !players.isEmpty {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "pause.fill")
                    .font(.caption2)
                Text("Resting")
                    .font(.caption.weight(.bold))
                Text(players.map(\.name).joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .foregroundStyle(.secondary)
        }
    }
}

private struct SectionLabel: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .tracking(1.3)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}

private struct SessionDetailSkeleton: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.regular)
            Text("Loading session")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 70)
    }
}

private struct SessionDetailError: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Couldn’t load session", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Try again") {
                Task { await retry() }
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

#if DEBUG
struct SessionDetailPreviewScreen: View {
    @State private var expandedRounds: Set<Int> = [2]

    private let detail = SessionDetail.preview

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 30) {
                        SessionHero(
                            session: detail.session,
                            totalMatchCount: detail.rounds.reduce(0) {
                                $0 + $1.matches.count
                            }
                        )

                        if let currentRound = detail.rounds.first(
                            where: { $0.number == detail.session.currentRound }
                        ) {
                            CurrentRoundStage(
                                round: currentRound,
                                detail: detail
                            )
                        }

                        PlayerRoster(participants: detail.participants)

                        RoundTimeline(
                            detail: detail,
                            expandedRounds: expandedRounds,
                            toggleRound: toggleRound
                        )
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 48)
                }
                .scrollIndicators(.hidden)
            }
            .navigationTitle("Session")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func toggleRound(_ number: Int) {
        withAnimation(.snappy(duration: 0.18)) {
            if expandedRounds.contains(number) {
                expandedRounds.remove(number)
            } else {
                expandedRounds.insert(number)
            }
        }
    }
}

private extension SessionDetail {
    static let preview: SessionDetail = {
        let ids = (1...6).map {
            UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", $0))!
        }
        let participants = zip(
            ids,
            ["Ivan", "Gara", "Leo", "Miladin", "Andrej", "Marie"]
        ).enumerated().map { index, pair in
            SessionParticipant(
                id: pair.0,
                name: pair.1,
                avatarURL: nil,
                team: ["A", "A", "B", "B", "C", "C"][index]
            )
        }
        let rounds = [
            SessionRound(
                number: 1,
                matches: [
                    SessionMatch(
                        id: UUID(),
                        roundNumber: 1,
                        type: .singles,
                        order: 0,
                        playerIDs: [ids[0], ids[2]],
                        isCompleted: true,
                        teamOneScore: 3,
                        teamTwoScore: 1
                    ),
                    SessionMatch(
                        id: UUID(),
                        roundNumber: 1,
                        type: .singles,
                        order: 1,
                        playerIDs: [ids[1], ids[4]],
                        isCompleted: true,
                        teamOneScore: 2,
                        teamTwoScore: 3
                    )
                ],
                restingPlayers: [participants[3], participants[5]]
            ),
            SessionRound(
                number: 2,
                matches: [
                    SessionMatch(
                        id: UUID(),
                        roundNumber: 2,
                        type: .singles,
                        order: 0,
                        playerIDs: [ids[3], ids[5]],
                        isCompleted: true,
                        teamOneScore: 3,
                        teamTwoScore: 2
                    )
                ],
                restingPlayers: Array(participants.prefix(4))
            ),
            SessionRound(
                number: 3,
                matches: [
                    SessionMatch(
                        id: UUID(),
                        roundNumber: 3,
                        type: .doubles,
                        order: 0,
                        playerIDs: [ids[0], ids[1], ids[2], ids[3]],
                        isCompleted: false,
                        teamOneScore: nil,
                        teamTwoScore: nil
                    ),
                    SessionMatch(
                        id: UUID(),
                        roundNumber: 3,
                        type: .singles,
                        order: 1,
                        playerIDs: [ids[4], ids[5]],
                        isCompleted: false,
                        teamOneScore: nil,
                        teamTwoScore: nil
                    )
                ],
                restingPlayers: []
            )
        ]
        return SessionDetail(
            session: SessionSummary(
                id: UUID(),
                createdAt: .now,
                playerCount: 6,
                status: .active,
                currentRound: 3,
                totalRounds: 3,
                singlesMatches: 3,
                doublesMatches: 0,
                bestPlayer: nil,
                bestDelta: nil,
                worstPlayer: nil,
                worstDelta: nil
            ),
            participants: participants,
            rounds: rounds
        )
    }()
}
#endif
