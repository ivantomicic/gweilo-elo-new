import SwiftUI

struct InstallationProofView: View {
    let snapshot: GweiloWidgetSnapshot?
    let syncService: WatchWidgetSyncService
    @Bindable var workoutManager: WatchWorkoutManager

    var body: some View {
        ZStack {
            GweiloWatchTheme.background
                .ignoresSafeArea()

            if workoutManager.isWorkoutActive {
                ActiveSessionPages(
                    session: snapshot?.activeSession,
                    workoutManager: workoutManager,
                    syncService: syncService
                )
            } else if snapshot?.activeSessionID == nil {
                InactiveSessionPages(
                    player: snapshot?.player,
                    canManageSessions:
                        snapshot != nil && snapshot?.canManageSessions != false,
                    syncService: syncService
                )
            } else if let activeSession = snapshot?.activeSession {
                ActiveSessionPages(
                    session: activeSession,
                    workoutManager: workoutManager,
                    syncService: syncService
                )
            } else {
                ActiveSessionSyncPage()
            }
        }
        .task(id: snapshot?.activeSessionID) {
            workoutManager.activeGweiloSessionChanged(
                to: snapshot?.activeSessionID
            )
        }
        .sheet(isPresented: $workoutManager.isStartPromptPresented) {
            WorkoutStartPrompt(workoutManager: workoutManager)
        }
        .confirmationDialog(
            "Termin je završen",
            isPresented: $workoutManager.isEndPromptPresented,
            titleVisibility: .visible
        ) {
            Button("Završi i sačuvaj") {
                Task { await workoutManager.endWorkout() }
            }
            Button("Nastavi snimanje") {
                workoutManager.keepRecording()
            }
        } message: {
            Text("Završiti i trening?")
        }
        .alert(
            "Trening nije dostupan",
            isPresented: workoutErrorBinding
        ) {
            Button("U redu") { workoutManager.dismissError() }
        } message: {
            Text(workoutManager.errorMessage ?? "Pokušaj ponovo.")
        }
    }

    private var workoutErrorBinding: Binding<Bool> {
        Binding(
            get: { workoutManager.errorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    workoutManager.dismissError()
                }
            }
        )
    }
}

private struct InactiveSessionPages: View {
    private enum Page: Hashable {
        case personal
        case newSession
    }

    let player: GweiloWidgetPlayer?
    let canManageSessions: Bool
    let syncService: WatchWidgetSyncService
    @State private var selectedPage: Page = .personal

    var body: some View {
        if canManageSessions {
            TabView(selection: $selectedPage) {
                NavigationStack {
                    PersonalPage(player: player)
                }
                .tag(Page.personal)

                NavigationStack {
                    WatchStartSessionLanding(syncService: syncService)
                }
                .tag(Page.newSession)
            }
            .tabViewStyle(.verticalPage(transitionStyle: .blur))
        } else {
            NavigationStack {
                PersonalPage(player: player)
            }
        }
    }
}

private struct ActiveSessionPages: View {
    private enum Page: Hashable {
        case stats
        case playingNow
        case upNext
    }

    let session: GweiloWatchActiveSession?
    let workoutManager: WatchWorkoutManager
    let syncService: WatchWidgetSyncService
    @State private var selectedPage: Page = .stats

    var body: some View {
        TabView(selection: $selectedPage) {
            if workoutManager.isWorkoutActive {
                WorkoutDashboardPage(workoutManager: workoutManager)
                    .tag(Page.stats)
            } else {
                WorkoutStatsUnavailablePage(workoutManager: workoutManager)
                    .tag(Page.stats)
            }

            if let session {
                PlayingNowPage(
                    session: session,
                    syncService: syncService
                )
                .tag(Page.playingNow)

                MatchPage(
                    title: "SLEDEĆE",
                    matches: session.upNext,
                    emptyMessage: "POSLEDNJA RUNDA"
                )
                .tag(Page.upNext)
            }
        }
        .tabViewStyle(.verticalPage(transitionStyle: .blur))
        .onChange(of: workoutManager.activationSequence) {
            selectedPage = .stats
        }
    }
}

private struct WorkoutStatsUnavailablePage: View {
    let workoutManager: WatchWorkoutManager

