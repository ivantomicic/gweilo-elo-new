import SwiftUI

struct SessionsView: View {
    let dataStore: AppDataStore
    let requestedSessionID: UUID?
    let didOpenRequestedSession: (UUID) -> Void
    @Binding var activeSessionDetailIsPresented: Bool
    @State private var navigationPath = NavigationPath()

    init(
        dataStore: AppDataStore,
        requestedSessionID: UUID? = nil,
        activeSessionDetailIsPresented: Binding<Bool> = .constant(false),
        didOpenRequestedSession: @escaping (UUID) -> Void = { _ in }
    ) {
        self.dataStore = dataStore
        self.requestedSessionID = requestedSessionID
        self._activeSessionDetailIsPresented =
            activeSessionDetailIsPresented
        self.didOpenRequestedSession = didOpenRequestedSession
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                ArenaBackground()

                if dataStore.isLoading, dataStore.sessions.isEmpty {
                    GweiloFullScreenLoadingView("Učitavam termine…")
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 26) {
                            SessionsHeader()
                            SessionsContent(dataStore: dataStore)
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 110)
                    }
                    .refreshable {
                        await dataStore.load()
                    }
                    .scrollIndicators(.hidden)
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: SessionSummary.self) { session in
                SessionDetailView(
                    session: session,
                    dataStore: dataStore
                )
                .onAppear {
                    updateActiveSessionDetailVisibility(for: session.id)
                }
                .onChange(of: dataStore.activeSession?.id) {
                    updateActiveSessionDetailVisibility(for: session.id)
                }
                .onDisappear {
                    activeSessionDetailIsPresented = false
                }
            }
            .task(id: requestedSessionID) {
                await openRequestedSession()
            }
        }
    }

    private func openRequestedSession() async {
        guard let requestedSessionID else { return }
        var requestedSession = dataStore.sessions.first {
            $0.id == requestedSessionID
        }
        if requestedSession == nil {
            await dataStore.load()
            requestedSession = dataStore.sessions.first {
                $0.id == requestedSessionID
            }
        }
        guard let requestedSession else { return }
        navigationPath = NavigationPath()
        navigationPath.append(requestedSession)
        didOpenRequestedSession(requestedSessionID)
    }

    private func updateActiveSessionDetailVisibility(for sessionID: UUID) {
        activeSessionDetailIsPresented = dataStore.activeSession?.id == sessionID
    }
}

private struct SessionsHeader: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Text("ISTORIJA MEČEVA")
                    .font(
                        GweiloTheme.labelFont(
                            size: 12,
                            relativeTo: .caption
                        )
                    )
                    .tracking(2)
                    .foregroundStyle(GweiloTheme.lime)

                Text("Termini")
                    .font(
                        GweiloTheme.displayFont(
                            size: 46,
                            relativeTo: .largeTitle
                        )
                    )
                    .textCase(.uppercase)
                    .tracking(0.2)
            }

            Spacer(minLength: 0)

            Color.clear
                .frame(width: 112, height: 104)
                .overlay(alignment: .topTrailing) {
                    LoopingBundleVideo(
                        resourceName: "SessionsHeader",
                        isPlaying: scenePhase == .active && !reduceMotion
                    )
                    .frame(width: 148, height: 148)
                    .blendMode(.screen)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .offset(x: 10, y: -42)
                }
        }
        .frame(minHeight: 104, alignment: .top)
        .padding(.top, 18)
    }
}

private struct SessionsContent: View {
    let dataStore: AppDataStore

    private var activeSessions: [SessionSummary] {
        dataStore.sessions.filter { $0.status == .active }
    }

    private var historyGroups: [SessionMonthGroup] {
        let calendar = Calendar.autoupdatingCurrent
        let completedSessions = dataStore.sessions.filter {
            $0.status == .completed
        }
        let grouped = Dictionary(grouping: completedSessions) { session in
            calendar.date(
                from: calendar.dateComponents(
                    [.year, .month],
                    from: session.createdAt
                )
            ) ?? session.createdAt
        }

        return grouped
            .map { monthStart, sessions in
                SessionMonthGroup(
                    monthStart: monthStart,
                    sessions: sessions.sorted { $0.createdAt > $1.createdAt }
                )
            }
            .sorted { $0.monthStart > $1.monthStart }
    }

    var body: some View {
        if let errorMessage = dataStore.errorMessage,
           dataStore.sessions.isEmpty {
            ContentUnavailableView {
                Label("Termini nisu učitani", systemImage: "wifi.exclamationmark")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Pokušaj ponovo") {
                    Task { await dataStore.load() }
                }
                .buttonStyle(.borderedProminent)
            }
        } else if dataStore.sessions.isEmpty {
            ContentUnavailableView(
                "Još nema termina",
                systemImage: "sportscourt",
                description: Text("Dodirni + da pokreneš prvi termin.")
            )
        } else {
            VStack(alignment: .leading, spacing: 30) {
                if let errorMessage = dataStore.errorMessage {
                    DataErrorNotice(
                        message: errorMessage,
                        retry: {
                            Task { await dataStore.load(forceRefresh: true) }
                        }
                    )
                }

                if !activeSessions.isEmpty {
                    VStack(spacing: 12) {
                        ForEach(activeSessions) { session in
                            ActiveSessionRecord(session: session)
                        }
                    }
                }

                ForEach(historyGroups) { group in
                    VStack(alignment: .leading, spacing: 12) {
                        SessionSectionHeader(
                            title: group.title,
                            detail: "\(group.sessions.count) \(SessionHistoryFormatter.sessionWord(group.sessions.count))"
                        )

                        ForEach(group.sessions) { session in
                            CompletedSessionCard(
                                session: session,
                                rankings: dataStore.singlesRankings
                            )
                        }
                    }
                }
            }
        }
    }
}

