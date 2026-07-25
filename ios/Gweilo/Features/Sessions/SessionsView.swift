import SwiftUI

struct SessionsView: View {
    let dataStore: AppDataStore
    let requestedSessionID: UUID?
    let didOpenRequestedSession: (UUID) -> Void
    @State private var navigationPath = NavigationPath()

    init(
        dataStore: AppDataStore,
        requestedSessionID: UUID? = nil,
        didOpenRequestedSession: @escaping (UUID) -> Void = { _ in }
    ) {
        self.dataStore = dataStore
        self.requestedSessionID = requestedSessionID
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
                            SessionsHeader(
                                isLoading: dataStore.isLoading,
                                refresh: {
                                    Task { await dataStore.load() }
                                }
                            )
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
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: SessionSummary.self) { session in
                SessionDetailView(
                    session: session,
                    dataStore: dataStore
                )
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
}
private struct SessionsHeader: View {
    let isLoading: Bool
    let refresh: () -> Void

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 5) {
                Text("MATCH HISTORY")
                    .font(
                        GweiloTheme.labelFont(
                            size: 12,
                            relativeTo: .caption
                        )
                    )
                    .tracking(2)
                    .foregroundStyle(GweiloTheme.lime)

                Text("Sessions")
                    .font(
                        GweiloTheme.displayFont(
                            size: 46,
                            relativeTo: .largeTitle
                        )
                    )
                    .textCase(.uppercase)
                    .tracking(0.2)
            }

            Spacer()

            HStack(spacing: 10) {
                Button(action: refresh) {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 42, height: 42)
                }
                .buttonStyle(.plain)
                .disabled(isLoading)
                .opacity(isLoading ? 0.45 : 1)
                .modifier(RefreshButtonSurface())
                .accessibilityLabel("Refresh sessions")
            }
        }
        .padding(.top, 18)
    }
}

private struct RefreshButtonSurface: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content
                .glassEffect(.regular.interactive(), in: .circle)
        } else {
            content
                .background(
                    GweiloTheme.surface(for: colorScheme),
                    in: .circle
                )
                .overlay {
                    Circle()
                        .stroke(
                            GweiloTheme.hairline(for: colorScheme),
                            lineWidth: 0.75
                        )
                }
        }
    }
}

private struct SessionsContent: View {
    let dataStore: AppDataStore

