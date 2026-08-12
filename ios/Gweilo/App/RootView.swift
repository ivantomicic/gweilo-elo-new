import SwiftUI
import Network
import Observation

@Observable
@MainActor
private final class ConnectivityMonitor {
    private(set) var isConnected: Bool?

    @ObservationIgnored
    private let monitor = NWPathMonitor()
    @ObservationIgnored
    private let queue = DispatchQueue(
        label: "com.ivantomicic.gweilo.connectivity"
    )

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let isConnected = path.status == .satisfied
            Task { @MainActor [weak self] in
                self?.isConnected = isConnected
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}

private struct AppLoadIdentity: Hashable {
    let accessToken: String?
    let isRestoringSession: Bool
}

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var authStore = AuthStore()
    @State private var appDataStore: AppDataStore?
    @State private var pushNotifications = PushNotificationManager.shared
    @State private var connectivity = ConnectivityMonitor()

    var body: some View {
        Group {
            if isRankingsPreview {
                RankingsPreviewScreen()
            } else if isChartScrubPreview {
                ChartScrubPreviewScreen()
            } else if isTopThreePreview {
                TopThreePreviewScreen()
            } else if isSettingsPreview {
                NavigationStack {
                    SettingsView()
                }
            } else if isRulesPreview {
                NavigationStack {
                    RulesView()
                }
            } else if isStartSessionPreview {
                StartSessionPreviewScreen()
            } else if isDoublesTeamProfilePreview {
                DoublesTeamProfilePreviewScreen()
            } else if isRecentResultsPreview {
                RecentResultsPreviewScreen()
            } else if isPlayerProfilePreview {
                PlayerProfilePreviewScreen()
            } else if isScoreEntryPreview {
                ScoreEntryPreviewScreen()
            } else if isSessionDetailPreview {
                SessionDetailPreviewScreen()
            } else if authStore.isRestoringSession {
                GweiloLoadingView("Vraćam tvoj klub…", size: 172)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ArenaBackground())
            } else if authStore.session == nil {
                SignInView(authStore: authStore)
            } else if let appDataStore,
                      appDataStore.hasCompletedInitialHomeLoad {
                MainTabView(
                    dataStore: appDataStore,
                    authStore: authStore,
                    pushNotifications: pushNotifications
                )
            } else {
                GweiloLoadingView("Učitavam tvoj klub…", size: 172)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ArenaBackground())
            }
        }
        .task(id: appLoadIdentity) {
            guard
                !authStore.isRestoringSession,
                let session = authStore.session,
                let configuration = authStore.configuration
            else {
                appDataStore = nil
                pushNotifications.clearConfiguration()
                return
            }

            await pushNotifications.configure(
                configuration: configuration,
                session: session
            )

            if let appDataStore {
                appDataStore.updateSession(session)
                await appDataStore.loadHome()
            } else {
                let store = AppDataStore(
                    configuration: configuration,
                    session: session
                )
                appDataStore = store
                await store.loadHome()
            }
        }
        .task {
            await authStore.restoreSession()
        }
        .task(id: appLoadIdentity) {
            guard !authStore.isRestoringSession else { return }
            await authStore.refreshBeforeExpiry()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task {
                let previousAccessToken = authStore.session?.accessToken
                await authStore.refreshIfNeeded()
                await pushNotifications.refreshAuthorizationStatus()
                guard
                    let session = authStore.session,
                    session.accessToken == previousAccessToken,
                    !session.needsRefresh()
                else {
                    return
                }
                await appDataStore?.loadHome()
            }
        }
        .onChange(of: connectivity.isConnected) { wasConnected, isConnected in
            guard wasConnected == false, isConnected == true else { return }
            Task {
                let previousAccessToken = authStore.session?.accessToken
                await authStore.refreshIfNeeded()
                guard
                    let session = authStore.session,
                    session.accessToken == previousAccessToken,
                    !session.needsRefresh()
                else {
                    return
                }
                await appDataStore?.loadHome(forceRefresh: true)
            }
        }
        .onOpenURL { url in
            pushNotifications.handleDeepLink(url)
        }
    }

    private var appLoadIdentity: AppLoadIdentity {
        AppLoadIdentity(
            accessToken: authStore.session?.accessToken,
            isRestoringSession: authStore.isRestoringSession
        )
    }

    private var isSessionDetailPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-session-detail-preview")
        #else
        false
        #endif
    }

    private var isScoreEntryPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-score-entry-preview")
        #else
        false
        #endif
    }

    private var isPlayerProfilePreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-player-profile-preview")
        #else
        false
        #endif
    }

    private var isRecentResultsPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-recent-results-preview")
        #else
        false
        #endif
    }

    private var isDoublesTeamProfilePreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-doubles-team-profile-preview")
        #else
        false
        #endif
    }

    private var isStartSessionPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-start-session-preview")
        #else
        false
        #endif
    }

    private var isRulesPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-rules-preview")
        #else
        false
        #endif
    }

    private var isSettingsPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-settings-preview")
        #else
        false
        #endif
    }

    private var isTopThreePreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-top-three-preview")
        #else
        false
        #endif
    }

    private var isChartScrubPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-chart-scrub-preview")
        #else
        false
        #endif
    }

    private var isRankingsPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-rankings-preview")
        #else
        false
        #endif
    }
}

