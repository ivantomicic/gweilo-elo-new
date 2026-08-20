import SwiftUI

struct InstallationProofView: View {
    let snapshot: GweiloWidgetSnapshot?
    @Bindable var workoutManager: WatchWorkoutManager

    var body: some View {
        ZStack {
            GweiloWatchTheme.background
                .ignoresSafeArea()

            if workoutManager.isWorkoutActive {
                ActiveSessionPages(
                    session: snapshot?.activeSession,
                    workoutManager: workoutManager
                )
            } else if snapshot?.activeSessionID == nil {
                PersonalPage(player: snapshot?.player)
            } else if let activeSession = snapshot?.activeSession {
                ActiveSessionPages(
                    session: activeSession,
                    workoutManager: workoutManager
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
            "Session finished",
            isPresented: $workoutManager.isEndPromptPresented,
            titleVisibility: .visible
        ) {
            Button("End and Save") {
                Task { await workoutManager.endWorkout() }
            }
            Button("Keep Recording") {
                workoutManager.keepRecording()
            }
        } message: {
            Text("Finish the workout too?")
        }
        .alert(
            "Workout unavailable",
            isPresented: workoutErrorBinding
        ) {
            Button("OK") { workoutManager.dismissError() }
        } message: {
            Text(workoutManager.errorMessage ?? "Please try again.")
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

private struct ActiveSessionPages: View {
    private enum Page: Hashable {
        case workout
        case upNext
        case playingNow
    }

    let session: GweiloWatchActiveSession?
    let workoutManager: WatchWorkoutManager
    @State private var selectedPage: Page = .upNext

    var body: some View {
        TabView(selection: $selectedPage) {
            if workoutManager.isWorkoutActive {
                WorkoutDashboardPage(workoutManager: workoutManager)
                    .tag(Page.workout)
            }

            if let session {
                MatchPage(
                    title: "UP NEXT",
                    matches: session.upNext,
                    emptyMessage: "FINAL ROUND"
                )
                .tag(Page.upNext)

                MatchPage(
                    title: "PLAYING NOW",
                    matches: session.playingNow,
                    emptyMessage: "WAITING FOR ROUND"
                )
                .tag(Page.playingNow)
            }
        }
        .tabViewStyle(.verticalPage(transitionStyle: .blur))
        .onChange(of: workoutManager.isWorkoutActive, initial: true) {
            selectedPage = workoutManager.isWorkoutActive
                ? .workout
                : .upNext
        }
        .onChange(of: workoutManager.activationSequence) {
            guard workoutManager.isWorkoutActive else { return }
            selectedPage = .workout
        }
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
        .accessibilityLabel("Workout metrics")
        .accessibilityHint("Opens pause and end controls")
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

        return VStack(spacing: 0) {
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

            Text("TRACK THIS SESSION?")
                .font(.headline.weight(.bold))
                .multilineTextAlignment(.center)

            Text("Track time, calories and heart rate.")
                .font(.caption2)
                .foregroundStyle(GweiloWatchTheme.muted)
                .multilineTextAlignment(.center)

            Button("Start Workout") {
                Task { await workoutManager.startWorkout() }
            }
            .buttonStyle(.borderedProminent)
            .tint(GweiloWatchTheme.accent)

            Button("Not Now") {
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

            Text("SYNCING SESSION")
                .font(.headline.weight(.bold))
                .foregroundStyle(GweiloWatchTheme.bone)

            Text("Open Gweilo on iPhone once.")
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
            Text("MY GWEILO")
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

            Text("Open Gweilo on iPhone")
                .font(.headline)
                .multilineTextAlignment(.center)

            Text("Your Elo and ranking will sync here.")
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
        .accessibilityLabel("Recent singles form")
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
        VStack(spacing: 10) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(
                    formattedDuration(
                        workoutManager.elapsedTime(at: context.date)
                    )
                )
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .monospacedDigit()
            }

            HStack(spacing: 18) {
                Label(
                    "\(Int(workoutManager.activeCalories.rounded())) kcal",
                    systemImage: "flame.fill"
                )
                Label(
                    workoutManager.heartRate > 0
                        ? "\(Int(workoutManager.heartRate.rounded())) bpm"
                        : "-- bpm",
                    systemImage: "heart.fill"
                )
            }
            .font(.caption2.weight(.semibold))

            HStack(spacing: 8) {
                Button {
                    workoutManager.togglePause()
                } label: {
                    Label(
                        workoutManager.isPaused ? "Resume" : "Pause",
                        systemImage: workoutManager.isPaused
                            ? "play.fill"
                            : "pause.fill"
                    )
                }
                .tint(GweiloWatchTheme.accent)

                Button(role: .destructive) {
                    Task {
                        await workoutManager.endWorkout()
                        dismiss()
                    }
                } label: {
                    Label("End", systemImage: "stop.fill")
                }
            }
            .labelStyle(.iconOnly)
        }
        .padding(.horizontal, 8)
    }

    private func formattedDuration(_ interval: TimeInterval) -> String {
        let seconds = max(Int(interval), 0)
        return String(
            format: "%02d:%02d:%02d",
            seconds / 3_600,
            (seconds % 3_600) / 60,
            seconds % 60
        )
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

            Text("vs")
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
        .accessibilityLabel("\(leftName) versus \(rightName)")
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

private enum GweiloWatchTheme {
    static let background = Color(red: 0.012, green: 0.012, blue: 0.016)
    static let accent = Color(red: 0.47, green: 0.19, blue: 1.00)
    static let accentBright = Color(red: 0.61, green: 0.38, blue: 1.00)
    static let bone = Color(red: 0.96, green: 0.95, blue: 0.91)
    static let muted = Color(red: 0.58, green: 0.57, blue: 0.63)
    static let lime = Color(red: 0.76, green: 1.00, blue: 0.12)
    static let amber = Color(red: 1.00, green: 0.70, blue: 0.10)
    static let coral = Color(red: 1.00, green: 0.27, blue: 0.36)
}