private struct SessionMonthGroup: Identifiable {
    let monthStart: Date
    let sessions: [SessionSummary]

    var id: Date { monthStart }
    var title: String {
        SessionHistoryFormatter.monthTitle(monthStart)
    }
}

private struct SessionSectionHeader: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(
                    GweiloTheme.labelFont(
                        size: 13,
                        relativeTo: .caption
                    )
                )
                .tracking(1.8)
                .foregroundStyle(GweiloTheme.accentBright)

            Spacer()

            Text(detail)
                .font(.caption.weight(.semibold))
                .tracking(0.5)
                .foregroundStyle(.secondary)
        }
    }
}

private struct ActiveSessionRecord: View {
    let session: SessionSummary

    private var currentRound: Int {
        max(session.currentRound ?? 1, 1)
    }

    private var progress: Double {
        guard session.totalRounds > 0 else { return 0 }
        return min(
            Double(currentRound) / Double(session.totalRounds),
            1
        )
    }

    var body: some View {
        NavigationLink(value: session) {
            GweiloCard(style: .live, minHeight: 148) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(SessionHistoryFormatter.fullDate(session.createdAt))
                        .font(
                            GweiloTheme.headingFont(
                                size: 20,
                                relativeTo: .title3
                            )
                        )
                        .foregroundStyle(GweiloTheme.bone)

                    VStack(alignment: .leading, spacing: 7) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("Runda \(currentRound)")
                                .font(
                                    GweiloTheme.headingFont(
                                        size: 24,
                                        relativeTo: .title2
                                    )
                                )

                            Text("od \(session.totalRounds)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)

                            Spacer(minLength: 10)

                            Text(
                                SessionHistoryFormatter.matchSummary(session)
                            )
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        }

                        GeometryReader { proxy in
                            ZStack(alignment: .leading) {
                                Capsule()
                                    .fill(Color.white.opacity(0.08))

                                Capsule()
                                    .fill(GweiloTheme.lime)
                                    .frame(
                                        width: proxy.size.width * progress
                                    )
                            }
                        }
                        .frame(height: 4)
                    }

                    HStack {
                        Label("Nastavi termin", systemImage: "play.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(GweiloTheme.lime)

                        Spacer()

                        Text("\(session.playerCount) igrača")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Otvara aktivni termin")
    }
}

enum CompletedSessionCardPresentation: Equatable {
    case compact
    case regular
}

struct CompletedSessionCard: View {
    let session: SessionSummary
    let rankings: [RankingEntry]
    let presentation: CompletedSessionCardPresentation

    init(
        session: SessionSummary,
        rankings: [RankingEntry],
        presentation: CompletedSessionCardPresentation = .regular
    ) {
        self.session = session
        self.rankings = rankings
        self.presentation = presentation
    }

    private var isCompact: Bool {
        presentation == .compact
    }

    private var bestRanking: RankingEntry? {
        ranking(named: session.bestPlayer)
    }

    private var worstRanking: RankingEntry? {
        ranking(named: session.worstPlayer)
    }

    var body: some View {
        NavigationLink(value: session) {
            GweiloCard(
                style: .neutral,
                minHeight: isCompact ? 120 : 128,
                contentPadding: isCompact ? 13 : 14
            ) {
                VStack(alignment: .leading, spacing: isCompact ? 6 : 7) {
                    Text(
                        SessionHistoryFormatter.cardDate(
                            session.createdAt
                        )
                    )
                    .font(
                        GweiloTheme.headingFont(
                            size: isCompact ? 18 : 20,
                            relativeTo: .title3
                        )
                    )
                    .foregroundStyle(GweiloTheme.bone)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                    Text(SessionHistoryFormatter.cardSummary(session))
                        .font(isCompact ? .caption2 : .caption)
                        .foregroundStyle(GweiloTheme.bone.opacity(0.58))
                        .lineLimit(1)
                        .minimumScaleFactor(0.76)

                    if let bestPlayer = session.bestPlayer,
                       let bestDelta = session.bestDelta {
                        HStack(spacing: 0) {
                            CompletedSessionPerformer(
                                name: bestPlayer,
                                delta: bestDelta,
                                ranking: bestRanking,
                                color: GweiloTheme.lime,
                                presentation: presentation
                            )
                            .padding(.trailing, 16)

                            if session.worstPlayer != nil,
                               session.worstDelta != nil {
                                Rectangle()
                                    .fill(GweiloTheme.hairline)
                                    .frame(
                                        width: 1,
                                        height: isCompact ? 31 : 38
                                    )
                            }

                            if let worstPlayer = session.worstPlayer,
                               let worstDelta = session.worstDelta {
                                CompletedSessionPerformer(
                                    name: worstPlayer,
                                    delta: worstDelta,
                                    ranking: worstRanking,
                                    color: GweiloTheme.coral,
                                    presentation: presentation
                                )
                                .padding(.leading, 16)
                            }
                        }
                        .padding(.top, isCompact ? 8 : 6)
                    } else if let worstPlayer = session.worstPlayer,
                              let worstDelta = session.worstDelta {
                        CompletedSessionPerformer(
                            name: worstPlayer,
                            delta: worstDelta,
                            ranking: worstRanking,
                            color: GweiloTheme.coral,
                            presentation: presentation
                        )
                        .padding(.top, isCompact ? 8 : 6)
                    }
                }
                .frame(
                    maxWidth: .infinity,
                    maxHeight: .infinity,
                    alignment: .topLeading
                )
            }
            .contentShape(.rect)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Otvara završeni termin")
    }

    private func ranking(named name: String?) -> RankingEntry? {
        guard let name else { return nil }
        return rankings.first {
            $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame
        }
    }
}

private struct CompletedSessionPerformer: View {
    let name: String
    let delta: Int
    let ranking: RankingEntry?
    let color: Color
    let presentation: CompletedSessionCardPresentation

    private var isCompact: Bool {
        presentation == .compact
    }

    var body: some View {
        HStack(spacing: isCompact ? 6 : 8) {
            PlayerIdentityAvatar(
                name: name,
                initials: ranking?.initials ?? initials,
                avatarURL: ranking?.avatarURL,
                size: isCompact ? 29 : 35
            )

            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(
                        isCompact
                            ? .caption2.weight(.semibold)
                            : .caption.weight(.semibold)
                    )
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Text(delta > 0 ? "+\(delta) Elo" : "\(delta) Elo")
                    .font(
                        isCompact
                            ? .caption2.weight(.bold)
                            : .caption.weight(.bold)
                    )
                    .monospacedDigit()
                    .foregroundStyle(color)
            }
        }
    }

    private var initials: String {
        name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}

private enum SessionHistoryFormatter {
    static let locale = Locale(identifier: "sr_Latn_RS")

    static func monthTitle(_ date: Date) -> String {
        date.formatted(
            .dateTime
                .month(.wide)
                .year()
                .locale(locale)
        )
        .uppercased()
    }

    static func cardDate(_ date: Date) -> String {
        date.formatted(
            .dateTime
                .weekday(.wide)
                .day()
                .month(.wide)
                .locale(locale)
        )
        .replacingOccurrences(of: ".", with: "")
        .capitalized(with: locale)
    }

    static func fullDate(_ date: Date) -> String {
        date.formatted(
            .dateTime
                .weekday(.wide)
                .day()
                .month(.wide)
                .locale(locale)
        )
    }

    static func matchSummary(_ session: SessionSummary) -> String {
        var values: [String] = []
        if session.singlesMatches > 0 {
            values.append(
                "\(session.singlesMatches) \(singlesWord(session.singlesMatches))"
            )
        }
        if session.doublesMatches > 0 {
            values.append(
                "\(session.doublesMatches) \(doublesWord(session.doublesMatches))"
            )
        }
        return values.joined(separator: " · ")
    }

    static func cardSummary(_ session: SessionSummary) -> String {
        let matches = matchSummary(session)
        guard !matches.isEmpty else {
            return "\(session.playerCount) igrača"
        }
        return "\(session.playerCount) igrača · \(matches)"
    }

    static func sessionWord(_ value: Int) -> String {
        pluralized(value, one: "termin", few: "termina", many: "termina")
    }

    private static func singlesWord(_ value: Int) -> String {
        pluralized(value, one: "singl", few: "singla", many: "singlova")
    }

    private static func doublesWord(_ value: Int) -> String {
        pluralized(value, one: "dubl", few: "dubla", many: "dublova")
    }

    private static func pluralized(
        _ value: Int,
        one: String,
        few: String,
        many: String
    ) -> String {
        let lastTwo = abs(value) % 100
        let last = abs(value) % 10
        if last == 1, lastTwo != 11 {
            return one
        }
        if (2...4).contains(last), !(12...14).contains(lastTwo) {
            return few
        }
        return many
    }
}

struct StartSessionView: View {
    private enum Step {
        case setup
        case review

        var title: String {
            switch self {
            case .setup: "Novi termin"
            case .review: "Raspored"
            }
        }
    }

    @Environment(\.dismiss) private var dismiss
    let dataStore: AppDataStore
    let onCreated: (SessionSummary) -> Void
    private let previewMode: Bool

    @State private var step = Step.setup
    @State private var draft = SessionCreationDraft()
    @State private var selectedPlayerCount: Int?
    @State private var availablePlayers: [SessionCreationPlayer] = []
    @State private var preview: SessionSchedulePreview?
    @State private var isLoadingPlayers = true
    @State private var isPreparingSchedule = false
    @State private var isCreating = false
    @State private var errorMessage: String?

    init(
        dataStore: AppDataStore,
        previewMode: Bool = false,
        onCreated: @escaping (SessionSummary) -> Void = { _ in }
    ) {
        self.dataStore = dataStore
        self.previewMode = previewMode
        self.onCreated = onCreated

        if previewMode {
            _step = State(initialValue: .setup)
            _availablePlayers = State(
                initialValue: SessionCreationPlayer.previewPlayers
            )
            _isLoadingPlayers = State(initialValue: false)
        } else if dataStore.hasLoadedAvailableSessionPlayers {
            _availablePlayers = State(
                initialValue: dataStore.cachedAvailableSessionPlayers
            )
            _isLoadingPlayers = State(initialValue: false)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                Group {
                    switch step {
                    case .setup:
                        SessionSetupStep(
                            draft: $draft,
                            selectedPlayerCount: $selectedPlayerCount,
                            players: availablePlayers,
                            isLoading: isLoadingPlayers
                        )
                    case .review:
                        SessionReviewStep(
                            draft: draft,
                            preview: preview,
                            isRandomizing: isPreparingSchedule,
                            randomize: {
                                Task { await prepareSchedule(showReview: false) }
                            }
                        )
                    }
                }
            }
            .navigationTitle(step.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if step == .setup {
                        Button("Zatvori", action: dismiss.callAsFunction)
                    } else {
                        Button("Nazad", systemImage: "chevron.left", action: goBack)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                SessionCreationFooter(
                    title: footerTitle,
                    isWorking: isPreparingSchedule || isCreating,
                    isEnabled: canContinue,
                    action: continueFlow
                )
            }
            .task {
                if !previewMode,
                   !dataStore.hasLoadedAvailableSessionPlayers {
                    await loadPlayers()
                }
            }
            .alert("Nije moguće nastaviti", isPresented: showsErrorBinding) {
                Button("U redu", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Pokušaj ponovo.")
            }
        }
        .preferredColorScheme(.dark)
    }

    private var showsErrorBinding: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    private var footerTitle: String {
        switch step {
        case .setup: "Napravi raspored"
        case .review: "Pokreni termin"
        }
    }

    private var canContinue: Bool {
        switch step {
        case .setup:
            selectedPlayerCount != nil
                && draft.canPreview
                && !isLoadingPlayers
        case .review:
            preview != nil
        }
    }

    private func goBack() {
        withAnimation(.smooth) {
            step = .setup
        }
    }

    private func continueFlow() {
        guard canContinue, !isPreparingSchedule, !isCreating else { return }
        switch step {
        case .setup:
            Task { await prepareSchedule() }
        case .review:
            Task { await createSession() }
        }
    }

    private func loadPlayers() async {
        isLoadingPlayers = true
        defer { isLoadingPlayers = false }
        do {
            availablePlayers = try await dataStore.availableSessionPlayers()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func prepareSchedule(showReview: Bool = true) async {
        isPreparingSchedule = true
        defer { isPreparingSchedule = false }
        do {
            if !showReview,
               let preview,
               draft.keepsMixedScheduleOrder {
                self.preview = SessionScheduleRandomizer
                    .preservingFixedTeams(in: preview)
            } else {
                let requestedPlayers = draft.keepsMixedScheduleOrder
                    ? draft.selectedPlayers
                    : draft.selectedPlayers.shuffled()
                let serverPreview = try await dataStore.previewSession(
                    players: requestedPlayers,
                    format: draft.selectedFormat
                )
                preview = draft.keepsMixedScheduleOrder
                    ? SessionScheduleRandomizer.preservingFixedTeams(
                        in: serverPreview
                    )
                    : serverPreview
            }
            if showReview {
                withAnimation(.smooth) { step = .review }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createSession() async {
        guard let preview else { return }
        isCreating = true
        defer { isCreating = false }
        do {
            let session = try await dataStore.createSession(
                from: draft,
                preview: preview
            )
            onCreated(session)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#if DEBUG
struct StartSessionPreviewScreen: View {
    private let dataStore = AppDataStore(
        configuration: AppConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            supabaseAnonKey: "preview",
            apiBaseURL: URL(string: "https://www.gweilo.lol")!
        ),
        session: AuthSession(
            accessToken: "preview",
            refreshToken: "preview",
            expiresIn: 3_600,
            expiresAt: nil,
            user: AuthenticatedUser(
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
                email: "preview@example.com"
            )
        )
    )

    var body: some View {
        StartSessionView(dataStore: dataStore, previewMode: true)
    }
}

private extension SessionCreationPlayer {
    static let previewPlayers = zip(
        (1...8).map {
            UUID(
                uuidString: String(
                    format: "00000000-0000-0000-0000-%012d",
                    $0
                )
            )!
        },
        [
            "Ivan", "Gara", "Leo", "Miladin",
            "Andrej", "Marie", "Bata Sena", "Nemanja"
        ]
    ).enumerated().map { index, pair in
        SessionCreationPlayer(
            id: pair.0,
            name: pair.1,
            avatarURL: nil,
            elo: 1_720 - index * 73
        )
    }
}
#endif

private struct SessionSetupStep: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var draft: SessionCreationDraft
    @Binding var selectedPlayerCount: Int?
    let players: [SessionCreationPlayer]
    let isLoading: Bool
    @Namespace private var playerTransition
    @State private var placeholderSheet: PlaceholderSheetToken?

    private var availablePlayers: [SessionCreationPlayer] {
        let selectedIDs = Set(draft.selectedPlayers.map(\.id))
        return players.filter { !selectedIDs.contains($0.id) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                SessionPlayerCountPicker(
                    playerCount: selectedPlayerCount,
                    selectionCount: draft.selectedPlayers.count,
                    select: selectPlayerCount
                )

                if let selectedPlayerCount {
                    if selectedPlayerCount == 4
                        || selectedPlayerCount == 6 {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("FORMAT")
                                .font(.caption.weight(.black))
                                .tracking(1.4)
                                .foregroundStyle(GweiloTheme.accentBright)

                            Picker(
                                "Format",
                                selection: selectedFormat
                            ) {
                                ForEach(FourPlayerSessionFormat.allCases) {
                                    format in
                                    Text(format.label)
                                        .tag(format)
                                }
                            }
                            .pickerStyle(.segmented)
                        }
                        .transition(
                            .opacity.combined(with: .move(edge: .top))
                        )
                    }

                    if isLoading {
                        GweiloLoadingView("Učitavam igrače…")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                    } else {
                        AvailableSessionPlayerRail(
                            players: availablePlayers,
                            isSelectionFull: draft.canPreview,
                            namespace: playerTransition,
                            selectPlayer: selectPlayer
                        )

                        Button(action: presentPlaceholderSheet) {
                            Label(
                                "Dodaj gosta",
                                systemImage: "person.badge.plus"
                            )
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(GweiloTheme.accentBright)
                        .disabled(draft.canPreview)
                        .accessibilityHint(
                            "Dodaje gosta bez naloga. Njegovi mečevi ne utiču na ELO."
                        )

                        if draft.usesDoublesTeams {
                            SessionDoublesTeamBuilder(
                                draft: $draft,
                                namespace: playerTransition,
                                reduceMotion: reduceMotion
                            )
                        } else {
                            SessionSelectedPlayerBuilder(
                                draft: $draft,
                                namespace: playerTransition,
                                reduceMotion: reduceMotion
                            )
                        }
                    }
                } else {
                    SessionPlayerCountPlaceholder()
                        .transition(.opacity)
                }
            }
            .padding(20)
            .padding(.bottom, 100)
        }
        .scrollIndicators(.hidden)
        .animation(.smooth, value: selectedPlayerCount)
        .sheet(item: $placeholderSheet) { _ in
            PlaceholderPlayerSheet(addPlayer: addPlaceholder)
        }
    }

    private func selectPlayerCount(_ count: Int) {
        guard selectedPlayerCount != count else { return }
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) {
            selectedPlayerCount = count
            draft.setPlayerCount(count)
        }
    }

    private func selectPlayer(_ player: SessionCreationPlayer) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) {
            draft.toggle(player)
        }
    }

    private func presentPlaceholderSheet() {
        placeholderSheet = PlaceholderSheetToken()
    }

    private func addPlaceholder(_ name: String) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) {
            draft.addPlaceholder(named: name)
        }
    }

    private var selectedFormat: Binding<FourPlayerSessionFormat> {
        Binding(
            get: {
                selectedPlayerCount == 6
                    ? draft.sixPlayerFormat
                    : draft.fourPlayerFormat
            },
            set: { format in
                if selectedPlayerCount == 6 {
                    draft.sixPlayerFormat = format
                } else {
                    draft.fourPlayerFormat = format
                }
            }
        )
    }
}

private struct PlaceholderSheetToken: Identifiable {
    let id = UUID()
}

private struct PlaceholderPlayerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @FocusState private var isNameFocused: Bool
    let addPlayer: (String) -> Void

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canAdd: Bool {
        !trimmedName.isEmpty && trimmedName.count <= 80
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Ime gosta", text: $name)
                        .focused($isNameFocused)
                        .textInputAutocapitalization(.words)
                        .submitLabel(.done)
                        .onSubmit(addAndDismiss)
                } footer: {
                    Text(
                        "Mečevi će biti vidljivi u terminu, ali neće uticati na ELO ili statistiku. Najviše 80 znakova."
                    )
                }
            }
            .navigationTitle("Gost")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Otkaži", action: dismiss.callAsFunction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Dodaj", action: addAndDismiss)
                        .disabled(!canAdd)
                }
            }
            .task { isNameFocused = true }
        }
        .presentationDetents([.medium])
    }

    private func addAndDismiss() {
        guard canAdd else { return }
        addPlayer(trimmedName)
        dismiss()
    }
}

