import SwiftUI

struct SessionDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let session: SessionSummary
    let dataStore: AppDataStore

    @State private var detail: SessionDetail?
    @State private var expandedRounds: Set<Int> = []
    @State private var isLoading = false
    @State private var isManagingSession = false
    @State private var showsManagementConfirmation = false
    @State private var errorMessage: String?
    @State private var managementErrorMessage: String?
    @State private var selectedPlayerID: UUID?

    var body: some View {
        ZStack {
            ArenaBackground()

            if detail == nil, isLoading {
                GweiloFullScreenLoadingView("Učitavam termin…")
            } else {
                ScrollViewReader { scrollProxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 30) {
                            if let detail {
                                if shouldShowScorekeeper(for: detail),
                                   let currentRound = currentRound(in: detail) {
                                    ScoreEntryView(
                                        round: currentRound,
                                        detail: detail,
                                        submit: { scores in
                                            try await dataStore.submitRound(
                                                sessionID: detail.session.id,
                                                roundNumber: currentRound.number,
                                                scores: scores
                                            )
                                        },
                                        onSubmitted: {
                                            await load()
                                        },
                                        onFocusedMatchChanged: { matchID in
                                            withAnimation(.smooth(duration: 0.24)) {
                                                scrollProxy.scrollTo(
                                                    matchID,
                                                    anchor: .center
                                                )
                                            }
                                        }
                                    )
                                    .id(currentRound.id)
                                } else {
                                    SessionHero(
                                        session: detail.session,
                                        totalMatchCount: detail.rounds.reduce(0) {
                                            $0 + $1.matches.count
                                        }
                                    )

                                    if let currentRound = currentRound(in: detail) {
                                        ReadOnlyCurrentRound(
                                            round: currentRound,
                                            detail: detail
                                        )
                                    } else if detail.session.status == .completed {
                                        SessionPerformanceTable(
                                            detail: detail,
                                            selectedPlayerID: Binding(
                                                get: { selectedPlayerID },
                                                set: { playerID in
                                                    updateSelectedPlayer(playerID)
                                                }
                                            )
                                        )
                                    }

                                    if detail.session.status == .active {
                                        PlayerRoster(participants: detail.participants)
                                    }

                                    if detail.session.status == .completed,
                                       let selectedPlayerID,
                                       let participant = detail.participant(
                                        for: selectedPlayerID
                                       ) {
                                        PlayerSessionMatchResults(
                                            participant: participant,
                                            matches: SessionPlayerMatchFilter.matches(
                                                for: selectedPlayerID,
                                                in: SessionCompletedMatchPresenter.matches(
                                                    playerCount: detail.session.playerCount,
                                                    rounds: detail.rounds
                                                )
                                            ),
                                            singlesPerformance: detail
                                                .singlesPerformance
                                                .first {
                                                    $0.playerID == selectedPlayerID
                                                },
                                            doublesPerformance: detail
                                                .doublesPlayerPerformance
                                                .first {
                                                    $0.playerID == selectedPlayerID
                                                },
                                            detail: detail,
                                            clearSelection: {
                                                updateSelectedPlayer(nil)
                                            }
                                        )
                                        .transition(playerFilterTransition)
                                    } else if detail.session.status == .completed,
                                       let matches = SessionHalfResultGrouper
                                        .groupedMatches(
                                            playerCount: detail.session.playerCount,
                                            rounds: detail.rounds
                                        ) {
                                        HalfSessionMatchResults(
                                            matches: matches,
                                            detail: detail
                                        )
                                        .transition(playerFilterTransition)
                                    } else {
                                        RoundTimeline(
                                            detail: detail,
                                            expandedRounds: expandedRounds,
                                            toggleRound: toggleRound
                                        )
                                        .transition(playerFilterTransition)
                                    }
                                }
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
                    .scrollDismissesKeyboard(.interactively)
                    .scrollIndicators(.hidden)
                }
            }
        }
        .navigationTitle("Termin")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarVisibility(.visible, for: .navigationBar)
        .toolbar {
            if let detail, shouldShowSessionManagement(for: detail) {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(managementButtonTitle, role: .destructive) {
                            showsManagementConfirmation = true
                        }
                        .disabled(isManagingSession)
                    } label: {
                        if isManagingSession {
                            ProgressView()
                        } else {
                            Image(systemName: "ellipsis")
                        }
                    }
                    .accessibilityLabel("Opcije termina")
                }
            }
        }
        .task(id: session.id) {
            await load()
        }
        .onChange(of: dataStore.sessions.map(\.id)) { _, sessionIDs in
            if !sessionIDs.contains(session.id) {
                dismiss()
            }
        }
        .confirmationDialog(
            managementConfirmationTitle,
            isPresented: $showsManagementConfirmation,
            titleVisibility: .visible
        ) {
            Button(managementButtonTitle, role: .destructive) {
                Task { await manageActiveSession() }
            }
            Button("Zadrži termin", role: .cancel) {}
        } message: {
            Text(managementConfirmationMessage)
        }
        .alert("Termin nije ažuriran", isPresented: managementErrorBinding) {
                Button("U redu", role: .cancel) {}
        } message: {
            Text(managementErrorMessage ?? "Pokušaj ponovo.")
        }
    }

    private var managementErrorBinding: Binding<Bool> {
        Binding(
            get: { managementErrorMessage != nil },
            set: { if !$0 { managementErrorMessage = nil } }
        )
    }

    private var isCancelling: Bool {
        guard let detail else { return true }
        return !hasCompletedMatches(in: detail)
    }

    private var managementButtonTitle: String {
        isCancelling ? "Otkaži termin" : "Završi termin"
    }

    private var managementConfirmationTitle: String {
        isCancelling ? "Otkazati ovaj termin?" : "Završiti ovaj termin?"
    }

    private var managementConfirmationMessage: String {
        if isCancelling {
            return "Nijedan rezultat nije unet, pa će termin biti uklonjen."
        }
        return "Uneti rezultati će biti sačuvani, a termin odmah završen."
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

    private func hasCompletedMatches(in detail: SessionDetail) -> Bool {
        detail.rounds.contains { round in
            round.matches.contains(where: \.isCompleted)
        }
    }

    private func shouldShowSessionManagement(for detail: SessionDetail) -> Bool {
        dataStore.canManageSessions && detail.session.status == .active
    }

    private func shouldShowScorekeeper(for detail: SessionDetail) -> Bool {
        dataStore.canManageSessions && detail.session.status == .active
    }

    private var playerFilterAnimation: Animation? {
        reduceMotion
            ? nil
            : .snappy(duration: 0.22, extraBounce: 0)
    }

    private var playerFilterTransition: AnyTransition {
        .opacity.combined(with: .offset(y: 8))
    }

    private func updateSelectedPlayer(_ playerID: UUID?) {
        guard selectedPlayerID != playerID else { return }
        withAnimation(playerFilterAnimation) {
            selectedPlayerID = playerID
        }
    }

    private func manageActiveSession() async {
        guard let detail, !isManagingSession else { return }
        isManagingSession = true
        managementErrorMessage = nil
        defer { isManagingSession = false }

        do {
            if hasCompletedMatches(in: detail) {
                try await dataStore.forceCloseSession(sessionID: detail.session.id)
                await load()
            } else {
                try await dataStore.cancelSession(sessionID: detail.session.id)
                dismiss()
            }
        } catch {
            managementErrorMessage = error.localizedDescription
        }
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
            let currentSummary = dataStore.sessions.first {
                $0.id == session.id
            } ?? session
            let loadedDetail = try await dataStore.sessionDetail(for: currentSummary)
            detail = loadedDetail
            await SessionLiveActivityManager.shared.sync(detail: loadedDetail)

            if loadedDetail.session.status == .completed {
                expandedRounds = Set(loadedDetail.rounds.map(\.number))
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

                    Text(session.status == .active ? "U TOKU" : "ZAVRŠENA")
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
                        .dateTime
                            .weekday(.wide)
                            .day()
                            .month(.wide)
                            .locale(Locale(identifier: "sr_Latn_RS"))
                    )
                )
                .font(GweiloTheme.displayFont(size: 34, relativeTo: .title))
                .textCase(.uppercase)
                .tracking(-0.25)
                .foregroundStyle(GweiloTheme.bone)

            }

            if session.status == .active, let totalMatchCount {
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
                        Text("\(completedMatchCount) od \(totalMatchCount) mečeva")
                        Spacer()
                        Text("\(session.totalRounds) rundi")
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                }
            }

            if session.status == .active {
                HStack(spacing: 0) {
                    HeroMetric(value: "\(session.playerCount)", label: "IGRAČA")
                    HeroMetric(value: "\(session.singlesMatches)", label: "SINGLOVA")
                    HeroMetric(value: "\(session.doublesMatches)", label: "DUBLOVA")
                }
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
                .font(GweiloTheme.displayFont(size: 23, relativeTo: .title3).monospacedDigit())
                .foregroundStyle(GweiloTheme.bone)
            Text(label)
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ReadOnlyCurrentRound: View {
    let round: SessionRound
    let detail: SessionDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(
                title: "Sada se igra",
                value: "Runda \(round.number)"
            )

            ForEach(round.matches) { match in
                ScoreboardMatch(
                    match: match,
                    detail: detail,
                    emphasis: true
                )
            }

            RestingLine(players: round.restingPlayers)
        }
    }
}