#if !DEBUG
private struct RankingsPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct SessionDetailPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct ScoreEntryPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct PlayerProfilePreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct RecentResultsPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct DoublesTeamProfilePreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}

private struct StartSessionPreviewScreen: View {
    var body: some View {
        EmptyView()
    }
}
#endif

private enum MainTabSelection: Hashable {
    case home
    case sessions
    case rankings
    case more
}

private struct MainTabView: View {
    let dataStore: AppDataStore
    let authStore: AuthStore
    let pushNotifications: PushNotificationManager
    @State private var selectedTab = MainTabSelection.home
    @State private var requestedActiveSessionID: UUID?
    @State private var isActiveSessionDetailPresented = false

    private var requestedSessionID: UUID? {
        requestedActiveSessionID ?? pushNotifications.pendingSessionID
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab(
                "Početna",
                systemImage: "house.fill",
                value: MainTabSelection.home
            ) {
                ActiveSessionAccessoryHost(
                    session: dataStore.activeSession,
                    isHidden: false,
                    openSession: openActiveSession
                ) {
                    HomeView(dataStore: dataStore)
                }
            }

            Tab(
                "Termini",
                systemImage: "figure.table.tennis",
                value: MainTabSelection.sessions
            ) {
                ActiveSessionAccessoryHost(
                    session: dataStore.activeSession,
                    isHidden: isActiveSessionDetailPresented,
                    openSession: openActiveSession
                ) {
                    SessionsView(
                        dataStore: dataStore,
                        requestedSessionID: requestedSessionID,
                        activeSessionDetailIsPresented:
                            $isActiveSessionDetailPresented,
                        didOpenRequestedSession: didOpenRequestedSession
                    )
                }
            }

            Tab(
                "Statistika",
                systemImage: "trophy.fill",
                value: MainTabSelection.rankings
            ) {
                ActiveSessionAccessoryHost(
                    session: dataStore.activeSession,
                    isHidden: false,
                    openSession: openActiveSession
                ) {
                    RankingsView(dataStore: dataStore)
                }
            }

            Tab(
                "Više",
                systemImage: "ellipsis",
                value: MainTabSelection.more
            ) {
                ActiveSessionAccessoryHost(
                    session: dataStore.activeSession,
                    isHidden: false,
                    openSession: openActiveSession
                ) {
                    AccountView(
                        email: authStore.session?.user.email,
                        player: authStore.session.flatMap { session in
                            dataStore.singlesRankings.first {
                                $0.id == session.user.id
                            }
                        },
                        dataStore: dataStore,
                        pushNotifications: pushNotifications,
                        authStore: authStore,
                        signOut: authStore.signOut
                    )
                }
            }
        }
        .tint(GweiloTheme.accent)
        .onChange(
            of: pushNotifications.pendingSessionID,
            initial: true
        ) {
            guard pushNotifications.pendingSessionID != nil else { return }
            selectedTab = .sessions
        }
        .onChange(
            of: pushNotifications.shouldOpenSessions,
            initial: true
        ) {
            guard pushNotifications.shouldOpenSessions else { return }
            selectedTab = .sessions
            pushNotifications.consumeSessionsDestination()
        }
        .onChange(
            of: pushNotifications.shouldOpenStatistics,
            initial: true
        ) {
            guard pushNotifications.shouldOpenStatistics else { return }
            selectedTab = .rankings
            pushNotifications.consumeStatisticsDestination()
        }
    }

    private func openActiveSession(_ session: SessionSummary) {
        requestedActiveSessionID = session.id
        selectedTab = .sessions
    }

    private func didOpenRequestedSession(_ sessionID: UUID) {
        if requestedActiveSessionID == sessionID {
            requestedActiveSessionID = nil
        }
        if pushNotifications.pendingSessionID == sessionID {
            pushNotifications.consumePendingSession(sessionID)
        }
    }
}