private struct SessionPlayerCountPicker: View {
    let playerCount: Int?
    let selectionCount: Int
    let select: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("BROJ IGRAČA")
                    .font(.caption.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(GweiloTheme.accentBright)

                Spacer()

                Text(selectionDetail)
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 4) {
                ForEach(2...6, id: \.self) { count in
                    Button {
                        select(count)
                    } label: {
                        Text("\(count)")
                            .font(.headline.monospacedDigit().weight(.bold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .foregroundStyle(
                                playerCount == count
                                    ? GweiloTheme.background
                                    : .primary
                            )
                            .background {
                                if playerCount == count {
                                    Capsule()
                                        .fill(GweiloTheme.lime)
                                }
                            }
                    }
                    .buttonStyle(ResponsiveButtonStyle())
                    .accessibilityLabel("\(count) igrača")
                    .accessibilityAddTraits(
                        playerCount == count ? .isSelected : []
                    )
                }
            }
            .padding(4)
            .background(
                GweiloTheme.raisedSurface,
                in: Capsule()
            )
            .overlay {
                Capsule()
                    .stroke(GweiloTheme.hairline, lineWidth: 1)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var selectionDetail: String {
        guard let playerCount else { return "IZABERI 2–6" }
        return "\(selectionCount)/\(playerCount) izabrano"
    }
}

private struct SessionPlayerCountPlaceholder: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        LoopingBundleVideo(
            resourceName: "SessionPlayerCountPlaceholder",
            isPlaying: scenePhase == .active && !reduceMotion
        )
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct PlayerRailScrollEdges: Equatable {
    let showsLeadingFade: Bool
    let showsTrailingFade: Bool

    static let hidden = PlayerRailScrollEdges(
        showsLeadingFade: false,
        showsTrailingFade: false
    )
}

private struct AvailableSessionPlayerRail: View {
    let players: [SessionCreationPlayer]
    let isSelectionFull: Bool
    let namespace: Namespace.ID
    let selectPlayer: (SessionCreationPlayer) -> Void
    @State private var scrollEdges = PlayerRailScrollEdges.hidden

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("DOSTUPNI IGRAČI")
                    .font(.caption.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(GweiloTheme.accentBright)

                Spacer()

                Text("DODIRNI ZA DODAVANJE")
                    .font(.system(size: 9, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(.secondary)
            }

            ZStack(alignment: .leading) {
                if players.isEmpty {
                    Label(
                        "Svi igrači su raspoređeni",
                        systemImage: "checkmark"
                    )
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(GweiloTheme.lime)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
                } else {
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 12) {
                            ForEach(players) { player in
                                AvailableSessionPlayerButton(
                                    player: player,
                                    isDisabled: isSelectionFull,
                                    namespace: namespace,
                                    action: { selectPlayer(player) }
                                )
                                .transition(
                                    .opacity.combined(
                                        with: .scale(scale: 0.96)
                                    )
                                )
                            }
                        }
                        .padding(.horizontal, 2)
                    }
                    .scrollIndicators(.hidden)
                    .onScrollGeometryChange(
                        for: PlayerRailScrollEdges.self
                    ) { geometry in
                        let offset = max(0, geometry.contentOffset.x)
                        let maximumOffset = max(
                            0,
                            geometry.contentSize.width
                                - geometry.containerSize.width
                        )
                        return PlayerRailScrollEdges(
                            showsLeadingFade: offset > 4,
                            showsTrailingFade: offset < maximumOffset - 4
                        )
                    } action: { _, newValue in
                        if scrollEdges != newValue {
                            scrollEdges = newValue
                        }
                    }
                    .overlay {
                        PlayerRailEdgeFades(edges: scrollEdges)
                    }
                    .transition(.opacity)
                }
            }
            .frame(height: 84)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Dostupni igrači")
    }
}

private struct PlayerRailEdgeFades: View {
    let edges: PlayerRailScrollEdges

    var body: some View {
        HStack(spacing: 0) {
            edgeFade(startPoint: .leading, endPoint: .trailing)
                .opacity(edges.showsLeadingFade ? 1 : 0)

            Spacer(minLength: 0)

            edgeFade(startPoint: .trailing, endPoint: .leading)
                .opacity(edges.showsTrailingFade ? 1 : 0)
        }
        .animation(.easeOut(duration: 0.15), value: edges)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func edgeFade(
        startPoint: UnitPoint,
        endPoint: UnitPoint
    ) -> some View {
        LinearGradient(
            colors: [
                GweiloTheme.background,
                GweiloTheme.background.opacity(0)
            ],
            startPoint: startPoint,
            endPoint: endPoint
        )
        .frame(width: 30)
    }
}

private struct AvailableSessionPlayerButton: View {
    let player: SessionCreationPlayer
    let isDisabled: Bool
    let namespace: Namespace.ID
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                PlayerIdentityAvatar(
                    name: player.name,
                    initials: player.initials,
                    avatarURL: player.avatarURL,
                    size: 56
                )
                .matchedGeometryEffect(id: player.id, in: namespace)

                Text(player.name)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
            }
            .frame(width: 68)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.4 : 1)
        .accessibilityLabel("Dodaj \(player.name)")
    }
}