private struct SessionPerformanceTable: View {
    let detail: SessionDetail
    @Binding var selectedPlayerID: UUID?
    @State private var selection: SessionPerformanceCategory = .singles
    @Namespace private var selectionIndicator

    private var availableCategories: [SessionPerformanceCategory] {
        SessionPerformanceCategory.allCases.filter { category in
            switch category {
            case .singles:
                !detail.singlesPerformance.isEmpty
            case .doublesPlayers:
                !detail.doublesPlayerPerformance.isEmpty
            case .doublesTeams:
                !detail.doublesTeamPerformance.isEmpty
            }
        }
    }

    private var activeCategory: SessionPerformanceCategory {
        availableCategories.contains(selection)
            ? selection
            : availableCategories.first ?? .singles
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if availableCategories.isEmpty {
                Text("Statistika još nije dostupna.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                if availableCategories.count > 1 {
                    SessionPerformanceTabs(
                        categories: availableCategories,
                        selection: Binding(
                            get: { activeCategory },
                            set: { selection = $0 }
                        ),
                        selectionIndicator: selectionIndicator
                    )
                }

                VStack(spacing: 0) {
                    PerformanceTableHeader(category: activeCategory)
                    Divider()

                    switch activeCategory {
                    case .singles:
                        playerRows(detail.singlesPerformance)
                    case .doublesPlayers:
                        playerRows(detail.doublesPlayerPerformance)
                    case .doublesTeams:
                        teamRows(detail.doublesTeamPerformance)
                    }
                }
                .id(activeCategory)
                .transition(.opacity.combined(with: .move(edge: .trailing)))
            }
        }
        .animation(.smooth(duration: 0.24), value: activeCategory)
    }

    @ViewBuilder
    private func playerRows(
        _ performances: [SessionPlayerPerformance]
    ) -> some View {
        ForEach(Array(performances.enumerated()), id: \.element.id) {
            index,
            performance in
            PerformanceTableRow(
                rank: index + 1,
                participant: detail.participant(for: performance.playerID),
                performance: performance,
                isSelected: selectedPlayerID == performance.playerID,
                action: {
                    selectedPlayerID = selectedPlayerID == performance.playerID
                        ? nil
                        : performance.playerID
                }
            )

            if performance.id != performances.last?.id {
                Divider()
            }
        }
    }

    @ViewBuilder
    private func teamRows(
        _ performances: [SessionTeamPerformance]
    ) -> some View {
        ForEach(Array(performances.enumerated()), id: \.element.id) {
            index,
            performance in
            TeamPerformanceTableRow(
                rank: index + 1,
                performance: performance
            )

            if performance.id != performances.last?.id {
                Divider()
            }
        }
    }
}