private struct ActiveSessionAccessoryHost<Content: View>: View {
    let session: SessionSummary?
    let isHidden: Bool
    let openSession: (SessionSummary) -> Void
    @ViewBuilder let content: Content

    var body: some View {
        content
            .floatingTabBarAccessory(
                isPresented: session != nil && !isHidden
            ) {
                if let session {
                    ActiveSessionFloatingButton(
                        session: session,
                        action: { openSession(session) }
                    )
                }
            }
    }
}

private struct ActiveSessionFloatingButton: View {
    let session: SessionSummary
    let action: () -> Void

    private var currentRound: Int {
        session.currentRound ?? 1
    }

    var body: some View {
        Button(action: action) {
            Text(
                "Termin u toku · Runda \(currentRound) od \(session.totalRounds)"
            )
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(GweiloTheme.background)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .contentShape(.capsule)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .adaptiveSurface(
            in: Capsule(),
            interactive: true,
            tint: GweiloTheme.lime.opacity(0.50)
        )
        .accessibilityLabel(
            "Aktivan termin, runda \(currentRound) od \(session.totalRounds)"
        )
        .accessibilityHint("Otvara aktivni termin")
    }
}

private struct AccountView: View {
    let email: String?
    let player: RankingEntry?
    let dataStore: AppDataStore
    let pushNotifications: PushNotificationManager
    let authStore: AuthStore
    let signOut: () -> Void
    @State private var showsSignOutConfirmation = false