private enum SessionDoublesTeam: Int, CaseIterable, Identifiable {
    case a
    case b
    case c

    var id: Self { self }

    var letter: String {
        switch self {
        case .a: "A"
        case .b: "B"
        case .c: "C"
        }
    }

    var startIndex: Int {
        rawValue * 2
    }
}

private struct SessionDoublesTeamBuilder: View {
    @Binding var draft: SessionCreationDraft
    let namespace: Namespace.ID
    let reduceMotion: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("DUBL TIMOVI")
                    .font(.caption.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(GweiloTheme.accentBright)

                Spacer()

                Text("\(draft.selectedPlayers.count)/6")
                    .font(.caption.monospacedDigit().weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 4)

            ForEach(SessionDoublesTeam.allCases) { team in
                SessionDoublesTeamRow(
                    team: team,
                    players: draft.doublesTeams[team.rawValue],
                    namespace: namespace,
                    removePlayer: { playerIndex in
                        removePlayer(at: team.startIndex + playerIndex)
                    }
                )
            }
        }
    }

    private func removePlayer(at index: Int) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) {
            draft.removeSelectedPlayer(at: index)
        }
    }
}

private struct SessionSelectedPlayerBuilder: View {
    @Binding var draft: SessionCreationDraft
    let namespace: Namespace.ID
    let reduceMotion: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("IZABRANI IGRAČI")
                    .font(.caption.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(GweiloTheme.accentBright)

                Spacer()

                Text(
                    "\(draft.selectedPlayers.count)/\(draft.playerCount)"
                )
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(.secondary)
            }
            .padding(.bottom, 4)