    var body: some View {
        VStack(spacing: 9) {
            Image(systemName: "heart.text.clipboard")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(GweiloWatchTheme.coral)

            Text("STATISTIKA")
                .font(.headline.weight(.black))
                .foregroundStyle(GweiloWatchTheme.bone)

            Text("Pokreni trening da pratiš vreme, kalorije i puls.")
                .font(.caption2)
                .foregroundStyle(GweiloWatchTheme.muted)
                .multilineTextAlignment(.center)

            Button("Pokreni trening") {
                Task { await workoutManager.startWorkout() }
            }
            .buttonStyle(.borderedProminent)
            .tint(GweiloWatchTheme.accent)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct WorkoutDashboardPage: View {
    let workoutManager: WatchWorkoutManager
    @State private var showsWorkoutControls = false

    var body: some View {
        Button(action: showWorkoutControls) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                workoutContent(at: context.date)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Statistika treninga")
        .accessibilityHint("Otvara pauzu i završetak treninga")
        .sheet(isPresented: $showsWorkoutControls) {
            WorkoutControlsView(workoutManager: workoutManager)
        }
        ._statusBarHidden(true)
    }

    private func showWorkoutControls() {
        WatchHaptics.play(.click)
        showsWorkoutControls = true
    }

    private func workoutContent(at date: Date) -> some View {
        let elapsed = workoutManager.elapsedTime(at: date)
        let glowIsExpanded = Int(date.timeIntervalSinceReferenceDate) % 2 == 0

        return ZStack {
            Circle()
                .fill(GweiloWatchTheme.accent)
                .frame(width: 150, height: 150)
                .blur(radius: 30)
                .scaleEffect(glowIsExpanded ? 1.08 : 0.90)
                .opacity(glowIsExpanded ? 0.16 : 0.08)
                .animation(
                    .easeInOut(duration: 1.05),
                    value: glowIsExpanded
                )

            VStack(spacing: 0) {
                Text(formattedTime(date))
                    .font(
                        .system(
                            size: clockSize,
                            weight: .semibold,
                            design: .rounded
                        )
                    )
                    .monospacedDigit()
                    .foregroundStyle(
                        workoutManager.isPaused
                            ? GweiloWatchTheme.amber
                            : GweiloWatchTheme.bone
                    )
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)

                HStack(spacing: 0) {
                    WorkoutMetric(
                        value: String(
                            Int(workoutManager.activeCalories.rounded())
                        ),
                        unit: "KCAL",
                        symbol: "flame.fill",
                        color: GweiloWatchTheme.amber
                    )

                    Rectangle()
                        .fill(Color.white.opacity(0.12))
                        .frame(width: 1, height: 52)
                        .padding(.horizontal, 8)

                    WorkoutMetric(
                        value: workoutManager.heartRate > 0
                            ? String(Int(workoutManager.heartRate.rounded()))
                            : "--",
                        unit: "BPM",
                        symbol: "heart.fill",
                        color: GweiloWatchTheme.coral
                    )
                }
                .padding(.top, 7)

                HStack(spacing: 5) {
                    Image(systemName: "timer")
                    Text(formattedDuration(elapsed))
                        .monospacedDigit()
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(GweiloWatchTheme.muted)
                .padding(.top, 7)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 8)
        .contentShape(.rect)
    }

    @ScaledMetric(relativeTo: .largeTitle)
    private var clockSize: CGFloat = 76

    private func formattedTime(_ date: Date) -> String {
        date.formatted(
            .dateTime
                .hour(.twoDigits(amPM: .omitted))
                .minute(.twoDigits)
        )
    }

    private func formattedDuration(_ interval: TimeInterval) -> String {
        let seconds = max(Int(interval), 0)
        if seconds >= 3_600 {
            return String(
                format: "%d:%02d:%02d",
                seconds / 3_600,
                (seconds % 3_600) / 60,
                seconds % 60
            )
        }
        return String(
            format: "%02d:%02d",
            seconds / 60,
            seconds % 60
        )
    }
}

private struct WorkoutMetric: View {
    let value: String
    let unit: String
    let symbol: String
    let color: Color
    @ScaledMetric(relativeTo: .title)
    private var valueSize: CGFloat = 29

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(color)
                .frame(height: 15)

            Text(value)
                .font(
                    .system(
                        size: valueSize,
                        weight: .semibold,
                        design: .rounded
                    )
                    .monospacedDigit()
                )
                .foregroundStyle(GweiloWatchTheme.bone)

            Text(unit)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(GweiloWatchTheme.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct WorkoutStartPrompt: View {
    let workoutManager: WatchWorkoutManager

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "figure.table.tennis")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(GweiloWatchTheme.accentBright)

            Text("PRATITI OVAJ TERMIN?")
                .font(.headline.weight(.bold))
                .multilineTextAlignment(.center)

            Text("Prati vreme, kalorije i puls.")
                .font(.caption2)
                .foregroundStyle(GweiloWatchTheme.muted)
                .multilineTextAlignment(.center)

            Button("Pokreni trening") {
                Task { await workoutManager.startWorkout() }
            }
            .buttonStyle(.borderedProminent)
            .tint(GweiloWatchTheme.accent)

            Button("Ne sada") {
                workoutManager.declineWorkout()
            }
            .buttonStyle(.plain)
            .font(.caption.weight(.semibold))
            .foregroundStyle(GweiloWatchTheme.muted)
        }
        .padding(.horizontal, 12)
        .accessibilityElement(children: .contain)
    }
}

private struct ActiveSessionSyncPage: View {
    var body: some View {
        VStack(spacing: 8) {
            ProgressView()
                .tint(GweiloWatchTheme.accentBright)

            Text("SINHRONIZACIJA TERMINA")
                .font(.headline.weight(.bold))
                .foregroundStyle(GweiloWatchTheme.bone)

            Text("Otvori Gweilo jednom na iPhone-u.")
                .font(.caption2)
                .foregroundStyle(GweiloWatchTheme.muted)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }
}

private struct PersonalPage: View {
    let player: GweiloWidgetPlayer?

    var body: some View {
        Group {
            if let player {
                personalContent(player)
            } else {
                unavailableContent
            }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func personalContent(
        _ player: GweiloWidgetPlayer
    ) -> some View {
        VStack(spacing: 4) {
            Text("MOJ GWEILO")
                .font(.caption.weight(.bold))
                .foregroundStyle(GweiloWatchTheme.accentBright)

            Text(String(player.elo))
                .font(.system(size: 42, weight: .bold, design: .rounded))
                .foregroundStyle(GweiloWatchTheme.bone)
                .minimumScaleFactor(0.75)

            Text("ELO")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(GweiloWatchTheme.muted)

            HStack(spacing: 10) {
                Label("#\(player.rank)", systemImage: "trophy.fill")

                if let latestDelta = player.recentForm.last {
                    Label(
                        signed(latestDelta),
                        systemImage: trendSymbol(latestDelta)
                    )
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(GweiloWatchTheme.bone.opacity(0.92))
            .padding(.top, 4)

            FormStrip(scores: resolvedScores(for: player))
                .padding(.top, 8)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(player.name), Elo \(player.elo), ranking \(player.rank)"
        )
    }

    private var unavailableContent: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.title2)
                .foregroundStyle(GweiloWatchTheme.accentBright)

            Text("Otvori Gweilo na iPhone-u")
                .font(.headline)
                .multilineTextAlignment(.center)

            Text("Tvoj ELO i rang će se prikazati ovde.")
                .font(.caption2)
                .foregroundStyle(GweiloWatchTheme.muted)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(GweiloWatchTheme.bone)
        .accessibilityElement(children: .combine)
    }

    private func resolvedScores(
        for player: GweiloWidgetPlayer
    ) -> [Double] {
        if let scores = player.recentFormScores,
           !scores.isEmpty {
            return Array(scores.suffix(5))
        }
        return player.recentForm.suffix(5).map {
            min(max(Double($0) / 5, -1), 1)
        }
    }

    private func signed(_ value: Int) -> String {
        value > 0 ? "+\(value)" : "\(value)"
    }

    private func trendSymbol(_ value: Int) -> String {
        if value > 0 { return "arrow.up.right" }
        if value < 0 { return "arrow.down.right" }
        return "arrow.right"
    }
}

private struct FormStrip: View {
    let scores: [Double]

    private var paddedScores: [Double?] {
        Array<Double?>(
            repeating: nil,
            count: max(5 - scores.count, 0)
        ) + scores.map(Optional.some)
    }

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(paddedScores.enumerated()), id: \.offset) { _, score in
                Capsule()
                    .fill(color(for: score))
                    .frame(height: 7)
            }
        }
        .accessibilityLabel("Skorašnja forma u singlu")
    }

    private func color(for score: Double?) -> Color {
        guard let score else {
            return Color.white.opacity(0.12)
        }
        if score >= 0.3 {
            return GweiloWatchTheme.lime
        }
        if score <= -0.3 {
            return GweiloWatchTheme.coral
        }
        return GweiloWatchTheme.amber
    }
}

private struct PlayingNowPage: View {
    let session: GweiloWatchActiveSession
    let syncService: WatchWidgetSyncService
    @State private var resultContext: WatchRoundResultContext?

    var body: some View {
        VStack(spacing: 6) {
            Text("TRENUTNO IGRAJU")
                .font(.headline.weight(.bold))
                .foregroundStyle(GweiloWatchTheme.accentBright)

            if session.playingNow.isEmpty {
                Text("ČEKA SE RUNDA")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(GweiloWatchTheme.muted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(session.playingNow) { match in
                            MatchRow(match: match)
                                .frame(height: 38)

                            if match.id != session.playingNow.last?.id {
                                Divider()
                                    .overlay(Color.white.opacity(0.08))
                                    .padding(.horizontal, 12)
                            }
                        }
                    }
                }

                Button {
                    resultContext = WatchRoundResultContext(session: session)
                } label: {
                    Label("Upiši rezultat", systemImage: "square.and.pencil")
                        .font(.caption.weight(.bold))
                }
                .buttonStyle(.borderedProminent)
                .tint(GweiloWatchTheme.accent)
            }
        }
        .padding(.horizontal, 8)
        .sheet(item: $resultContext) { context in
            WatchRoundResultView(
                context: context,
                syncService: syncService
            )
        }
    }
}

private struct WatchRoundResultContext: Identifiable {
    let sessionID: UUID
    let roundNumber: Int
    let matches: [GweiloWatchMatchup]

    var id: String {
        "\(sessionID.uuidString)-\(roundNumber)"
    }

    init(session: GweiloWatchActiveSession) {
        sessionID = session.id
        roundNumber = session.currentRound
        matches = session.playingNow
    }
}

private struct WatchMatchScoreEntry: Identifiable {
    let match: GweiloWatchMatchup
    var teamOneScore = 0
    var teamTwoScore = 0

    var id: UUID { match.id }

    var submission: RoundMatchScoreSubmission {
        RoundMatchScoreSubmission(
            matchId: match.id,
            team1Score: teamOneScore,
            team2Score: teamTwoScore
        )
    }
}

private struct WatchRoundResultView: View {
    @Environment(\.dismiss) private var dismiss
    let context: WatchRoundResultContext
    let syncService: WatchWidgetSyncService
    @State private var entries: [WatchMatchScoreEntry]
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(
        context: WatchRoundResultContext,
        syncService: WatchWidgetSyncService
    ) {
        self.context = context
        self.syncService = syncService
        _entries = State(
            initialValue: context.matches.map {
                WatchMatchScoreEntry(match: $0)
            }
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach($entries) { $entry in
                        WatchMatchScoreEditor(entry: $entry)
                        .disabled(isSubmitting)
                    }

                    Button(action: requestSubmission) {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label(
                                "Sačuvaj rezultate",
                                systemImage: "checkmark.circle.fill"
                            )
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSubmitting)
                    .buttonStyle(.borderedProminent)
                    .tint(GweiloWatchTheme.accent)
                    .accessibilityHint("Čuva sve prikazane rezultate")
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
            .navigationTitle("Runda \(context.roundNumber)")
            .alert("Rezultati nisu sačuvani", isPresented: errorBinding) {
                Button("U redu", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Otvori Gweilo na iPhone-u i pokušaj ponovo.")
            }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    errorMessage = nil
                }
            }
        )
    }

    private func requestSubmission() {
        WatchHaptics.play(.click)
        Task { await submit() }
    }

    private func submit() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = try await syncService.performSessionCommand(
                .submitRound(
                    sessionID: context.sessionID,
                    roundNumber: context.roundNumber,
                    scores: entries.map(\.submission)
                )
            )
            guard case let .roundSubmitted(roundNumber) = payload,
                  roundNumber == context.roundNumber else {
                throw WatchResultSubmissionError.unexpectedResponse
            }
            WatchHaptics.play(.success)
            dismiss()
        } catch {
            WatchHaptics.play(.failure)
            errorMessage = error.localizedDescription
        }
    }
}