    private var version: String {
        Bundle.main.object(
            forInfoDictionaryKey: "CFBundleShortVersionString"
        ) as? String ?? "—"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                List {
                    Section("NALOG") {
                        LabeledContent("Prijavljen kao") {
                            Text(email ?? "Gweilo član")
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        if let player {
                            NavigationLink(value: player) {
                                Label("Moj profil igrača", systemImage: "person.text.rectangle")
                            }
                        }

                        NavigationLink {
                            AccountSettingsView(
                                authStore: authStore,
                                initialProfile: player.map {
                                    AccountProfile(
                                        displayName: $0.name,
                                        avatarURL: $0.avatarURL
                                    )
                                },
                                refreshAppData: {
                                    await dataStore.load(forceRefresh: true)
                                }
                            )
                        } label: {
                            Label("Podešavanja naloga", systemImage: "person.crop.circle")
                        }
                    }

                    Section("KLUB") {
                        NavigationLink {
                            EloCalculatorView(dataStore: dataStore)
                        } label: {
                            Label(
                                "Elo kalkulator",
                                systemImage: "plus.forwardslash.minus"
                            )
                        }

                        NavigationLink {
                            RulesView(eligibility: dataStore.rankingEligibility)
                        } label: {
                            Label("Pravila", systemImage: "book.closed")
                        }
                    }

                    if
                        dataStore.isAdmin,
                        let configuration = authStore.configuration,
                        let session = authStore.session
                    {
                        Section("ADMINISTRACIJA") {
                            NavigationLink {
                                AdminUsersView(
                                    configuration: configuration,
                                    accessToken: session.accessToken,
                                    currentUserID: session.user.id
                                )
                            } label: {
                                Label(
                                    "Upravljanje korisnicima",
                                    systemImage: "person.2.badge.gearshape"
                                )
                            }

                            NavigationLink {
                                AdminActivityView(
                                    configuration: configuration,
                                    accessToken: session.accessToken,
                                    currentUserID: session.user.id
                                )
                            } label: {
                                Label(
                                    "Aktivnost",
                                    systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90"
                                )
                            }

                            NavigationLink {
                                AdminMissionsView(
                                    configuration: configuration,
                                    accessToken: session.accessToken
                                )
                            } label: {
                                Label(
                                    "Misije",
                                    systemImage: "scope"
                                )
                            }
                        }
                    }

                    Section("APLIKACIJA") {
                        NavigationLink {
                            SettingsView(
                                pushNotifications: pushNotifications
                            )
                        } label: {
                            Label("Podešavanja", systemImage: "gearshape")
                        }
                        LabeledContent("Verzija", value: version)
                        LabeledContent("Server", value: "www.gweilo.lol")
                    }

                    Section {
                        Button("Odjavi se", role: .destructive) {
                            showsSignOutConfirmation = true
                        }
                    } footer: {
                        Text("Podaci za prijavu bezbedno su sačuvani na ovom iPhone-u.")
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Više")
            .navigationDestination(for: RankingEntry.self) { player in
                PlayerProfileView(
                    player: player,
                    dataStore: dataStore
                )
            }
            .confirmationDialog(
                "Odjaviti se iz Gweilo aplikacije?",
                isPresented: $showsSignOutConfirmation,
                titleVisibility: .visible
            ) {
                Button("Odjavi se", role: .destructive) {
                    Task {
                        await pushNotifications.unregisterCurrentDevice()
                        signOut()
                    }
                }
                Button("Otkaži", role: .cancel) {}
            }
        }
    }
}

private struct SettingsView: View {
    let pushNotifications: PushNotificationManager
    @AppStorage(GweiloPreferenceKey.hapticsEnabled)
    private var hapticsEnabled = true
    @AppStorage(GweiloPreferenceKey.confirmRoundSubmission)
    private var confirmsRoundSubmission = false

    init(
        pushNotifications: PushNotificationManager = .shared
    ) {
        self.pushNotifications = pushNotifications
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            List {
                Section {
                    Toggle(isOn: $hapticsEnabled) {
                        Label("Vibracija pri unosu rezultata", systemImage: "waveform")
                    }
                    .tint(GweiloTheme.lime)

                    Toggle(isOn: $confirmsRoundSubmission) {
                        Label("Potvrda čuvanja runde", systemImage: "checkmark.shield")
                    }
                    .tint(GweiloTheme.lime)
                } header: {
                    Text("IGRA")
                } footer: {
                    Text(
                        "Potvrda je preporučena. Server dodatno štiti svaku rundu od dvostrukog čuvanja."
                    )
                }

                NotificationSettingsSection(
                    manager: pushNotifications
                )

                Section {
                    LabeledContent("Izgled", value: "Tamni")
                    LabeledContent("Elo obračun", value: "Server")
                    LabeledContent("Izvor podataka", value: "Supabase")
                } header: {
                    Text("SISTEM")
                } footer: {
                    Text(
                        "Izgled i način obračuna rejtinga unapred su određeni i ovde su prikazani radi jasnoće."
                    )
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("Podešavanja")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LeaderboardRule: Identifiable {
    let id: String
    let marker: String
    let title: String
    let description: String
    let accent: Color
}

private struct RulesView: View {
    let eligibility: RankingEligibility

    init(eligibility: RankingEligibility = .fallback) {
        self.eligibility = eligibility
    }

    private var rules: [LeaderboardRule] {
        [
        LeaderboardRule(
            id: "singles",
            marker:
                "\(eligibility.singles.minimumMatches) / "
                + "\(eligibility.singles.maximumInactivityDays)",
            title: "Lista singl igrača",
            description:
                "Odigrati najmanje \(eligibility.singles.minimumMatches) singl mečeva "
                + "i najmanje jedan singl meč u poslednjih "
                + "\(eligibility.singles.maximumInactivityDays) dana.",
            accent: GweiloTheme.lime
        ),
        LeaderboardRule(
            id: "doubles-players",
            marker:
                "\(eligibility.doublesPlayers.minimumMatches) / "
                + "\(eligibility.doublesPlayers.maximumInactivityDays)",
            title: "Igrači dublova",
            description:
                "Odigrati najmanje \(eligibility.doublesPlayers.minimumMatches) dubl mečeva "
                + "i najmanje jedan dubl meč u poslednjih "
                + "\(eligibility.doublesPlayers.maximumInactivityDays) dana.",
            accent: GweiloTheme.accentBright
        ),
        LeaderboardRule(
            id: "doubles-teams",
            marker:
                "\(eligibility.doublesTeams.minimumMatches) / "
                + "\(eligibility.doublesTeams.maximumInactivityDays)",
            title: "Dubl timovi",
            description:
                "Tim mora zajedno odigrati najmanje \(eligibility.doublesTeams.minimumMatches) mečeva "
                + "i bar jedan zajednički meč u poslednjih "
                + "\(eligibility.doublesTeams.maximumInactivityDays) dana.",
            accent: GweiloTheme.cyan
        ),
        LeaderboardRule(
            id: "return",
            marker: "AUTO",
            title: "Povratak na listu",
            description:
                "Rezultati i Elo se nikada ne brišu. Igrač ili tim automatski se vraća čim ponovo ispuni uslove.",
            accent: GweiloTheme.coral
        )
        ]
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    RulesHero()

                    ForEach(rules) { rule in
                        LeaderboardRuleRow(rule: rule)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 48)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle("Pravila")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct RulesHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("GWEILO")
                    .foregroundStyle(GweiloTheme.background)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(GweiloTheme.lime)

                Text("USLOVI ZA LISTU")
                    .foregroundStyle(GweiloTheme.lime)
                    .tracking(1.5)
            }
            .font(.caption2.weight(.black))

            Text("Zasluži svoje mesto.\nOstani aktivan.")
                .font(
                    GweiloTheme.displayFont(
                        size: 42,
                        relativeTo: .largeTitle
                    )
                )
                .textCase(.uppercase)
                .tracking(0.2)

            Text(
                "Ova pravila određuju ko se prikazuje u Statistici i među najbolja 3. Igrač ili tim koji ne ispunjava uslove samo se sakriva — rezultati i Elo ostaju sačuvani."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 28)
        .padding(.bottom, 30)
    }
}

private struct LeaderboardRuleRow: View {
    let rule: LeaderboardRule

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            Text(rule.marker)
                .font(.caption.monospacedDigit().weight(.black))
                .foregroundStyle(rule.accent)
                .frame(width: 54, alignment: .leading)

            VStack(alignment: .leading, spacing: 7) {
                Text(rule.title)
                    .font(.headline)

                Text(rule.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 20)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 0.7)
        }
        .accessibilityElement(children: .combine)
    }
}
