import SwiftUI

struct SessionsView: View {
    let dataStore: AppDataStore
    @State private var navigationPath = NavigationPath()
    @State private var showsStartSession = false
    @State private var pendingCreatedSession: SessionSummary?

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 26) {
                        SessionsHeader(
                            isLoading: dataStore.isLoading,
                            canStartSession: dataStore.canStartNewSession,
                            startSession: { showsStartSession = true },
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
            .toolbarVisibility(.hidden, for: .navigationBar)
            .navigationDestination(for: SessionSummary.self) { session in
                SessionDetailView(
                    session: session,
                    dataStore: dataStore
                )
            }
            .sheet(isPresented: $showsStartSession) {
                StartSessionView(
                    dataStore: dataStore,
                    onCreated: { pendingCreatedSession = $0 }
                )
            }
            .onChange(of: showsStartSession) { _, isPresented in
                guard
                    !isPresented,
                    let pendingCreatedSession
                else {
                    return
                }
                self.pendingCreatedSession = nil
                navigationPath.append(pendingCreatedSession)
            }
        }
    }
}
private struct SessionsHeader: View {
    let isLoading: Bool
    let canStartSession: Bool
    let startSession: () -> Void
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
                if canStartSession {
                    Button(action: startSession) {
                        Image(systemName: "plus")
                            .font(.subheadline.weight(.bold))
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(.plain)
                    .modifier(RefreshButtonSurface())
                    .accessibilityLabel("Start a session")
                }

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
        if dataStore.isLoading, dataStore.sessions.isEmpty {
            ProgressView("Loading sessions…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let errorMessage = dataStore.errorMessage,
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
            case .setup: "New session"
            case .players: "Choose players"
            case .review: "Review schedule"
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
        case .setup: "Choose players"
        case .players: "Build schedule"
        case .review: "Start session"
        }
    }

    private var footerDetail: String {
        switch step {
        case .setup:
            "\(draft.playerCount) players"
        case .players:
            "\(draft.selectedPlayers.count) of \(draft.playerCount) selected"
        case .review:
            "\(preview?.rounds.count ?? 0) rounds"
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
            preview = try await dataStore.previewSession(
                players: draft.selectedPlayers.shuffled(),
                format: draft.fourPlayerFormat
            )
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
                    title: "SET THE TABLE"
                )

                VStack(alignment: .leading, spacing: 14) {
                    Text("How many players?")
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
                            .accessibilityLabel("\(count) players")
                            .accessibilityAddTraits(
                                draft.playerCount == count ? .isSelected : []
                            )
                        }
                    }
                }

                if draft.playerCount == 4 {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Four-player format")
                            .font(.headline)

                        Picker(
                            "Four-player format",
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
                    text: "The session starts immediately. The server builds the same randomized Gweilo schedule used by the web app."
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

    private var filteredPlayers: [SessionCreationPlayer] {
        guard !query.isEmpty else { return players }
        return players.filter {
            $0.name.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                SessionCreationEyebrow(
                    number: "02",
                    title: "CHOOSE THE PLAYERS"
                )

                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search players", text: $query)
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
                        .accessibilityLabel("Clear search")
                    }
                }
                .padding(.horizontal, 13)
                .frame(height: 46)
                .flatSurface(cornerRadius: 4)

                if !draft.selectedPlayers.isEmpty {
                    SessionCreationNote(
                        icon: "shuffle",
                        text: "\(draft.selectedPlayers.count) selected. Order does not matter; teams and schedule are randomized next."
                    )
                }

                if isLoading {
                    ProgressView("Loading players…")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                } else {
                    ForEach(filteredPlayers) { player in
                        PlayerSelectionRow(
                            player: player,
                            isSelected: draft.selectionNumber(for: player.id) != nil,
                            isFull: draft.selectedPlayers.count >= draft.playerCount,
                            action: { draft.toggle(player) }
                        )
                    }
                }
            }
            .padding(20)
            .padding(.bottom, 100)
        }
        .scrollIndicators(.hidden)
    }
}