private enum SessionPerformanceCategory: String, CaseIterable, Identifiable {
    case singles
    case doublesPlayers
    case doublesTeams

    var id: Self { self }

    var title: String {
        switch self {
        case .singles:
            "Singlovi"
        case .doublesPlayers:
            "Dublovi"
        case .doublesTeams:
            "Timovi"
        }
    }
}

private struct SessionPerformanceTabs: View {
    let categories: [SessionPerformanceCategory]
    @Binding var selection: SessionPerformanceCategory
    let selectionIndicator: Namespace.ID

    var body: some View {
        HStack(spacing: 24) {
            ForEach(categories) { category in
                Button {
                    selection = category
                } label: {
                    VStack(spacing: 7) {
                        Text(category.title.uppercased())
                            .font(
                                GweiloTheme.labelFont(
                                    size: 12,
                                    relativeTo: .caption
                                )
                            )
                            .tracking(0.7)
                            .foregroundStyle(
                                selection == category
                                    ? GweiloTheme.bone
                                    : GweiloTheme.muted
                            )

                        ZStack {
                            Color.clear.frame(height: 2)

                            if selection == category {
                                Rectangle()
                                    .fill(GweiloTheme.lime)
                                    .matchedGeometryEffect(
                                        id: "session-performance-category",
                                        in: selectionIndicator
                                    )
                            }
                        }
                        .frame(height: 2)
                    }
                    .frame(minHeight: 44, alignment: .bottom)
                    .contentShape(.rect)
                }
                .buttonStyle(ResponsiveButtonStyle())
                .accessibilityAddTraits(
                    selection == category ? .isSelected : []
                )
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)
        }
    }
}