            ForEach(0..<draft.playerCount, id: \.self) { playerIndex in
                SessionSelectedPlayerRow(
                    player: draft.selectedPlayers.indices.contains(playerIndex)
                        ? draft.selectedPlayers[playerIndex]
                        : nil,
                    position: playerIndex + 1,
                    namespace: namespace,
                    remove: { removePlayer(at: playerIndex) }
                )
            }
        }
    }

    private func removePlayer(at index: Int) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) {
            draft.removeSelectedPlayer(at: index)
        }
    }
}

private struct SessionSelectedPlayerRow: View {
    let player: SessionCreationPlayer?
    let position: Int
    let namespace: Namespace.ID
    let remove: () -> Void

    var body: some View {
        SessionPlayerSlot(
            player: player,
            emptyLabel: "Igrač \(position)",
            namespace: namespace,
            remove: remove
        )
        .frame(height: 62)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}

private struct SessionDoublesTeamRow: View {
    let team: SessionDoublesTeam
    let players: [SessionCreationPlayer]
    let namespace: Namespace.ID
    let removePlayer: (Int) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(team.letter)
                .font(
                    GweiloTheme.displayFont(
                        size: 24,
                        relativeTo: .title3
                    )
                )
                .foregroundStyle(
                    players.count == 2
                        ? GweiloTheme.lime
                        : GweiloTheme.muted
                )
                .frame(width: 24)