private struct WatchMatchScoreEditor: View {
    @Binding var entry: WatchMatchScoreEntry

    var body: some View {
        VStack(spacing: 7) {
            HStack(alignment: .center, spacing: 5) {
                WatchTeamScoreControl(
                    players: entry.match.leftPlayers,
                    score: $entry.teamOneScore
                )

                Text(":")
                    .font(.title2.weight(.medium))
                    .foregroundStyle(GweiloWatchTheme.muted)
                    .accessibilityHidden(true)

                WatchTeamScoreControl(
                    players: entry.match.rightPlayers,
                    score: $entry.teamTwoScore
                )
            }
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 8)
        .background {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .fill(Color.white.opacity(0.07))
        }
        .accessibilityElement(children: .contain)
    }
}

private struct WatchTeamScoreControl: View {
    let players: [GweiloWatchSessionPlayer]
    @Binding var score: Int
    @State private var didClearWithLongPress = false
    @ScaledMetric(relativeTo: .largeTitle)
    private var scoreSize: CGFloat = 40

    private var teamName: String {
        players.map { player in
            player.name.split(separator: " ").first.map(String.init)
                ?? player.name
        }
        .joined(separator: " & ")
    }

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 3) {
                PlayerAvatarStack(players: players)

                Text(teamName)
                    .font(.caption.weight(.semibold))
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 24, alignment: .center)

            Button(action: incrementScore) {
                Text(String(score))
                    .font(
                        .system(
                            size: scoreSize,
                            weight: .bold,
                            design: .rounded
                        )
                        .monospacedDigit()
                    )
                    .foregroundStyle(GweiloWatchTheme.bone)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(minWidth: 58, minHeight: 58)
                    .background(GweiloWatchTheme.scoreControl, in: Circle())
                    .contentShape(.circle)
                    .contentTransition(.numericText(value: Double(score)))
            }
            .buttonStyle(.plain)
            .simultaneousGesture(clearScoreGesture)
            .accessibilityLabel("Rezultat za \(teamName)")
            .accessibilityValue(String(score))
            .accessibilityHint("Aktiviraj za povećanje; zadrži za brisanje")
            .accessibilityAction(named: "Obriši rezultat") {
                clearScore()
            }
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment:
                    adjustScore(by: 1)
                case .decrement:
                    adjustScore(by: -1)
                @unknown default:
                    break
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var clearScoreGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.55)
            .onEnded { _ in
                didClearWithLongPress = true
                clearScore()
            }
    }

    private func incrementScore() {
        if didClearWithLongPress {
            didClearWithLongPress = false
            return
        }
        adjustScore(by: 1)
    }

    private func clearScore() {
        guard score != 0 else { return }

        withAnimation(.easeOut(duration: 0.12)) {
            score = 0
        }
        WatchHaptics.play(.directionDown)
    }

    private func adjustScore(by amount: Int) {
        let updatedScore = min(99, max(0, score + amount))
        guard updatedScore != score else { return }

        withAnimation(.easeOut(duration: 0.12)) {
            score = updatedScore
        }
        WatchHaptics.play(amount > 0 ? .directionUp : .directionDown)
    }
}