private struct PerformanceTableHeader: View {
    let category: SessionPerformanceCategory

    var body: some View {
        HStack(spacing: 8) {
            Text(category == .doublesTeams ? "TIM" : "IGRAČ")
            Spacer()
            Text("FORMA")
                .frame(width: 56, alignment: .center)
            Text("ELO")
                .frame(width: 60, alignment: .trailing)
        }
        .font(GweiloTheme.labelFont(size: 11, relativeTo: .caption2))
        .tracking(0.8)
        .foregroundStyle(GweiloTheme.muted)
        .padding(.vertical, 9)
    }
}

private struct PerformanceTableRow: View {
    let rank: Int
    let participant: SessionParticipant?
    let performance: SessionPlayerPerformance
    let isSelected: Bool
    let action: () -> Void

    private var eloChangeText: String {
        guard let eloChange = performance.eloChange else { return "BEZ ELO-A" }
        let rounded = Int(eloChange.rounded())
        return rounded > 0 ? "+\(rounded)" : "\(rounded)"
    }

    private var eloColor: Color {
        guard let eloChange = performance.eloChange else { return .secondary }
        if eloChange > 0 { return GweiloTheme.lime }
        if eloChange < 0 { return GweiloTheme.coral }
        return .secondary
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                SessionRankedPlayerAvatar(
                    rank: rank,
                    name: participant?.name ?? "Nepoznat igrač",
                    initials: participant?.initials ?? "?",
                    avatarURL: participant?.avatarURL,
                    isSelected: isSelected
                )
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(participant?.name ?? "Nepoznat igrač")
                        .font(.body.weight(.semibold))
                        .lineLimit(1)

                    SessionRecordSummary(
                        matches: performance.matchesPlayed,
                        wins: performance.wins,
                        draws: performance.draws,
                        losses: performance.losses
                    )
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                SessionFormBar(
                    matches: performance.matchesPlayed,
                    wins: performance.wins,
                    draws: performance.draws,
                    losses: performance.losses
                )
                .frame(width: 56, height: 8)

                SessionEloResult(
                    eloAfter: performance.eloAfter,
                    changeText: eloChangeText,
                    changeColor: eloColor
                )
            }
            .padding(.vertical, 13)
            .contentShape(.rect)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(participant?.name ?? "Nepoznat igrač"), mesto \(rank), "
                + "\(performance.wins) pobeda, \(performance.draws) nerešenih, "
                + "\(performance.losses) poraza, \(eloChangeText) Elo"
        )
        .accessibilityHint(
            isSelected
                ? "Dodirnite da prikažete sve mečeve"
                : "Dodirnite da prikažete samo mečeve ovog igrača"
        )
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct TeamPerformanceTableRow: View {
    let rank: Int
    let performance: SessionTeamPerformance

    private var eloChangeText: String {
        let rounded = Int(performance.eloChange.rounded())
        return rounded > 0 ? "+\(rounded)" : "\(rounded)"
    }

    private var eloColor: Color {
        if performance.eloChange > 0 { return GweiloTheme.lime }
        if performance.eloChange < 0 { return GweiloTheme.coral }
        return .secondary
    }

    var body: some View {
        HStack(spacing: 8) {
            SessionRankedTeamAvatar(rank: rank, performance: performance)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(performance.name)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)

                SessionRecordSummary(
                    matches: performance.matchesPlayed,
                    wins: performance.wins,
                    draws: performance.draws,
                    losses: performance.losses
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SessionFormBar(
                matches: performance.matchesPlayed,
                wins: performance.wins,
                draws: performance.draws,
                losses: performance.losses
            )
            .frame(width: 56, height: 8)

            SessionEloResult(
                eloAfter: performance.eloAfter,
                changeText: eloChangeText,
                changeColor: eloColor
            )
        }
        .padding(.vertical, 13)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(performance.name), mesto \(rank), "
                + "\(performance.wins) pobeda, \(performance.draws) nerešenih, "
                + "\(performance.losses) poraza, \(eloChangeText) Elo"
        )
    }
}