            ForEach(0..<2, id: \.self) { playerIndex in
                SessionPlayerSlot(
                    player: players.indices.contains(playerIndex)
                        ? players[playerIndex]
                        : nil,
                    emptyLabel: "Igrač",
                    namespace: namespace,
                    remove: { removePlayer(playerIndex) }
                )

                if playerIndex == 0 {
                    Divider()
                        .frame(height: 38)
                }
            }
        }
        .frame(height: 66)
        .overlay(alignment: .bottom) {
            Divider()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tim \(team.letter)")
    }
}

private struct SessionPlayerSlot: View {
    let player: SessionCreationPlayer?
    let emptyLabel: String
    let namespace: Namespace.ID
    let remove: () -> Void

    var body: some View {
        Group {
            if let player {
                Button(action: remove) {
                    HStack(spacing: 8) {
                        PlayerIdentityAvatar(
                            name: player.name,
                            initials: player.initials,
                            avatarURL: player.avatarURL,
                            size: 42
                        )
                        .matchedGeometryEffect(id: player.id, in: namespace)

                        Text(player.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        Spacer(minLength: 0)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(ResponsiveButtonStyle())
                .accessibilityLabel("Ukloni \(player.name)")
                .transition(.opacity)
            } else {
                HStack(spacing: 8) {
                    Circle()
                        .strokeBorder(
                            GweiloTheme.hairline,
                            style: StrokeStyle(
                                lineWidth: 1,
                                dash: [3, 3]
                            )
                        )
                        .frame(width: 42, height: 42)
                        .overlay {
                            Image(systemName: "plus")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(GweiloTheme.muted)
                        }

                    Text(emptyLabel)
                        .font(.subheadline)
                        .foregroundStyle(GweiloTheme.muted)

                    Spacer(minLength: 0)
                }
                .accessibilityHidden(true)
                .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SessionReviewStep: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let draft: SessionCreationDraft
    let preview: SessionSchedulePreview?
    let isRandomizing: Bool
    let randomize: () -> Void
    @State private var shuffleTrigger = 0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                if let preview {
                    if draft.usesDoublesTeams {
                        SessionReviewTeams(
                            teams: draft.doublesTeams
                        )
                    }

                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(preview.rounds) { round in
                            if let phase = phaseHeader(before: round) {
                                SchedulePhaseHeader(
                                    title: phase.title,
                                    detail: phase.detail
                                )
                            }

                            ScheduleRoundCard(
                                round: round,
                                reduceMotion: reduceMotion
                            )
                        }
                    }
                } else {
                    GweiloLoadingView("Pravim raspored…")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                }
            }
            .padding(20)
            .padding(.bottom, 100)
        }
        .scrollIndicators(.hidden)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: shuffleSchedule) {
                    Image(systemName: "shuffle")
                        .rotationEffect(
                            .degrees(
                                reduceMotion
                                    ? 0
                                    : Double(shuffleTrigger) * 180
                            )
                        )
                        .animation(
                            reduceMotion
                                ? nil
                                : .smooth(duration: 0.24),
                            value: shuffleTrigger
                        )
                }
                .disabled(isRandomizing)
                .accessibilityLabel(randomizeTitle)
                .accessibilityHint(
                    draft.usesDoublesTeams
                        ? "Menja singl parove, ali čuva izabrane dubl timove"
                        : "Pravi drugačiji raspored mečeva"
                )
            }
        }
        .sensoryFeedback(.selection, trigger: shuffleTrigger)
    }

    private var randomizeTitle: String {
        draft.keepsMixedScheduleOrder
            ? "Promeni singl raspored"
            : "Promeni raspored"
    }

    private func phaseHeader(
        before round: SessionScheduleRound
    ) -> (title: String, detail: String?)? {
        switch (
            draft.playerCount,
            draft.selectedFormat,
            round.roundNumber
        ) {
        case (6, .mixed, 5):
            ("ZAVRŠNICA", nil)
        case (6, .singles, 1), (4, .singles, 1):
            ("PRVI DEO", nil)
        case (6, .singles, 6), (4, .singles, 4):
            ("DRUGI DEO", nil)
        case (4, .mixed, 1):
            ("SINGLOVI", "svako igra protiv svakoga")
        case (4, .mixed, 4):
            ("DUBLOVI", "svako igra sa svakim partnerom")
        default:
            nil
        }
    }

    private func shuffleSchedule() {
        shuffleTrigger += 1
        randomize()
    }
}