private struct PlayerSelectionRow: View {
    let player: SessionCreationPlayer
    let isSelected: Bool
    let isFull: Bool
    let action: () -> Void

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
                    Image(systemName: "checkmark")
                        .font(.subheadline.weight(.black))
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
        .buttonStyle(.plain)
        .disabled(isFull && !isSelected)
        .opacity(isFull && !isSelected ? 0.42 : 1)
        .overlay(alignment: .bottom) {
            Divider()
        }
        .accessibilityLabel(
            isSelected
                ? "\(player.name), selected"
                : "\(player.name), not selected"
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
            LazyVStack(alignment: .leading, spacing: 18) {
                SessionCreationEyebrow(
                    number: "03",
                    title: "OFFICIAL SCHEDULE"
                )

                HStack(spacing: 0) {
                    ReviewMetric(value: "\(draft.playerCount)", label: "PLAYERS")
                    ReviewMetric(value: "\(preview?.rounds.count ?? 0)", label: "ROUNDS")
                    ReviewMetric(value: "NOW", label: "START")
                }

                if let preview {
                    Button(action: randomize) {
                        Label(
                            isRandomizing ? "Randomizing…" : "Randomize schedule",
                            systemImage: "shuffle"
                        )
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(GweiloTheme.lime)
                    .overlay {
                        Rectangle()
                            .stroke(GweiloTheme.lime.opacity(0.5), lineWidth: 1)
                    }
                    .disabled(isRandomizing)
                    .accessibilityHint("Builds a different randomized schedule")

                    ForEach(preview.rounds) { round in
                        ScheduleRoundRow(round: round)
                    }
                } else {
                    ProgressView("Building schedule…")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                }
            }
            .padding(20)
            .padding(.bottom, 100)
        }
        .scrollIndicators(.hidden)
    }
}

private struct ScheduleRoundRow: View {
    let round: SessionScheduleRound

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Text(String(format: "%02d", round.roundNumber))
                .font(
                    GweiloTheme.displayFont(
                        size: 31,
                        relativeTo: .title2
                    )
                )
                .foregroundStyle(
                    round.isDynamic == true
                        ? GweiloTheme.accentBright
                        : GweiloTheme.lime
                )
                .frame(width: 38, alignment: .leading)

            VStack(alignment: .leading, spacing: 10) {
                ForEach(
                    Array(round.matches.enumerated()),
                    id: \.offset
                ) { _, match in
                    HStack(alignment: .firstTextBaseline) {
                        Text(match.type.label)
                            .font(.caption2.weight(.black))
                            .tracking(0.9)
                            .foregroundStyle(.secondary)
                            .frame(width: 58, alignment: .leading)

                        Text(matchLabel(match))
                            .font(.subheadline.weight(.semibold))
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            Divider()
        }
        .accessibilityElement(children: .combine)
    }

    private func matchLabel(_ match: SessionScheduleMatch) -> String {
        if match.type == .doubles, match.players.count == 4 {
            return "\(match.players[0].name) + \(match.players[1].name)  vs  \(match.players[2].name) + \(match.players[3].name)"
        }
        return match.players.map(\.name).joined(separator: "  vs  ")
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
        .frame(maxWidth: .infinity, alignment: .leading)
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
                .font(.subheadline.weight(.black))
                .foregroundStyle(GweiloTheme.background)
                .padding(.horizontal, 18)
                .frame(height: 56)
                .background(GweiloTheme.lime)
                .overlay {
                    Rectangle()
                        .stroke(Color.white.opacity(0.28), lineWidth: 0.7)
                }
            }
            .buttonStyle(ResponsiveButtonStyle())
            .disabled(!isEnabled || isWorking)
            .opacity(isEnabled ? 1 : 0.44)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(.ultraThinMaterial)
    }
}