private struct SessionRankedPlayerAvatar: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let rank: Int
    let name: String
    let initials: String
    let avatarURL: URL?
    let isSelected: Bool

    var body: some View {
        PlayerIdentityAvatar(
            name: name,
            initials: initials,
            avatarURL: avatarURL,
            size: 38
        )
        .background {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            GweiloTheme.cyan,
                            GweiloTheme.lime
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .blur(radius: 6)
                .scaleEffect(1.14)
                .opacity(isSelected ? 0.42 : 0)
        }
        .overlay {
            Circle()
                .stroke(
                    LinearGradient(
                        colors: [
                            GweiloTheme.cyan,
                            GweiloTheme.lime.opacity(0.82)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1.4
                )
                .padding(-1.5)
                .opacity(isSelected ? 1 : 0)
        }
        .scaleEffect(isSelected && !reduceMotion ? 1.04 : 1)
        .overlay(alignment: .topLeading) {
            SessionRankBadge(rank: rank)
                .offset(x: -4, y: -4)
        }
        .padding(.leading, 2)
    }
}

private struct SessionRankedTeamAvatar: View {
    let rank: Int
    let performance: SessionTeamPerformance

    var body: some View {
        ZStack {
            PlayerIdentityAvatar(
                name: performance.playerOneName,
                initials: initials(for: performance.playerOneName),
                avatarURL: performance.playerOneAvatarURL,
                size: 32
            )
            .offset(x: -7)

            PlayerIdentityAvatar(
                name: performance.playerTwoName,
                initials: initials(for: performance.playerTwoName),
                avatarURL: performance.playerTwoAvatarURL,
                size: 32
            )
            .offset(x: 7)
        }
        .frame(width: 46, height: 38)
        .overlay(alignment: .topLeading) {
            SessionRankBadge(rank: rank)
                .offset(x: -4, y: -4)
        }
        .padding(.leading, 2)
    }

    private func initials(for name: String) -> String {
        name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}

private struct SessionRankBadge: View {
    let rank: Int

    @ViewBuilder
    var body: some View {
        switch rank {
        case 1...3:
            RankPlacementBadge(rank: rank)
        default:
            Text("\(rank)")
                .font(
                    GweiloTheme.labelFont(size: 10, relativeTo: .caption2)
                        .monospacedDigit()
                )
                .foregroundStyle(GweiloTheme.bone)
                .padding(.horizontal, 4)
                .frame(minWidth: 17, minHeight: 17)
                .background(GweiloTheme.raisedSurface, in: .capsule)
                .overlay {
                    Capsule()
                        .stroke(
                            GweiloTheme.background.opacity(0.88),
                            lineWidth: 1.5
                        )
                }
        }
    }
}

private struct SessionRecordSummary: View {
    let matches: Int
    let wins: Int
    let draws: Int
    let losses: Int

    var body: some View {
        HStack(spacing: 2) {
            Text("\(matches)")
                .foregroundStyle(.secondary)
            Text("\(wins)")
                .foregroundStyle(GweiloTheme.lime)
            Text("–")
                .foregroundStyle(.secondary)
            Text("\(draws)")
                .foregroundStyle(GweiloTheme.amber)
            Text("–")
                .foregroundStyle(.secondary)
            Text("\(losses)")
                .foregroundStyle(GweiloTheme.coral)
        }
        .font(.caption2.monospacedDigit())
        .lineLimit(1)
    }
}

private struct SessionEloResult: View {
    let eloAfter: Double?
    let changeText: String
    let changeColor: Color

    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(eloAfter.map { "\(Int($0.rounded()))" } ?? "—")
                .font(
                    GweiloTheme.displayFont(size: 19, relativeTo: .body)
                        .monospacedDigit()
                )
                .foregroundStyle(GweiloTheme.bone)

            Text(changeText)
                .font(.caption2.monospacedDigit().weight(.bold))
                .foregroundStyle(changeColor)
        }
        .fixedSize(horizontal: true, vertical: false)
        .frame(width: 60, alignment: .trailing)
    }
}