private struct SessionReviewTeams: View {
    let teams: [[SessionCreationPlayer]]

    private let colors = [
        GweiloTheme.lime,
        GweiloTheme.cyan,
        GweiloTheme.accentBright
    ]

    var body: some View {
        VStack(spacing: 12) {
            Text("DUBL PAROVI")
                .font(.caption2.weight(.black))
                .tracking(1.2)
                .foregroundStyle(.secondary)

            HStack(spacing: 0) {
                ForEach(Array(teams.enumerated()), id: \.offset) {
                    index,
                    team in
                    SessionReviewTeamCard(
                        index: index,
                        players: team,
                        color: colors[index]
                    )
                    .frame(maxWidth: .infinity)

                    if index < teams.count - 1 {
                        Divider()
                            .frame(height: 48)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct SessionReviewTeamCard: View {
    let index: Int
    let players: [SessionCreationPlayer]
    let color: Color

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: -8) {
                ForEach(players) { player in
                    PlayerIdentityAvatar(
                        name: player.name,
                        initials: player.initials,
                        avatarURL: player.avatarURL,
                        size: 30
                    )
                    .overlay {
                        Circle()
                            .stroke(GweiloTheme.background, lineWidth: 2)
                    }
                }
            }

            HStack(spacing: 4) {
                Text(teamLetter)
                    .font(.caption2.weight(.black))
                    .foregroundStyle(color)

                Text(players.map(\.name).joined(separator: " i "))
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Tim \(teamLetter), "
                + players.map(\.name).joined(separator: " i ")
        )
    }

    private var teamLetter: String {
        ["A", "B", "C"][index]
    }
}

private struct SchedulePhaseHeader: View {
    let title: String
    let detail: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.caption2.weight(.black))
                .tracking(1.2)
                .foregroundStyle(GweiloTheme.lime)

            if let detail {
                Text("·")
                    .foregroundStyle(.tertiary)

                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 18)
        .padding(.bottom, 6)
    }
}

private struct ScheduleRoundCard: View {
    let round: SessionScheduleRound
    let reduceMotion: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Runda \(round.roundNumber)")
                    .font(.headline.weight(.bold))

                if round.isDynamic == true {
                    Text("·")
                        .foregroundStyle(.tertiary)

                    Text("zavisi od rezultata")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(GweiloTheme.amber)
                } else {
                    Text("·")
                        .foregroundStyle(.tertiary)

                    Text("\(round.matchCount) \(matchCountLabel)")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)

            if round.isDynamic == true {
                DynamicRoundExplanation(roundNumber: round.roundNumber)
                    .padding(.bottom, 14)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(round.matches.enumerated()), id: \.offset) {
                        index,
                        match in
                        ScheduleMatchSlot(
                            match: match,
                            animationDelay: Double(index) * 0.025,
                            reduceMotion: reduceMotion
                        )

                        if index < round.matches.count - 1 {
                            Divider()
                        }
                    }
                }
            }
        }
        .overlay(alignment: .bottom) {
            Divider()
        }
        .padding(.bottom, 22)
        .accessibilityElement(children: .combine)
    }

    private var matchCountLabel: String {
        round.matchCount == 1 ? "meč" : "meča"
    }
}