private enum WatchResultSubmissionError: LocalizedError {
    case unexpectedResponse

    var errorDescription: String? {
        "iPhone je vratio neočekivan odgovor. Pokušaj ponovo."
    }
}

private struct MatchPage: View {
    let title: String
    let matches: [GweiloWatchMatchup]
    let emptyMessage: String

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.headline.weight(.bold))
                .foregroundStyle(GweiloWatchTheme.accentBright)
                .padding(.bottom, 7)

            if matches.isEmpty {
                Text(emptyMessage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(GweiloWatchTheme.muted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ForEach(matches) { match in
                    MatchRow(match: match)
                        .frame(height: 42)

                    if match.id != matches.last?.id {
                        Divider()
                            .overlay(Color.white.opacity(0.08))
                            .padding(.horizontal, 12)
                    }
                }
            }
        }
        .padding(.horizontal, 8)
    }
}

private struct WorkoutControlsView: View {
    let workoutManager: WatchWorkoutManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack(spacing: 14) {
            WorkoutControlButton(
                title: workoutManager.isPaused ? "Nastavi" : "Pauza",
                symbol: workoutManager.isPaused ? "play.fill" : "pause.fill",
                color: GweiloWatchTheme.amber
            ) {
                workoutManager.togglePause()
            }

            WorkoutControlButton(
                title: "Završi",
                symbol: "stop.fill",
                color: GweiloWatchTheme.coral
            ) {
                Task {
                    await workoutManager.endWorkout()
                    dismiss()
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct WorkoutControlButton: View {
    let title: String
    let symbol: String
    let color: Color
    let action: () -> Void

    var body: some View {
        VStack(spacing: 7) {
            Button(action: action) {
                Image(systemName: symbol)
                    .font(.title2.weight(.bold))
                    .frame(width: 50, height: 50)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.circle)
            .tint(color)

            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(GweiloWatchTheme.bone)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}

private struct MatchRow: View {
    let match: GweiloWatchMatchup

    private var leftName: String {
        shortName(for: match.leftPlayers)
    }

    private var rightName: String {
        shortName(for: match.rightPlayers)
    }

    var body: some View {
        HStack(spacing: 5) {
            HStack(spacing: 4) {
                Text(leftName)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                PlayerAvatarStack(players: match.leftPlayers)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            Text("—")
                .font(.caption2)
                .foregroundStyle(GweiloWatchTheme.muted)

            HStack(spacing: 4) {
                PlayerAvatarStack(players: match.rightPlayers)

                Text(rightName)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.body.weight(.semibold))
        .foregroundStyle(GweiloWatchTheme.bone)
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(leftName) protiv \(rightName)")
    }

    private func shortName(
        for players: [GweiloWatchSessionPlayer]
    ) -> String {
        players.map { player in
            player.name.split(separator: " ").first.map(String.init)
                ?? player.name
        }
        .joined(separator: " & ")
    }
}

private struct PlayerAvatarStack: View {
    let players: [GweiloWatchSessionPlayer]

    var body: some View {
        HStack(spacing: -7) {
            ForEach(players) { player in
                PlayerAvatar(player: player)
            }
        }
        .frame(minWidth: 20)
        .accessibilityHidden(true)
    }
}

private struct PlayerAvatar: View {
    let player: GweiloWatchSessionPlayer

    var body: some View {
        AsyncImage(url: avatarURL) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            default:
                avatarFallback
            }
        }
        .frame(width: 20, height: 20)
        .clipShape(.circle)
        .overlay {
            Circle()
                .stroke(GweiloWatchTheme.background, lineWidth: 1.5)
        }
    }

    private var avatarURL: URL? {
        player.avatarURL.flatMap(URL.init(string:))
    }

    private var avatarFallback: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.94, green: 0.34, blue: 0.62),
                    GweiloWatchTheme.accent
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Text(String(player.name.prefix(1)).uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white.opacity(0.92))
        }
    }
}

enum GweiloWatchTheme {
    static let background = Color(red: 0.012, green: 0.012, blue: 0.016)
    static let accent = Color(red: 0.47, green: 0.19, blue: 1.00)
    static let accentBright = Color(red: 0.61, green: 0.38, blue: 1.00)
    static let bone = Color(red: 0.96, green: 0.95, blue: 0.91)
    static let muted = Color(red: 0.58, green: 0.57, blue: 0.63)
    static let lime = Color(red: 0.76, green: 1.00, blue: 0.12)
    static let amber = Color(red: 1.00, green: 0.70, blue: 0.10)
    static let coral = Color(red: 1.00, green: 0.27, blue: 0.36)
    static let scoreControl = Color(red: 0.22, green: 0.22, blue: 0.26)
}