private struct SessionFormBar: View {
    let matches: Int
    let wins: Int
    let draws: Int
    let losses: Int

    private var colors: [Color] {
        let recordedResults = wins + draws + losses
        let unrecordedMatches = max(0, matches - recordedResults)

        return Array(repeating: GweiloTheme.lime, count: wins)
            + Array(repeating: GweiloTheme.amber, count: draws)
            + Array(repeating: GweiloTheme.coral, count: losses)
            + Array(repeating: GweiloTheme.surface, count: unrecordedMatches)
    }

    private var gradient: LinearGradient {
        let resultColors = colors.isEmpty ? [GweiloTheme.surface] : colors
        var stops = [
            Gradient.Stop(color: resultColors[0], location: 0)
        ]

        if resultColors.count > 1 {
            for index in 0..<(resultColors.count - 1) {
                let boundary = Double(index + 1) / Double(resultColors.count)
                stops.append(
                    Gradient.Stop(
                        color: resultColors[index],
                        location: max(0, boundary - 0.1)
                    )
                )
                stops.append(
                    Gradient.Stop(
                        color: resultColors[index + 1],
                        location: min(1, boundary + 0.1)
                    )
                )
            }
        }

        stops.append(
            Gradient.Stop(
                color: resultColors[resultColors.count - 1],
                location: 1
            )
        )

        return LinearGradient(
            gradient: Gradient(stops: stops),
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(gradient)
            .accessibilityHidden(true)
    }
}

private struct PlayerRoster: View {
    let participants: [SessionParticipant]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(title: "Igrači", value: "\(participants.count)")

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
                                        .foregroundStyle(GweiloTheme.background)
                                        .frame(width: 18, height: 18)
                                        .background(GweiloTheme.lime, in: .rect(cornerRadius: 3))
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
            SectionLabel(
                title: detail.session.status == .completed
                    ? "Rezultati mečeva"
                    : "Prethodne runde",
                value: "\(rounds.count) RUNDI"
            )