private struct DynamicRoundExplanation: View {
    let roundNumber: Int

    var body: some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.bold))
                .multilineTextAlignment(.center)

            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: 320)
        .frame(maxWidth: .infinity)
    }

    private var title: String {
        roundNumber == 6
            ? "Parovi se određuju nakon 5. runde"
            : "Parovi se određuju nakon 6. runde"
    }

    private var detail: String {
        if roundNumber == 6 {
            return "Pobednički dubl ostaje zajedno protiv singl para. Poraženi igraju međusobni singl."
        }
        return "Poraženi dubl igra protiv singl para. Pobednički tim igra međusobni singl."
    }
}

private struct ScheduleMatchSlot: View {
    let match: SessionScheduleMatch
    let animationDelay: Double
    let reduceMotion: Bool

    var body: some View {
        ZStack {
            ScheduleMatchCard(match: match)
                .id(match)
                .transition(.opacity)
        }
        .animation(
            reduceMotion
                ? nil
                : .easeOut(duration: 0.18).delay(animationDelay),
            value: match
        )
    }
}

private struct ScheduleMatchCard: View {
    let match: SessionScheduleMatch

    var body: some View {
        VStack(spacing: 8) {
            if match.players.contains(where: \.isPlaceholder) {
                Label("Bez ELO-a", systemImage: "person.crop.circle.badge.clock")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.orange)
            }

            HStack(spacing: 8) {
                MatchSide(players: firstSide, alignment: .trailing)

                Text("VS")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(.secondary)
                    .frame(width: 20)

                MatchSide(players: secondSide, alignment: .leading)
            }
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(match.type == .doubles ? "Dubl" : "Singl"), "
                + "\(sideName(firstSide)) protiv \(sideName(secondSide))"
        )
    }

    private var firstSide: [SessionCreationPlayer] {
        match.type == .doubles
            ? Array(match.players.prefix(2))
            : Array(match.players.prefix(1))
    }

    private var secondSide: [SessionCreationPlayer] {
        match.type == .doubles
            ? Array(match.players.dropFirst(2).prefix(2))
            : Array(match.players.dropFirst(1).prefix(1))
    }

    private func sideName(_ players: [SessionCreationPlayer]) -> String {
        players.map(\.name).joined(separator: " i ")
    }
}

private struct MatchSide: View {
    let players: [SessionCreationPlayer]
    let alignment: HorizontalAlignment

    var body: some View {
        HStack(spacing: 7) {
            if alignment == .trailing {
                playerNames
                playerAvatars
            } else {
                playerAvatars
                playerNames
            }
        }
        .frame(
            maxWidth: .infinity,
            alignment: alignment == .trailing ? .trailing : .leading
        )
    }

    private var playerNames: some View {
        Text(players.map(\.name).joined(separator: " i "))
            .font(.caption.weight(.semibold))
            .multilineTextAlignment(
                alignment == .trailing ? .trailing : .leading
            )
            .lineLimit(2)
            .minimumScaleFactor(0.8)
    }

    private var playerAvatars: some View {
        HStack(spacing: -7) {
            ForEach(players) { player in
                PlayerIdentityAvatar(
                    name: player.name,
                    initials: player.initials,
                    avatarURL: player.avatarURL,
                    size: 30
                )
                .overlay {
                    Circle().stroke(
                        GweiloTheme.background,
                        lineWidth: 1.5
                    )
                }
            }
        }
    }
}

private struct SessionCreationFooter: View {
    let title: String
    let isWorking: Bool
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        actionButton
            .buttonStyle(
                GweiloPrimaryButtonStyle(
                    keepsColorWhenDisabled: true,
                    height: 50
                )
            )
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 10)
    }

    private var actionButton: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isWorking {
                    ProgressView()
                        .tint(GweiloTheme.background)
                } else {
                    Text(title)
                        .font(.headline.weight(.black))
                }
            }
        }
        .disabled(!isEnabled || isWorking)
    }
}