    var body: some View {
        if let errorMessage = dataStore.errorMessage,
           dataStore.sessions.isEmpty {
            ContentUnavailableView {
                Label("Couldn’t load sessions", systemImage: "wifi.exclamationmark")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Try again") {
                    Task { await dataStore.load() }
                }
                .buttonStyle(.borderedProminent)
            }
        } else if dataStore.sessions.isEmpty {
            ContentUnavailableView(
                "No sessions yet",
                systemImage: "sportscourt",
                description: Text("Tap + to start your first session.")
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
                        .foregroundStyle(GweiloTheme.lime)
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
                .font(
                    GweiloTheme.displayFont(
                        size: 24,
                        relativeTo: .title3
                    )
                )
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

struct StartSessionView: View {
    private enum Step: Int {
        case setup
        case players
        case review

        var title: String {
            switch self {
            case .setup: "Nova sesija"
            case .players: "Izaberi igrače"
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
            _step = State(initialValue: .players)
            _availablePlayers = State(
                initialValue: SessionCreationPlayer.previewPlayers
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
                        SessionSetupStep(draft: $draft)
                    case .players:
                        SessionPlayersStep(
                            draft: $draft,
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
                        Button("Close", action: dismiss.callAsFunction)
                    } else {
                        Button("Back", systemImage: "chevron.left", action: goBack)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                SessionCreationFooter(
                    title: footerTitle,
                    detail: footerDetail,
                    isWorking: isPreparingSchedule || isCreating,
                    isEnabled: canContinue,
                    action: continueFlow
                )
            }
            .task {
                if !previewMode {
                    await loadPlayers()
                }
            }
            .alert("Couldn’t continue", isPresented: showsErrorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Please try again.")
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
        case .setup: "Izaberi igrače"
        case .players: "Napravi raspored"
        case .review: "Pokreni sesiju"
        }
    }

    private var footerDetail: String {
        switch step {
        case .setup:
            "\(draft.playerCount) igrača"
        case .players:
            "\(draft.selectedPlayers.count) od \(draft.playerCount)"
        case .review:
            "\(preview?.rounds.count ?? 0) rundi"
        }
    }

    private var canContinue: Bool {
        switch step {
        case .setup:
            !isLoadingPlayers
        case .players:
            draft.canPreview
        case .review:
            preview != nil
        }
    }

    private func goBack() {
        withAnimation(.smooth) {
            step = Step(rawValue: step.rawValue - 1) ?? .setup
        }
    }

    private func continueFlow() {
        guard canContinue, !isPreparingSchedule, !isCreating else { return }
        switch step {
        case .setup:
            withAnimation(.smooth) { step = .players }
        case .players:
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
               draft.playerCount == 4 || draft.playerCount == 6 {
                self.preview = SessionScheduleRandomizer
                    .preservingFixedTeams(in: preview)
            } else {
                let keepsTeamOrder =
                    draft.playerCount == 4 || draft.playerCount == 6
                let requestedPlayers = keepsTeamOrder
                    ? draft.selectedPlayers
                    : draft.selectedPlayers.shuffled()
                let serverPreview = try await dataStore.previewSession(
                    players: requestedPlayers,
                    format: draft.fourPlayerFormat
                )
                preview = keepsTeamOrder
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
    @Binding var draft: SessionCreationDraft

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                SessionCreationEyebrow(
                    number: "01",
                    title: "POSTAVI STO"
                )

                VStack(alignment: .leading, spacing: 14) {
                    Text("Koliko igrača?")
                        .font(.headline)

                    HStack(spacing: 8) {
                        ForEach(2...6, id: \.self) { count in
                            Button {
                                draft.setPlayerCount(count)
                            } label: {
                                Text("\(count)")
                                    .font(.headline.monospacedDigit())
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 50)
                                    .foregroundStyle(
                                        draft.playerCount == count
                                            ? GweiloTheme.background
                                            : .primary
                                    )
                                    .background(
                                        draft.playerCount == count
                                            ? GweiloTheme.lime
                                            : GweiloTheme.raisedSurface
                                    )
                                    .overlay {
                                        Rectangle()
                                            .stroke(
                                                draft.playerCount == count
                                                    ? GweiloTheme.lime
                                                    : GweiloTheme.hairline,
                                                lineWidth: 1
                                            )
                                    }
                            }
                            .buttonStyle(ResponsiveButtonStyle())
                            .accessibilityLabel("\(count) igrača")
                            .accessibilityAddTraits(
                                draft.playerCount == count ? .isSelected : []
                            )
                        }
                    }
                }

                if draft.playerCount == 4 {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Format za četiri igrača")
                            .font(.headline)

                        Picker(
                            "Format za četiri igrača",
                            selection: $draft.fourPlayerFormat
                        ) {
                            ForEach(FourPlayerSessionFormat.allCases) { format in
                                Text(format.label).tag(format)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }

                SessionCreationNote(
                    icon: "play.fill",
                    text: "Sesija počinje odmah. Raspored i dinamičke runde koriste ista pravila kao web aplikacija."
                )
            }
            .padding(20)
            .padding(.bottom, 100)
        }
        .scrollIndicators(.hidden)
        .animation(.smooth, value: draft.playerCount)
    }
}

private struct SessionPlayersStep: View {
    @Binding var draft: SessionCreationDraft
    let players: [SessionCreationPlayer]
    let isLoading: Bool
    @State private var query = ""
    @Namespace private var playerTransition

    private var filteredPlayers: [SessionCreationPlayer] {
        guard !query.isEmpty else { return players }
        return players.filter {
            $0.name.localizedCaseInsensitiveContains(query)
        }
    }

    private var availableSixPlayerPlayers: [SessionCreationPlayer] {
        let selectedIDs = Set(draft.selectedPlayers.map(\.id))
        return players.filter { !selectedIDs.contains($0.id) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                if draft.playerCount == 6 {
                    if isLoading {
                        GweiloLoadingView("Učitavam igrače…")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                    } else {
                        AvailableSessionPlayerRail(
                            players: availableSixPlayerPlayers,
                            namespace: playerTransition,
                            selectPlayer: selectPlayer
                        )

                        SessionDoublesTeamBuilder(
                            draft: $draft,
                            namespace: playerTransition
                        )
                    }
                } else {
                    SessionCreationEyebrow(
                        number: "02",
                        title: "IZABERI IGRAČE"
                    )

                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField("Pretraži igrače", text: $query)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                        if !query.isEmpty {
                            Button {
                                query = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Obriši pretragu")
                        }
                    }
                    .padding(.horizontal, 13)
                    .frame(height: 46)
                    .flatSurface(cornerRadius: 14)

                    if !draft.selectedPlayers.isEmpty {
                        SessionCreationNote(
                            icon: "shuffle",
                            text: "\(draft.selectedPlayers.count) izabrano. Raspored mečeva možeš promeniti na sledećem koraku."
                        )
                    }

                    if isLoading {
                        GweiloLoadingView("Učitavam igrače…")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                    } else {
                        ForEach(filteredPlayers) { player in
                            PlayerSelectionRow(
                                player: player,
                                selectionNumber: draft.selectionNumber(
                                    for: player.id
                                ),
                                isFull: draft.selectedPlayers.count >= draft.playerCount,
                                action: { selectPlayer(player) }
                            )
                        }
                    }
                }
            }
            .padding(20)
            .padding(.bottom, 100)
        }
        .scrollIndicators(.hidden)
    }

    private func selectPlayer(_ player: SessionCreationPlayer) {
        withAnimation(.snappy(duration: 0.2)) {
            draft.toggle(player)
        }
    }
}

private struct AvailableSessionPlayerRail: View {
    let players: [SessionCreationPlayer]
    let namespace: Namespace.ID
    let selectPlayer: (SessionCreationPlayer) -> Void

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
                        LazyHStack(spacing: 18) {
                            ForEach(players) { player in
                                AvailableSessionPlayerButton(
                                    player: player,
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
                    .transition(.opacity)
                }
            }
            .frame(height: 84)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Dostupni igrači")
    }
}

private struct AvailableSessionPlayerButton: View {
    let player: SessionCreationPlayer
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
        withAnimation(.snappy(duration: 0.2)) {
            draft.removeSelectedPlayer(at: index)
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
                DoublesTeamPlayerSlot(
                    player: players.indices.contains(playerIndex)
                        ? players[playerIndex]
                        : nil,
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

private struct DoublesTeamPlayerSlot: View {
    let player: SessionCreationPlayer?
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
                .accessibilityLabel("Ukloni \(player.name) iz tima")
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

                    Text("Igrač")
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

private struct PlayerSelectionRow: View {
    let player: SessionCreationPlayer
    let selectionNumber: Int?
    let isFull: Bool
    let action: () -> Void

    private var isSelected: Bool {
        selectionNumber != nil
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 13) {
                PlayerIdentityAvatar(
                    name: player.name,
                    initials: player.initials,
                    avatarURL: player.avatarURL,
                    size: 48
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(player.name)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    if let elo = player.elo {
                        Text("ELO \(elo)")
                            .font(.caption.monospacedDigit().weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if isSelected {
                    Text("\(selectionNumber ?? 0)")
                        .font(.caption.monospacedDigit().weight(.black))
                        .foregroundStyle(GweiloTheme.background)
                        .frame(width: 30, height: 30)
                        .background(GweiloTheme.lime, in: .circle)
                } else {
                    Image(systemName: "plus")
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 10)
            .contentShape(.rect)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .disabled(isFull && !isSelected)
        .opacity(isFull && !isSelected ? 0.42 : 1)
        .overlay(alignment: .bottom) {
            Divider()
        }
        .accessibilityLabel(
            isSelected
                ? "\(player.name), izabran kao \(selectionNumber ?? 0)"
                : "\(player.name), nije izabran"
        )
    }
}

private struct SessionReviewStep: View {
    let draft: SessionCreationDraft
    let preview: SessionSchedulePreview?
    let isRandomizing: Bool
    let randomize: () -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                SessionCreationEyebrow(
                    number: "03",
                    title: "RASPORED JE SPREMAN"
                )

                VStack(alignment: .leading, spacing: 6) {
                    Text(reviewTitle)
                        .font(
                            GweiloTheme.displayFont(
                                size: 36,
                                relativeTo: .title
                            )
                        )
                        .foregroundStyle(GweiloTheme.bone)

                    Text(reviewSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if let preview {
                    HStack(spacing: 10) {
                        ReviewMetric(
                            value: "\(draft.playerCount)",
                            label: "IGRAČA"
                        )
                        ReviewMetric(
                            value: "\(preview.rounds.count)",
                            label: "RUNDI"
                        )
                        ReviewMetric(value: "SADA", label: "POČETAK")
                    }

                    if draft.playerCount == 6 {
                        SessionReviewTeams(
                            teams: draft.doublesTeams,
                            preview: preview
                        )
                    }

                    Button(action: randomize) {
                        Label(
                            isRandomizing
                                ? "Menjam raspored…"
                                : randomizeTitle,
                            systemImage: "shuffle"
                        )
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                    }
                    .buttonStyle(ResponsiveButtonStyle())
                    .foregroundStyle(GweiloTheme.lime)
                    .background(
                        GweiloTheme.lime.opacity(0.08),
                        in: .rect(cornerRadius: 14)
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(
                                GweiloTheme.lime.opacity(0.42),
                                lineWidth: 0.8
                            )
                    }
                    .disabled(isRandomizing)
                    .accessibilityHint(
                        draft.playerCount == 6
                            ? "Menja singl parove, ali čuva izabrane dubl timove"
                            : "Pravi drugačiji raspored mečeva"
                    )

                    ForEach(preview.rounds) { round in
                        if let phase = phaseHeader(before: round) {
                            SchedulePhaseHeader(
                                title: phase.title,
                                detail: phase.detail
                            )
                        }

                        ScheduleRoundCard(round: round)
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
    }

    private var reviewTitle: String {
        switch draft.playerCount {
        case 6: "TRI TIMA. SEDAM RUNDI."
        case 5: "DUPLA ROTACIJA."
        default: "SPREMNI ZA IGRU."
        }
    }

    private var reviewSubtitle: String {
        switch draft.playerCount {
        case 6:
            "Dubl partneri ostaju zajedno. Singl parovi mogu da se promene."
        case 5:
            "Svako odmara dva puta i svaki par igra dva puta."
        default:
            "Pregledaj mečeve pre nego što pokreneš sesiju."
        }
    }

    private var randomizeTitle: String {
        draft.playerCount == 4 || draft.playerCount == 6
            ? "Promeni singl raspored"
            : "Promeni raspored"
    }

    private func phaseHeader(
        before round: SessionScheduleRound
    ) -> (title: String, detail: String)? {
        switch (draft.playerCount, round.roundNumber) {
        case (6, 1):
            ("SINGL ROTACIJA", "4 runde · partneri se ne sastaju")
        case (6, 5):
            ("ZAVRŠNICA", "5. runda odlučuje sledeće mečeve")
        case (4, 1):
            ("SINGLOVI", "svako igra protiv svakoga")
        case (4, 4):
            ("DUBLOVI", "svako igra sa svakim partnerom")
        default:
            nil
        }
    }
}

private struct SessionReviewTeams: View {
    let teams: [[SessionCreationPlayer]]
    let preview: SessionSchedulePreview

    private let colors = [
        GweiloTheme.lime,
        GweiloTheme.cyan,
        GweiloTheme.accentBright
    ]

    private var roundFiveSinglesIDs: Set<UUID> {
        Set(
            preview.rounds
                .first { $0.roundNumber == 5 }?
                .matches
                .first { $0.type == .singles }?
                .players
                .map(\.id) ?? []
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("DUBL TIMOVI")
                    .font(.caption.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(.secondary)

                Spacer()

                Text("FIKSNI")
                    .font(.caption2.weight(.black))
                    .tracking(1)
                    .foregroundStyle(GweiloTheme.lime)
            }

            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(Array(teams.enumerated()), id: \.offset) {
                        index,
                        team in
                        SessionReviewTeamCard(
                            index: index,
                            players: team,
                            color: colors[index],
                            playsRoundFiveSingles:
                                Set(team.map(\.id)) == roundFiveSinglesIDs
                        )
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }
}

private struct SessionReviewTeamCard: View {
    let index: Int
    let players: [SessionCreationPlayer]
    let color: Color
    let playsRoundFiveSingles: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("TIM \(teamLetter)")
                    .font(.caption2.weight(.black))
                    .tracking(1)
                    .foregroundStyle(color)

                Spacer()

                if playsRoundFiveSingles {
                    Text("SINGL U 5.")
                        .font(.system(size: 9, weight: .black))
                        .tracking(0.7)
                        .foregroundStyle(GweiloTheme.background)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 4)
                        .background(GweiloTheme.amber, in: .capsule)
                }
            }

            HStack(spacing: -8) {
                ForEach(players) { player in
                    PlayerIdentityAvatar(
                        name: player.name,
                        initials: player.initials,
                        avatarURL: player.avatarURL,
                        size: 38
                    )
                    .overlay {
                        Circle().stroke(GweiloTheme.surface, lineWidth: 2)
                    }
                }
            }

            Text(players.map(\.name).joined(separator: " + "))
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
        }
        .padding(13)
        .frame(width: 176, height: 116, alignment: .leading)
        .background(
            LinearGradient(
                colors: [
                    color.opacity(0.12),
                    GweiloTheme.surface
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: .rect(cornerRadius: 16)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(color.opacity(0.28), lineWidth: 0.8)
        }
    }

    private var teamLetter: String {
        ["A", "B", "C"][index]
    }
}

private struct SchedulePhaseHeader: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.caption.weight(.black))
                .tracking(1.5)
                .foregroundStyle(GweiloTheme.accentBright)

            Spacer()

            Text(detail)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }
}

private struct ScheduleRoundCard: View {
    let round: SessionScheduleRound

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Text("RUNDA")
                    .font(.caption2.weight(.black))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)

                Text("\(round.roundNumber)")
                    .font(
                        GweiloTheme.displayFont(
                            size: 28,
                            relativeTo: .title2
                        )
                    )
                    .foregroundStyle(
                        round.isDynamic == true
                            ? GweiloTheme.accentBright
                            : GweiloTheme.lime
                    )

                Spacer()

                if round.isDynamic == true {
                    Label("DINAMIČKA", systemImage: "bolt.fill")
                        .font(.system(size: 10, weight: .black))
                        .tracking(0.8)
                        .foregroundStyle(GweiloTheme.accentBright)
                } else {
                    Text("\(round.matchCount) \(matchCountLabel)")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }

            if round.isDynamic == true {
                DynamicRoundExplanation(roundNumber: round.roundNumber)
            } else {
                VStack(spacing: 8) {
                    ForEach(
                        Array(round.matches.enumerated()),
                        id: \.offset
                    ) { _, match in
                        ScheduleMatchCard(match: match)
                    }
                }
            }
        }
        .padding(15)
        .background(
            round.isDynamic == true
                ? GweiloTheme.accent.opacity(0.09)
                : GweiloTheme.surface,
            in: .rect(cornerRadius: 18)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(
                    round.isDynamic == true
                        ? GweiloTheme.accentBright.opacity(0.32)
                        : GweiloTheme.hairline,
                    lineWidth: 0.8
                )
        }
        .accessibilityElement(children: .combine)
    }

    private var matchCountLabel: String {
        round.matchCount == 1 ? "meč" : "meča"
    }
}

private struct DynamicRoundExplanation: View {
    let roundNumber: Int

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "arrow.triangle.branch")
                .font(.title3.weight(.semibold))
                .foregroundStyle(GweiloTheme.accentBright)
                .frame(width: 34, height: 34)
                .background(
                    GweiloTheme.accent.opacity(0.16),
                    in: .rect(cornerRadius: 10)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.bold))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var title: String {
        roundNumber == 6
            ? "Rezultat 5. runde bira parove"
            : "Drugi deo završnice"
    }

    private var detail: String {
        if roundNumber == 6 {
            return "Pobednici dubla ostaju zajedno i igraju protiv singl para. Poraženi igraju međusobni singl."
        }
        return "Poraženi dubl tim igra protiv singl para, a pobednički tim igra međusobni singl."
    }
}

private struct ScheduleMatchCard: View {
    let match: SessionScheduleMatch

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Label(
                match.type == .doubles ? "DUBL" : "SINGL",
                systemImage: match.type == .doubles
                    ? "person.2.fill"
                    : "figure.table.tennis"
            )
            .font(.system(size: 10, weight: .black))
            .tracking(1)
            .foregroundStyle(
                match.type == .doubles
                    ? GweiloTheme.cyan
                    : GweiloTheme.lime
            )

            HStack(spacing: 10) {
                MatchSide(players: firstSide)

                Text("VS")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(.secondary)

                MatchSide(players: secondSide)
            }
        }
        .padding(11)
        .background(
            GweiloTheme.raisedSurface,
            in: .rect(cornerRadius: 13)
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
}

private struct MatchSide: View {
    let players: [SessionCreationPlayer]

    var body: some View {
        HStack(spacing: 7) {
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
                            GweiloTheme.raisedSurface,
                            lineWidth: 1.5
                        )
                    }
                }
            }

            Text(players.map(\.name).joined(separator: " + "))
                .font(.caption.weight(.semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ReviewMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(
                    GweiloTheme.displayFont(
                        size: 25,
                        relativeTo: .title3
                    )
                )
                .minimumScaleFactor(0.75)
            Text(label)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            GweiloTheme.surface,
            in: .rect(cornerRadius: 14)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(GweiloTheme.hairline, lineWidth: 0.8)
        }
    }
}

private struct SessionCreationEyebrow: View {
    let number: String
    let title: String

    var body: some View {
        HStack(spacing: 9) {
            Text(number)
                .foregroundStyle(GweiloTheme.background)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(GweiloTheme.lime)
            Text(title)
                .tracking(1.6)
                .foregroundStyle(GweiloTheme.lime)
        }
        .font(.caption2.weight(.black))
    }
}

private struct SessionCreationNote: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: icon)
                .foregroundStyle(GweiloTheme.accentBright)
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .flatSurface(cornerRadius: 4)
    }
}

private struct SessionCreationFooter: View {
    let title: String
    let detail: String
    let isWorking: Bool
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            Button(action: action) {
                HStack {
                    if isWorking {
                        ProgressView()
                            .tint(GweiloTheme.background)
                    } else {
                        Text(title.uppercased())
                    }

                    Spacer()

                    Text(detail.uppercased())
                        .font(.caption2.monospacedDigit().weight(.black))
                        .opacity(0.7)

                    Image(systemName: "arrow.right")
                }
            }
            .buttonStyle(GweiloPrimaryButtonStyle())
            .disabled(!isEnabled || isWorking)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(.ultraThinMaterial)
    }
}