            if rounds.isEmpty {
                Text("Prethodne runde će se pojaviti ovde.")
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

private struct HalfSessionMatchResults: View {
    let matches: [SessionMatch]
    let detail: SessionDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(
                title: "Rezultati mečeva",
                value: "\(matches.count) MEČEVA"
            )

            LazyVStack(spacing: 10) {
                ForEach(matches) { match in
                    ScoreboardMatch(
                        match: match,
                        detail: detail,
                        emphasis: false
                    )
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Konačni rezultati mečeva")
    }
}

private struct PlayerSessionMatchResults: View {
    let participant: SessionParticipant
    let matches: [SessionMatch]
    let singlesPerformance: SessionPlayerPerformance?
    let doublesPerformance: SessionPlayerPerformance?
    let detail: SessionDetail
    let clearSelection: () -> Void
    private let profileResultsByMatchID: [UUID: PlayerEloHistoryPoint]

    init(
        participant: SessionParticipant,
        matches: [SessionMatch],
        singlesPerformance: SessionPlayerPerformance?,
        doublesPerformance: SessionPlayerPerformance?,
        detail: SessionDetail,
        clearSelection: @escaping () -> Void
    ) {
        self.participant = participant
        self.matches = matches
        self.singlesPerformance = singlesPerformance
        self.doublesPerformance = doublesPerformance
        self.detail = detail
        self.clearSelection = clearSelection
        profileResultsByMatchID = detail.playerProfileResults(
            for: matches,
            selectedPlayerID: participant.id
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(
                title: "Mečevi igrača",
                value: "\(matches.count) MEČEVA"
            )

            SelectedSessionPlayerHeader(
                participant: participant,
                singlesPerformance: singlesPerformance,
                doublesPerformance: doublesPerformance,
                clearSelection: clearSelection
            )

            if matches.isEmpty {
                Text("Nema mečeva za izabranog igrača.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(matches) { match in
                        PlayerProfileMatchResultRow(
                            result: profileResult(for: match)
                        )

                        if match.id != matches.last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Mečevi igrača \(participant.name)")
    }

    private func profileResult(
        for match: SessionMatch
    ) -> PlayerEloHistoryPoint {
        profileResultsByMatchID[match.id]
            ?? detail.playerProfileResult(
                for: match,
                selectedPlayerID: participant.id,
                eloAfter: nil,
                eloDelta: nil
            )
    }
}

private struct SelectedSessionPlayerHeader: View {
    let participant: SessionParticipant
    let singlesPerformance: SessionPlayerPerformance?
    let doublesPerformance: SessionPlayerPerformance?
    let clearSelection: () -> Void

    @ScaledMetric(relativeTo: .body) private var avatarSize: CGFloat = 44

    var body: some View {
        HStack(spacing: 12) {
            PlayerIdentityAvatar(
                name: participant.name,
                initials: participant.initials,
                avatarURL: participant.avatarURL,
                size: avatarSize
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(participant.name)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)

                Text(summaryText)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button("Svi", systemImage: "xmark") {
                clearSelection()
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityHint("Uklanja filter igrača")
        }
        .padding(.vertical, 2)
    }

    private var summaryText: String {
        let summaries = [
            singlesPerformance.map { summary(for: $0, label: "Singl") },
            doublesPerformance.map { summary(for: $0, label: "Dubl") }
        ]
        .compactMap { $0 }
        return summaries.isEmpty
            ? "ELO nije dostupan"
            : summaries.joined(separator: " · ")
    }

    private func summary(
        for performance: SessionPlayerPerformance,
        label: String
    ) -> String {
        guard let eloAfter = performance.eloAfter,
              let eloChange = performance.eloChange
        else {
            return "\(label) bez ELO-a"
        }
        let value = Int(eloChange.rounded())
        let change = value > 0 ? "+\(value)" : "\(value)"
        return "\(label) \(Int(eloAfter.rounded())) (\(change))"
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
        if singles > 0 {
            parts.append("\(singles) \(matchWord(singles, singular: "singl", plural: "singla"))")
        }
        if doubles > 0 {
            parts.append("\(doubles) \(matchWord(doubles, singular: "dubl", plural: "dubla"))")
        }
        return parts.joined(separator: " · ")
    }

    private func matchWord(
        _ count: Int,
        singular: String,
        plural: String
    ) -> String {
        count == 1 ? singular : plural
    }

    var body: some View {
        VStack(spacing: 0) {
            Button(action: action) {
                HStack(spacing: 13) {
                    Text("\(round.number)")
                        .font(GweiloTheme.labelFont(size: 15, relativeTo: .subheadline).monospacedDigit())
                        .foregroundStyle(
                            isComplete ? GweiloTheme.bone : GweiloTheme.lime
                        )
                        .frame(width: 32, height: 32)
                        .background(
                            isComplete
                                ? GweiloTheme.surface
                                : GweiloTheme.accent.opacity(0.26),
                            in: .rect(cornerRadius: 4)
                        )

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Runda \(round.number)")
                            .font(.body.weight(.semibold))
                        Text(matchSummary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(isComplete ? "ZAVRŠENO" : "NA ČEKANJU")
                        .font(.caption2.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(isComplete ? .secondary : GweiloTheme.lime)

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
                "Runda \(round.number), \(matchSummary), \(isComplete ? "završena" : "na čekanju")"
            )
            .accessibilityValue(isExpanded ? "Prošireno" : "Skupljeno")

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

    @ScaledMetric(relativeTo: .body) private var outcomeSize: CGFloat = 30

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

    private var teamOneOutcome: MatchOutcome? {
        outcome(
            score: match.teamOneScore,
            opponentScore: match.teamTwoScore
        )
    }

    private var teamTwoOutcome: MatchOutcome? {
        outcome(
            score: match.teamTwoScore,
            opponentScore: match.teamOneScore
        )
    }

    private var teamOneName: String {
        teamOneIDs.map { detail.name(for: $0) }.joined(separator: " + ")
    }

    private var teamTwoName: String {
        teamTwoIDs.map { detail.name(for: $0) }.joined(separator: " + ")
    }

    private var accessibilityResult: String {
        let teamOneScore = match.teamOneScore.map(String.init) ?? "bez rezultata"
        let teamTwoScore = match.teamTwoScore.map(String.init) ?? "bez rezultata"
        let rating = match.isRated ? "" : ", bez ELO-a"
        return "\(teamOneName), \(teamOneScore), protiv \(teamTwoScore), \(teamTwoName)\(rating)"
    }

    var body: some View {
        GweiloCard(
            style: emphasis ? .live : .neutral,
            contentPadding: 12
        ) {
            HStack(spacing: 10) {
                Text(teamOneName)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                outcomeArtwork(teamOneOutcome)

                score(match.teamOneScore, outcome: teamOneOutcome)

                Text("VS")
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(GweiloTheme.muted)

                score(match.teamTwoScore, outcome: teamTwoOutcome)

                outcomeArtwork(teamTwoOutcome)

                Text(teamTwoName)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if !match.isRated {
                    Image(systemName: "bolt.slash.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .accessibilityLabel("Bez ELO-a")
                }
            }
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.68)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityResult)
    }

    @ViewBuilder
    private func outcomeArtwork(_ outcome: MatchOutcome?) -> some View {
        if let outcome {
            MatchOutcomeArtwork(outcome: outcome, size: outcomeSize)
        } else {
            Color.clear
                .frame(width: outcomeSize, height: outcomeSize)
                .accessibilityHidden(true)
        }
    }

    private func score(
        _ value: Int?,
        outcome: MatchOutcome?
    ) -> some View {
        Text(value.map(String.init) ?? "—")
            .font(
                GweiloTheme.displayFont(size: 24, relativeTo: .title3)
                    .monospacedDigit()
            )
            .foregroundStyle(
                outcome == .win ? GweiloTheme.lime : GweiloTheme.bone
            )
            .frame(minWidth: 26)
    }

    private func outcome(
        score: Int?,
        opponentScore: Int?
    ) -> MatchOutcome? {
        guard let score, let opponentScore else { return nil }
        if score > opponentScore { return .win }
        if score < opponentScore { return .loss }
        return .draw
    }
}

struct RestingLine: View {
    let players: [SessionParticipant]

    var body: some View {
        if !players.isEmpty {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "pause.fill")
                    .font(.caption2)
                Text("Odmaraju")
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
                .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                .tracking(1.6)
                .foregroundStyle(GweiloTheme.accentBright)
            Spacer()
            Text(value)
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}

private struct SessionDetailError: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Termin nije učitan", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Pokušaj ponovo") {
                Task { await retry() }
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

#if DEBUG
struct SessionDetailPreviewScreen: View {
    private let detail = SessionDetail.preview

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        if let currentRound = detail.rounds.first(
                            where: { $0.number == detail.session.currentRound }
                        ) {
                            ScoreEntryView(
                                round: currentRound,
                                detail: detail,
                                submit: { _ in
                                    try await Task.sleep(for: .milliseconds(700))
                                    return RoundSubmissionResult(
                                        success: true,
                                        message: "Runda je sačuvana",
                                        ratingsDeferred: false,
                                        ratingsApplied: true,
                                        combinedWithRound: nil
                                    )
                                }
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 48)
                }
                .scrollIndicators(.hidden)
            }
            .navigationTitle("Termin")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

extension SessionDetail {
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
        let currentDoublesMatchID = UUID()
        let currentSinglesMatchID = UUID()
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
                        id: currentDoublesMatchID,
                        roundNumber: 3,
                        type: .doubles,
                        order: 0,
                        playerIDs: [ids[0], ids[1], ids[2], ids[3]],
                        isCompleted: false,
                        teamOneScore: nil,
                        teamTwoScore: nil,
                        eloPrediction: MatchEloPrediction(
                            matchId: currentDoublesMatchID,
                            ratingType: "team",
                            team1: EloSidePrediction(
                                rating: 1_640,
                                win: 13.25,
                                draw: -2.75,
                                loss: -18.75
                            ),
                            team2: EloSidePrediction(
                                rating: 1_580,
                                win: 18.75,
                                draw: 2.75,
                                loss: -13.25
                            )
                        )
                    ),
                    SessionMatch(
                        id: currentSinglesMatchID,
                        roundNumber: 3,
                        type: .singles,
                        order: 1,
                        playerIDs: [ids[4], ids[5]],
                        isCompleted: false,
                        teamOneScore: nil,
                        teamTwoScore: nil,
                        eloPrediction: MatchEloPrediction(
                            matchId: currentSinglesMatchID,
                            ratingType: "singles",
                            team1: EloSidePrediction(
                                rating: 1_494,
                                win: 5.58,
                                draw: -6.42,
                                loss: -18.42
                            ),
                            team2: EloSidePrediction(
                                rating: 1_287,
                                win: 30.7,
                                draw: 10.7,
                                loss: -9.3
                            )
                        )
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
            singlesPerformance: [],
            doublesPlayerPerformance: [],
            doublesTeamPerformance: [],
            rounds: rounds
        )
    }()
}
#endif
