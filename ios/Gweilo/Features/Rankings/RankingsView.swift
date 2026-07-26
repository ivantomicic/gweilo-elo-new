import Charts
import SwiftUI

private enum RankingDestination: Hashable {
    case player(RankingEntry)
    case team(RankingEntry)
}

struct RankingsView: View {
    let dataStore: AppDataStore
    @State private var category = RankingCategory.singles
    @State private var pageDirection = 1.0

    private var entries: [RankingEntry] {
        dataStore.rankings(for: category)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        RankingsHeader(
                            category: category,
                            selectCategory: selectCategory
                        )

                        ZStack(alignment: .topLeading) {
                            RankingsCategoryPage(
                                entries: entries,
                                destination: {
                                    destination(for: $0, in: category)
                                },
                                isLoading: dataStore.isLoading,
                                errorMessage: dataStore.errorMessage,
                                retry: {
                                    Task { await dataStore.load() }
                                }
                            )
                            .id(category)
                            .transition(categoryTransition)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
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
            .navigationDestination(for: RankingDestination.self) { destination in
                switch destination {
                case let .player(player):
                    PlayerProfileView(
                        player: player,
                        dataStore: dataStore
                    )
                case let .team(team):
                    DoublesTeamProfileView(
                        team: team,
                        dataStore: dataStore
                    )
                }
            }
        }
    }

    private var categoryTransition: AnyTransition {
        .asymmetric(
            insertion: .offset(x: 22 * pageDirection).combined(with: .opacity),
            removal: .offset(x: -14 * pageDirection).combined(with: .opacity)
        )
    }

    private func selectCategory(_ newCategory: RankingCategory) {
        guard newCategory != category,
              let currentIndex = RankingCategory.allCases.firstIndex(of: category),
              let newIndex = RankingCategory.allCases.firstIndex(of: newCategory) else {
            return
        }
        pageDirection = newIndex > currentIndex ? 1 : -1
        withAnimation(.snappy(duration: 0.28, extraBounce: 0)) {
            category = newCategory
        }
    }

    private func destination(
        for entry: RankingEntry,
        in category: RankingCategory
    ) -> RankingDestination? {
        switch category {
        case .singles:
            .player(entry)
        case .doublesPlayers:
            nil
        case .doublesTeams:
            .team(entry)
        }
    }
}

private struct RankingsHeader: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    let category: RankingCategory
    let selectCategory: (RankingCategory) -> Void
    @Namespace private var selectionIndicator

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("TRENUTNI ELO")
                        .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                        .tracking(1.8)
                        .foregroundStyle(GweiloTheme.lime)

                    Text("RANG LISTA")
                        .font(GweiloTheme.displayFont(size: 46, relativeTo: .largeTitle))
                        .tracking(-0.5)
                        .foregroundStyle(GweiloTheme.bone)
                }

                Spacer(minLength: 0)

                Color.clear
                    .frame(width: 112, height: 104)
                    .overlay(alignment: .topTrailing) {
                        LoopingBundleVideo(
                            resourceName: "RankingsHeader",
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

            HStack(spacing: 24) {
                ForEach(RankingCategory.allCases) { option in
                    Button {
                        selectCategory(option)
                    } label: {
                        VStack(spacing: 8) {
                            Text(option.displayName.uppercased())
                                .font(GweiloTheme.labelFont(size: 13, relativeTo: .caption))
                                .tracking(0.8)
                                .foregroundStyle(
                                    category == option
                                        ? GweiloTheme.bone
                                        : GweiloTheme.muted
                                )

                            ZStack {
                                Color.clear
                                .frame(height: 2)

                                if category == option {
                                    Rectangle()
                                        .fill(GweiloTheme.lime)
                                        .matchedGeometryEffect(
                                            id: "ranking-selection",
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
                        category == option ? .isSelected : []
                    )
                }
            }
            .sensoryFeedback(.selection, trigger: category)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Kategorija rangiranja")
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(GweiloTheme.hairline)
                    .frame(height: 1)
            }
        }
        .padding(.top, 18)
    }
}

private struct RankingsCategoryPage: View {
    let entries: [RankingEntry]
    let destination: (RankingEntry) -> RankingDestination?
    let isLoading: Bool
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        RankingsContent(
            entries: entries,
            destination: destination,
            isLoading: isLoading,
            errorMessage: errorMessage,
            retry: retry
        )
    }
}

private struct RankingsContent: View {
    let entries: [RankingEntry]
    let destination: (RankingEntry) -> RankingDestination?
    let isLoading: Bool
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        if isLoading, entries.isEmpty {
            GweiloLoadingView("Učitavanje rang-liste…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let errorMessage, entries.isEmpty {
            ContentUnavailableView {
                Label(
                    "Nije moguće učitati rang-listu",
                    systemImage: "wifi.exclamationmark"
                )
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Pokušaj ponovo", action: retry)
                    .buttonStyle(.borderedProminent)
            }
        } else if entries.isEmpty {
            ContentUnavailableView(
                "Nema rangiranih igrača",
                systemImage: "trophy",
                description: Text(
                    "Igrači će se pojaviti nakon dovoljnog broja završenih mečeva."
                )
            )
        } else {
            RankingsTable(
                entries: entries,
                destination: destination
            )
        }
    }
}

private struct RankingsTable: View {
    let entries: [RankingEntry]
    let destination: (RankingEntry) -> RankingDestination?

    var body: some View {
        VStack(spacing: 0) {
            RankingColumnLabels()
            Divider()

            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                if let destination = destination(entry) {
                    NavigationLink(value: destination) {
                        RankingRecord(
                            rank: index + 1,
                            entry: entry,
                            showsDisclosure: true
                        )
                    }
                    .buttonStyle(ResponsiveButtonStyle())
                } else {
                    RankingRecord(
                        rank: index + 1,
                        entry: entry,
                        showsDisclosure: false
                    )
                }

                if entry.id != entries.last?.id {
                    Divider()
                }
            }
        }
    }
}

private struct RankingColumnLabels: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("IGRAČ")
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

private struct RankingRecord: View {
    let rank: Int
    let entry: RankingEntry
    let showsDisclosure: Bool

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 9) {
                    RankedPlayerAvatar(
                        rank: rank,
                        name: entry.name,
                        initials: entry.initials,
                        avatarURL: entry.avatarURL,
                        size: 38
                    )
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.name)
                            .font(.body.weight(.semibold))
                            .lineLimit(1)
                        matchSummary
                    }
                }
            }

            Spacer(minLength: 8)

            RecentFormBar(values: entry.recentForm)
                .frame(width: 56)

            Text("\(entry.elo)")
                .font(GweiloTheme.displayFont(size: 19, relativeTo: .body).monospacedDigit())
                .foregroundStyle(GweiloTheme.bone)
                .fixedSize(horizontal: true, vertical: false)
                .frame(width: 60, alignment: .trailing)

            if showsDisclosure {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.tertiary)
                    .frame(width: 8)
            }
        }
        .foregroundStyle(.primary)
        .padding(.vertical, 13)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Pozicija \(rank), \(entry.name), \(entry.elo) Elo, "
                + "\(entry.wins) pobeda, \(entry.draws) nerešenih, "
                + "\(entry.losses) poraza"
        )
    }

    private var matchSummary: some View {
        HStack(spacing: 2) {
            Text("\(entry.matches)")
                .foregroundStyle(.secondary)
            Text("\(entry.wins)")
                .foregroundStyle(GweiloTheme.lime)
            Text("–")
                .foregroundStyle(.secondary)
            Text("\(entry.draws)")
                .foregroundStyle(GweiloTheme.amber)
            Text("–")
                .foregroundStyle(.secondary)
            Text("\(entry.losses)")
                .foregroundStyle(GweiloTheme.coral)
        }
        .font(.caption2.monospacedDigit())
        .lineLimit(1)
    }
}

private struct RankedPlayerAvatar: View {
    let rank: Int
    let name: String
    let initials: String
    let avatarURL: URL?
    let size: CGFloat

    var body: some View {
        PlayerIdentityAvatar(
            name: name,
            initials: initials,
            avatarURL: avatarURL,
            size: size
        )
        .overlay(alignment: .topLeading) {
            rankBadge
                .offset(x: -4, y: -4)
        }
        .padding(.leading, 2)
    }

    @ViewBuilder
    private var rankBadge: some View {
        switch rank {
        case 1:
            placementBadge(named: "RankGold")
        case 2:
            placementBadge(named: "RankSilver")
        case 3:
            placementBadge(named: "RankBronze")
        default:
            Text("\(rank)")
                .font(
                    GweiloTheme.labelFont(
                        size: 10,
                        relativeTo: .caption2
                    )
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

    private func placementBadge(named assetName: String) -> some View {
        Image(assetName)
            .resizable()
            .scaledToFit()
            .frame(width: 17, height: 17)
    }
}

private struct RecentFormBar: View {
    let values: [Double]

    private var paddedValues: [Double?] {
        let recent = values.suffix(5).map(Optional.some)
        return Array(repeating: nil, count: max(0, 5 - recent.count)) + recent
    }

    private var gradient: LinearGradient {
        let colors = paddedValues.map(color)
        var stops = [
            Gradient.Stop(color: colors[0], location: 0)
        ]

        for index in 0..<(colors.count - 1) {
            let boundary = Double(index + 1) / Double(colors.count)
            stops.append(
                Gradient.Stop(
                    color: colors[index],
                    location: max(0, boundary - 0.1)
                )
            )
            stops.append(
                Gradient.Stop(
                    color: colors[index + 1],
                    location: min(1, boundary + 0.1)
                )
            )
        }
        stops.append(Gradient.Stop(color: colors[colors.count - 1], location: 1))

        return LinearGradient(
            gradient: Gradient(stops: stops),
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(gradient)
            .frame(height: 8)
            .accessibilityLabel("Forma tokom poslednjih pet termina")
            .accessibilityValue(accessibilityValue)
    }

    private func color(for value: Double?) -> Color {
        guard let value else {
            return GweiloTheme.muted.opacity(0.18)
        }
        return EloPerformanceBand(delta: value).color
    }

    private var accessibilityValue: String {
        paddedValues.map { value in
            guard let value else { return "bez rezultata" }
            let prefix = value > 0 ? "+" : ""
            return "\(prefix)\(Int(value.rounded())) Elo"
        }
        .joined(separator: ", ")
    }
}

struct PlayerProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let player: RankingEntry
    let dataStore: AppDataStore

    @State private var history: PlayerEloHistory?
    @State private var headToHead: PlayerHeadToHead?
    @State private var isLoading = false
    @State private var isLoadingComparison = false
    @State private var errorMessage: String?
    @State private var comparisonErrorMessage: String?
    @State private var hasFinishedInitialLoad: Bool

    init(
        player: RankingEntry,
        dataStore: AppDataStore,
        initialHistory: PlayerEloHistory? = nil,
        initialHeadToHead: PlayerHeadToHead? = nil
    ) {
        self.player = player
        self.dataStore = dataStore
        let cachedHistory = initialHistory
            ?? dataStore.cachedPlayerEloHistory(for: player.id)
        let cachedHeadToHead = initialHeadToHead
            ?? dataStore.cachedHeadToHead(for: player.id)
        let needsRemoteData = cachedHistory == nil
        _history = State(
            initialValue: cachedHistory
        )
        _headToHead = State(
            initialValue: cachedHeadToHead
        )
        _hasFinishedInitialLoad = State(initialValue: !needsRemoteData)
        loadsRemoteData = needsRemoteData
    }

    private let loadsRemoteData: Bool

    private var recentResults: [PlayerEloHistoryPoint] {
        Array(
            (history?.points ?? [])
                .filter { $0.match > 0 && $0.opponent != nil }
                .reversed()
        )
    }

    private var singlesRank: Int? {
        dataStore.singlesRankings.firstIndex {
            $0.id == player.id
        }
        .map { $0 + 1 }
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            if hasFinishedInitialLoad {
                ScrollViewReader { scrollProxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 30) {
                            PlayerProfileHeader(
                                player: player,
                                rank: singlesRank,
                                goBack: { dismiss() }
                            )
                            PlayerRecordStrip(player: player)

                            if let history {
                                EloHistoryChart(
                                    history: history,
                                    accessibilityTitle: "Kretanje singl Elo rejtinga"
                                )
                            } else if let errorMessage {
                                DataErrorNotice(
                                    message: errorMessage,
                                    retry: {
                                        Task { await loadHistory() }
                                    }
                                )
                            }

                            RecentEloResults(
                                title: nil,
                                emptyMessage: "Poslednji singl rezultati pojaviće se ovde.",
                                results: recentResults,
                                comparisonOpponentID: player.id == dataStore.currentUserID
                                    ? nil
                                    : dataStore.currentUserID,
                                comparisonOpponentName: headToHead?.opponent.name,
                                comparison: headToHead,
                                isLoadingComparison: isLoadingComparison,
                                comparisonErrorMessage: comparisonErrorMessage,
                                retryComparison: ensureHeadToHeadLoaded,
                                onSelectAgainstMe: ensureHeadToHeadLoaded,
                                onScopeChange: {
                                    keepMatchesVisible(using: scrollProxy)
                                }
                            )
                            .id(PlayerProfileScrollTarget.matches)
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 44)
                    }
                    .scrollIndicators(.hidden)
                }
            } else {
                GweiloLoadingView("Učitavam igrača…", size: 172)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .toolbarVisibility(.hidden, for: .navigationBar)
        .task(id: player.id) {
            if loadsRemoteData {
                await loadHistory()
                hasFinishedInitialLoad = true
            }
        }
        .refreshable {
            await load(forceRefresh: true)
        }
    }

    private func load(forceRefresh: Bool = false) async {
        async let historyLoad: Void = loadHistory(forceRefresh: forceRefresh)
        if player.id != dataStore.currentUserID {
            async let comparisonLoad: Void = loadHeadToHead(
                forceRefresh: forceRefresh
            )
            _ = await (historyLoad, comparisonLoad)
        } else {
            await historyLoad
        }
    }

    private func loadHistory(forceRefresh: Bool = false) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            history = try await dataStore.playerEloHistory(
                for: player.id,
                forceRefresh: forceRefresh
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadHeadToHead(forceRefresh: Bool = false) async {
        guard !isLoadingComparison else { return }
        isLoadingComparison = true
        comparisonErrorMessage = nil
        defer { isLoadingComparison = false }
        do {
            headToHead = try await dataStore.headToHead(
                for: player.id,
                forceRefresh: forceRefresh
            )
        } catch {
            comparisonErrorMessage = error.localizedDescription
        }
    }

    private func ensureHeadToHeadLoaded() {
        guard
            player.id != dataStore.currentUserID,
            headToHead == nil,
            !isLoadingComparison
        else {
            return
        }
        Task {
            await loadHeadToHead()
        }
    }

    private func keepMatchesVisible(using scrollProxy: ScrollViewProxy) {
        Task { @MainActor in
            await Task.yield()
            if reduceMotion {
                scrollProxy.scrollTo(
                    PlayerProfileScrollTarget.matches,
                    anchor: .top
                )
            } else {
                withAnimation(.easeOut(duration: 0.18)) {
                    scrollProxy.scrollTo(
                        PlayerProfileScrollTarget.matches,
                        anchor: .top
                    )
                }
            }
        }
    }
}

private enum PlayerProfileScrollTarget: Hashable {
    case matches
}

struct DoublesTeamProfileView: View {
    let team: RankingEntry
    let dataStore: AppDataStore

    @State private var profile: DoublesTeamProfile?
    @State private var history: PlayerEloHistory?
    @State private var isLoading = false
    @State private var errorMessage: String?

    init(
        team: RankingEntry,
        dataStore: AppDataStore,
        initialProfile: DoublesTeamProfile? = nil,
        initialHistory: PlayerEloHistory? = nil
    ) {
        self.team = team
        self.dataStore = dataStore
        _profile = State(
            initialValue: initialProfile
                ?? dataStore.cachedDoublesTeamProfile(for: team.id)
        )
        _history = State(
            initialValue: initialHistory
                ?? dataStore.cachedDoublesTeamEloHistory(for: team.id)
        )
        loadsRemoteData = initialProfile == nil && initialHistory == nil
    }

    private let loadsRemoteData: Bool

    private var recentResults: [PlayerEloHistoryPoint] {
        Array(
            (history?.points ?? [])
                .filter { $0.match > 0 }
                .suffix(5)
                .reversed()
        )
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 30) {
                    if let profile {
                        DoublesTeamHeader(profile: profile)
                        DoublesTeamRecordStrip(profile: profile)

                        VStack(alignment: .leading, spacing: 14) {
                            SectionHeading(title: "Team Elo")
                            if let history {
                                EloHistoryChart(
                                    history: history,
                                    accessibilityTitle: "Kretanje Elo rejtinga dubl tima"
                                )
                            }
                        }

                        RecentEloResults(
                            title: "Recent doubles",
                            emptyMessage: "Recent doubles results will appear here.",
                            results: recentResults
                        )
                    } else if isLoading {
                        GweiloLoadingView("Loading doubles team…")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 80)
                    } else if let errorMessage {
                        DataErrorNotice(
                            message: errorMessage,
                            retry: {
                                Task { await load() }
                            }
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle(profile?.name ?? team.name)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: team.id) {
            if loadsRemoteData {
                await load()
            }
        }
        .refreshable {
            await load(forceRefresh: true)
        }
    }

    private func load(forceRefresh: Bool = false) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let profileRequest = dataStore.doublesTeamProfile(
                for: team.id,
                forceRefresh: forceRefresh
            )
            async let historyRequest = dataStore.doublesTeamEloHistory(
                for: team.id,
                forceRefresh: forceRefresh
            )
            let loaded = try await (profileRequest, historyRequest)
            profile = loaded.0
            history = loaded.1
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct DoublesTeamHeader: View {
    let profile: DoublesTeamProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("DOUBLES TEAM")
                .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                .tracking(1.8)
                .foregroundStyle(GweiloTheme.lime)

            HStack(spacing: 16) {
                TeamMemberIdentity(member: profile.playerOne)

                Text("+")
                    .font(GweiloTheme.displayFont(size: 30, relativeTo: .title2))
                    .foregroundStyle(GweiloTheme.accentBright)

                TeamMemberIdentity(member: profile.playerTwo)
            }

            Text("\(profile.elo) Elo")
                .font(GweiloTheme.labelFont(size: 19, relativeTo: .headline).monospacedDigit())
                .foregroundStyle(GweiloTheme.accentBright)
        }
        .padding(.top, 14)
    }
}

private struct TeamMemberIdentity: View {
    let member: DoublesTeamMember

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            PlayerIdentityAvatar(
                name: member.name,
                initials: member.initials,
                avatarURL: member.avatarURL,
                size: 64
            )

            Text(member.name)
                .font(.headline)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct DoublesTeamRecordStrip: View {
    let profile: DoublesTeamProfile

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 0) {
                ProfileMetric(value: "\(profile.matches)", label: "MATCHES")
                ProfileMetric(value: "\(profile.wins)", label: "WINS")
                ProfileMetric(value: "\(profile.draws)", label: "DRAWS")
                ProfileMetric(value: "\(profile.losses)", label: "LOSSES")
            }

            HStack {
                Text("SETS")
                    .font(GweiloTheme.labelFont(size: 11, relativeTo: .caption2))
                    .tracking(1)
                    .foregroundStyle(GweiloTheme.muted)
                Spacer()
                Text("\(profile.setsWon)–\(profile.setsLost)")
                    .font(GweiloTheme.displayFont(size: 22, relativeTo: .title3).monospacedDigit())
                    .foregroundStyle(GweiloTheme.bone)
            }
        }
        .padding(.vertical, 15)
        .overlay(alignment: .top) { Divider() }
        .overlay(alignment: .bottom) { Divider() }
    }
}

#if DEBUG
struct RankingsPreviewScreen: View {
    private let dataStore: AppDataStore

    init() {
        let store = AppDataStore(
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
        let players = Self.previewEntries
        store.seedRankingsPreview(
            singles: players,
            doublesPlayers: players.map {
                RankingEntry(
                    id: $0.id,
                    name: $0.name,
                    avatarURL: $0.avatarURL,
                    elo: $0.elo - 34,
                    matches: max($0.matches - 6, 6),
                    wins: $0.wins,
                    losses: $0.losses,
                    draws: $0.draws,
                    rankDays: nil,
                    recentForm: Array($0.recentForm.reversed())
                )
            },
            doublesTeams: Array(players.prefix(4)).map {
                RankingEntry(
                    id: $0.id,
                    name: "\($0.name) + Partner",
                    avatarURL: nil,
                    elo: $0.elo - 51,
                    matches: max($0.matches / 2, 6),
                    wins: $0.wins / 2,
                    losses: $0.losses / 2,
                    draws: $0.draws,
                    rankDays: nil,
                    recentForm: Array($0.recentForm.dropFirst()) + [8]
                )
            }
        )
        dataStore = store
    }

    var body: some View {
        RankingsView(dataStore: dataStore)
    }

    private static let previewEntries = [
        makeEntry(1, "Ivan", 1_718, 219, 132, 77, 10),
        makeEntry(2, "Gara", 1_626, 138, 75, 54, 9),
        makeEntry(3, "Leo", 1_624, 110, 69, 30, 11),
        makeEntry(4, "Miladin", 1_568, 164, 86, 69, 9),
        makeEntry(5, "Andrej", 1_495, 231, 103, 108, 20)
    ]

    private static func makeEntry(
        _ suffix: Int,
        _ name: String,
        _ elo: Int,
        _ matches: Int,
        _ wins: Int,
        _ losses: Int,
        _ draws: Int
    ) -> RankingEntry {
        RankingEntry(
            id: UUID(
                uuidString: String(
                    format: "00000000-0000-0000-0000-%012d",
                    suffix
                )
            )!,
            name: name,
            avatarURL: nil,
            elo: elo,
            matches: matches,
            wins: wins,
            losses: losses,
            draws: draws,
            rankDays: nil,
            recentForm: previewForm(for: suffix)
        )
    }

    private static func previewForm(for suffix: Int) -> [Double] {
        switch suffix {
        case 1: [12, 8, 11, 7, 3]
        case 2: [-8, 9, 6, -7, -12]
        case 3: [4, 7, -2, -9, 11]
        case 4: [-8, 2, 9, 4, 7]
        default: [2, -9, 4, 3, 1]
        }
    }
}

struct DoublesTeamProfilePreviewScreen: View {
    private let teamID = UUID(
        uuidString: "00000000-0000-0000-0000-000000000010"
    )!
    private let ivanID = UUID(
        uuidString: "00000000-0000-0000-0000-000000000001"
    )!
    private let garaID = UUID(
        uuidString: "00000000-0000-0000-0000-000000000002"
    )!

    private var team: RankingEntry {
        RankingEntry(
            id: teamID,
            name: "Ivan + Gara",
            avatarURL: nil,
            elo: 1_642,
            matches: 48,
            wins: 31,
            losses: 14,
            draws: 3,
            rankDays: nil
        )
    }

    private var profile: DoublesTeamProfile {
        DoublesTeamProfile(
            id: teamID,
            name: "Ivan & Gara",
            playerOne: DoublesTeamMember(
                id: ivanID,
                name: "Ivan",
                avatarURL: nil
            ),
            playerTwo: DoublesTeamMember(
                id: garaID,
                name: "Gara",
                avatarURL: nil
            ),
            matches: 48,
            wins: 31,
            losses: 14,
            draws: 3,
            setsWon: 112,
            setsLost: 76,
            elo: 1_642
        )
    }

    private var history: PlayerEloHistory {
        PlayerEloHistory(
            points: [
                .init(match: 1, elo: 1_560, date: .now.addingTimeInterval(-691_200), opponent: "Leo & Miladin", delta: 14),
                .init(match: 2, elo: 1_548, date: .now.addingTimeInterval(-518_400), opponent: "Andrej & Marie", delta: -12),
                .init(match: 3, elo: 1_585, date: .now.addingTimeInterval(-345_600), opponent: "Leo & Miladin", delta: 37),
                .init(match: 4, elo: 1_617, date: .now.addingTimeInterval(-172_800), opponent: "Bata & Andrej", delta: 32),
                .init(match: 5, elo: 1_642, date: .now, opponent: "Leo & Marie", delta: 25)
            ],
            currentElo: 1_642
        )
    }

    private var dataStore: AppDataStore {
        AppDataStore(
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
                user: AuthenticatedUser(id: ivanID, email: "preview@example.com")
            )
        )
    }

    var body: some View {
        NavigationStack {
            DoublesTeamProfileView(
                team: team,
                dataStore: dataStore,
                initialProfile: profile,
                initialHistory: history
            )
        }
    }
}

struct PlayerProfilePreviewScreen: View {
    private let player = RankingEntry(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
        name: "Ivan",
        avatarURL: nil,
        elo: 1_718,
        matches: 219,
        wins: 132,
        losses: 77,
        draws: 10,
        rankDays: nil
    )

    private let history = PlayerEloHistory(
        points: [
            .init(
                match: 1,
                elo: 1_660,
                date: .now.addingTimeInterval(-864_000),
                opponent: "Gara",
                delta: 9,
                outcome: .win,
                scoreFor: 3,
                scoreAgainst: 1
            ),
            .init(
                match: 2,
                elo: 1_649,
                date: .now.addingTimeInterval(-691_200),
                opponent: "Leo",
                delta: -11,
                outcome: .loss,
                scoreFor: 1,
                scoreAgainst: 3
            ),
            .init(
                match: 3,
                elo: 1_674,
                date: .now.addingTimeInterval(-518_400),
                opponent: "Miladin",
                delta: 25,
                outcome: .win,
                scoreFor: 3,
                scoreAgainst: 2
            ),
            .init(
                match: 4,
                elo: 1_691,
                date: .now.addingTimeInterval(-345_600),
                opponent: "Andrej",
                delta: 17,
                outcome: .win,
                scoreFor: 3,
                scoreAgainst: 0
            ),
            .init(
                match: 5,
                elo: 1_704,
                date: .now.addingTimeInterval(-172_800),
                opponent: "Marie",
                delta: 13,
                outcome: .draw,
                scoreFor: 2,
                scoreAgainst: 2
            ),
            .init(
                match: 6,
                elo: 1_718,
                date: .now,
                opponent: "Gara",
                delta: 14,
                outcome: .win,
                scoreFor: 3,
                scoreAgainst: 1
            )
        ],
        currentElo: 1_718
    )

    private let comparison = PlayerHeadToHead(
        player: HeadToHeadPlayer(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
            name: "Ivan",
            avatarURL: nil,
            elo: 1_718,
            wins: 18,
            losses: 11,
            draws: 1,
            setsWon: 67,
            setsLost: 49
        ),
        opponent: HeadToHeadPlayer(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!,
            name: "Gara",
            avatarURL: nil,
            elo: 1_626,
            wins: 11,
            losses: 18,
            draws: 1,
            setsWon: 49,
            setsLost: 67
        ),
        totalMatches: 30
    )

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
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!,
                email: "preview@example.com"
            )
        )
    )

    var body: some View {
        NavigationStack {
            PlayerProfileView(
                player: player,
                dataStore: dataStore,
                initialHistory: history,
                initialHeadToHead: comparison
            )
        }
    }
}

struct RecentResultsPreviewScreen: View {
    private let results = [
        PlayerEloHistoryPoint(
            match: 6,
            elo: 1_718,
            date: .now,
            opponent: "Gara",
            delta: 14,
            outcome: .win,
            scoreFor: 3,
            scoreAgainst: 1
        ),
        PlayerEloHistoryPoint(
            match: 5,
            elo: 1_704,
            date: .now.addingTimeInterval(-172_800),
            opponent: "Marie",
            delta: 13,
            outcome: .draw,
            scoreFor: 2,
            scoreAgainst: 2
        ),
        PlayerEloHistoryPoint(
            match: 4,
            elo: 1_691,
            date: .now.addingTimeInterval(-345_600),
            opponent: "Andrej",
            delta: -11,
            outcome: .loss,
            scoreFor: 1,
            scoreAgainst: 3
        ),
        PlayerEloHistoryPoint(
            match: 3,
            elo: 1_702,
            date: .now.addingTimeInterval(-518_400),
            opponent: "Miladin",
            delta: 8
        ),
        PlayerEloHistoryPoint(
            match: 2,
            elo: 1_694,
            date: .now.addingTimeInterval(-691_200),
            opponent: "Leo",
            delta: -4
        )
    ]

    var body: some View {
        ZStack {
            ArenaBackground()

            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("PLAYER PROFILE")
                        .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                        .tracking(1.8)
                        .foregroundStyle(GweiloTheme.lime)

                    Text("RECENT FORM")
                        .font(GweiloTheme.displayFont(size: 42, relativeTo: .largeTitle))
                }

                RecentEloResults(
                    title: "Recent singles",
                    emptyMessage: "",
                    results: results
                )

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
        }
    }
}
#endif

private struct PlayerProfileHeader: View {
    let player: RankingEntry
    let rank: Int?
    let goBack: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            PlayerProfilePortrait(
                player: player,
                rank: rank,
                goBack: goBack
            )

            VStack(alignment: .leading, spacing: 5) {
                Text(player.name.uppercased())
                    .font(
                        GweiloTheme.displayFont(
                            size: 40,
                            relativeTo: .largeTitle
                        )
                    )
                    .tracking(-0.4)
                    .foregroundStyle(GweiloTheme.bone)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Text("\(player.elo) Elo")
                    .font(
                        GweiloTheme.labelFont(
                            size: 17,
                            relativeTo: .headline
                        )
                        .monospacedDigit()
                    )
                    .foregroundStyle(GweiloTheme.accentBright)

                if !player.recentForm.isEmpty {
                    HStack(spacing: 8) {
                        Text("FORMA")
                            .font(
                                GweiloTheme.labelFont(
                                    size: 9,
                                    relativeTo: .caption2
                                )
                            )
                            .tracking(0.8)
                            .foregroundStyle(GweiloTheme.muted)

                        RecentFormBar(values: player.recentForm)
                            .frame(width: 58)
                    }
                    .padding(.top, 5)
                }
            }
            .layoutPriority(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, 18)
        .padding(.bottom, 4)
    }
}

private struct PlayerProfilePortrait: View {
    let player: RankingEntry
    let rank: Int?
    let goBack: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            AsyncImage(
                url: player.avatarURL,
                transaction: Transaction(animation: nil)
            ) { phase in
                switch phase {
                case let .success(image):
                    image
                        .resizable()
                        .interpolation(.high)
                        .scaledToFill()
                default:
                    Text(player.initials)
                        .font(
                            GweiloTheme.displayFont(
                                size: 34,
                                relativeTo: .title2
                            )
                        )
                        .foregroundStyle(GweiloTheme.bone)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(GweiloTheme.raisedSurface)
                }
            }
            .frame(width: 112, height: 112)
            .clipShape(.rect(cornerRadius: 22))
            .overlay {
                RoundedRectangle(cornerRadius: 22)
                    .stroke(
                        LinearGradient(
                            colors: [
                                GweiloTheme.accentBright.opacity(0.75),
                                GweiloTheme.lime.opacity(0.24)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .accessibilityHidden(true)

            PlayerProfileBackButton(action: goBack)
                .offset(x: -8, y: -8)

            if let rank {
                Text("\(rank). MESTO")
                    .font(
                        GweiloTheme.labelFont(
                            size: 10,
                            relativeTo: .caption2
                        )
                        .monospacedDigit()
                    )
                    .tracking(0.4)
                    .foregroundStyle(GweiloTheme.background)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 5)
                    .background(GweiloTheme.lime, in: .capsule)
                    .frame(
                        width: 112,
                        height: 112,
                        alignment: .bottomTrailing
                    )
                    .offset(x: 6, y: 6)
                    .accessibilityLabel("\(rank). mesto")
            }
        }
        .padding(.leading, 4)
        .padding(.top, 4)
    }
}

private struct PlayerProfileBackButton: View {
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, *) {
            button
                .buttonStyle(.glass)
        } else {
            button
                .background(.ultraThinMaterial, in: .circle)
                .overlay {
                    Circle()
                        .stroke(GweiloTheme.hairline, lineWidth: 1)
                }
        }
    }

    private var button: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.body.weight(.bold))
                .foregroundStyle(GweiloTheme.bone)
                .frame(width: 40, height: 40)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Nazad")
    }
}

private struct PlayerRecordStrip: View {
    let player: RankingEntry

    var body: some View {
        HStack(spacing: 12) {
            ProfileOutcomeMetric(outcome: .win, value: player.wins)
            ProfileOutcomeMetric(outcome: .draw, value: player.draws)
            ProfileOutcomeMetric(outcome: .loss, value: player.losses)
        }
        .padding(.vertical, 16)
        .overlay(alignment: .top) { Divider() }
        .overlay(alignment: .bottom) { Divider() }
    }
}

private struct ProfileOutcomeMetric: View {
    let outcome: MatchOutcome
    let value: Int

    private var label: String {
        switch outcome {
        case .win: "Pobede"
        case .draw: "Nerešeno"
        case .loss: "Porazi"
        }
    }

    var body: some View {
        VStack(spacing: 6) {
            MatchOutcomeArtwork(outcome: outcome, size: 52)

            Text("\(value)")
                .font(
                    GweiloTheme.displayFont(size: 24, relativeTo: .title3)
                        .monospacedDigit()
                )
                .foregroundStyle(outcome.color)

            Text(label)
                .font(
                    GweiloTheme.labelFont(
                        size: 10,
                        relativeTo: .caption2
                    )
                )
                .tracking(0.7)
                .foregroundStyle(GweiloTheme.bone)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)")
    }
}

private struct ProfileMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(GweiloTheme.displayFont(size: 23, relativeTo: .title3).monospacedDigit())
                .foregroundStyle(GweiloTheme.bone)
            Text(label)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct EloHistoryChart: View {
    let history: PlayerEloHistory
    let accessibilityTitle: String
    let initialVisibleMatchSpan: Double?
    private let segments: [EloCurveSegment]

    @State private var selectedMatch: Double?
    @State private var visibleMatchSpan: Double?
    @State private var scrollPosition: Double?
    @State private var pinchStartingSpan: Double?

    init(
        history: PlayerEloHistory,
        accessibilityTitle: String,
        initialVisibleMatchSpan: Double? = nil
    ) {
        self.history = history
        self.accessibilityTitle = accessibilityTitle
        self.initialVisibleMatchSpan = initialVisibleMatchSpan
        segments = EloCurveSampler.segments(points: history.points)
    }

    private var viewport: EloChartViewport {
        EloChartViewport(points: history.points)
    }

    private var domain: ClosedRange<Double> {
        let values = history.points.map(\.elo)
        let minimum = values.min() ?? history.currentElo
        let maximum = values.max() ?? history.currentElo
        return (minimum - 25)...(maximum + 25)
    }

    private var selectedPoint: PlayerEloHistoryPoint? {
        guard let selectedMatch else { return nil }
        return history.points.min {
            abs(Double($0.match) - selectedMatch)
                < abs(Double($1.match) - selectedMatch)
        }
    }

    private var currentVisibleSpan: Double {
        visibleMatchSpan ?? viewport.totalSpan
    }

    private var currentScrollPosition: Double {
        scrollPosition ?? viewport.firstMatch
    }

    private var scrollPositionBinding: Binding<Double> {
        Binding(
            get: { currentScrollPosition },
            set: { newValue in
                if scrollPosition != newValue {
                    scrollPosition = newValue
                }
            }
        )
    }

    private var isZoomed: Bool {
        currentVisibleSpan < viewport.totalSpan - 0.01
    }

    var body: some View {
        if history.points.count <= 1 {
            ContentUnavailableView(
                "Još nema Elo istorije",
                systemImage: "chart.xyaxis.line",
                description: Text(
                    "Prvi završen rezultat prikazaće ovaj grafikon."
                )
            )
            .frame(maxWidth: .infinity)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                EloScrubBanner(point: selectedPoint)

                Chart {
                    ForEach(segments) { segment in
                        ForEach(segment.samples) { sample in
                            LineMark(
                                x: .value("Meč", sample.match),
                                y: .value("Elo", sample.elo),
                                series: .value("Deonica", segment.id)
                            )
                            .foregroundStyle(segment.performanceBand.color)
                            .lineStyle(StrokeStyle(lineWidth: 3))
                            .interpolationMethod(.monotone)
                        }
                    }

                    if let latestPoint = history.points.last,
                       latestPoint.id != selectedPoint?.id {
                        PointMark(
                            x: .value("Meč", Double(latestPoint.match)),
                            y: .value("Elo", latestPoint.elo)
                        )
                        .foregroundStyle(GweiloTheme.lime)
                        .symbolSize(56)
                    }

                    if let selectedPoint {
                        RuleMark(
                            x: .value(
                                "Izabrani meč",
                                Double(selectedPoint.match)
                            )
                        )
                            .foregroundStyle(GweiloTheme.bone.opacity(0.38))
                            .lineStyle(
                                StrokeStyle(
                                    lineWidth: 1,
                                    dash: [3, 4]
                                )
                            )

                        PointMark(
                            x: .value(
                                "Izabrani meč",
                                Double(selectedPoint.match)
                            ),
                            y: .value("Izabrani Elo", selectedPoint.elo)
                        )
                        .foregroundStyle(selectedPoint.performanceBand.color)
                        .symbolSize(88)
                    }
                }
                .chartYScale(domain: domain)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { value in
                        AxisGridLine().foregroundStyle(Color.clear)
                        AxisValueLabel {
                            if let match = value.as(Double.self) {
                                Text("\(Int(match.rounded()))")
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) {
                        AxisGridLine()
                            .foregroundStyle(GweiloTheme.hairline)
                        AxisValueLabel()
                    }
                }
                .chartScrollableAxes(.horizontal)
                .chartXVisibleDomain(length: currentVisibleSpan)
                .chartScrollPosition(x: scrollPositionBinding)
                .chartXSelection(value: $selectedMatch)
                .simultaneousGesture(pinchGesture)
                .frame(height: 220)
                .accessibilityLabel(
                    "\(accessibilityTitle), trenutni Elo "
                        + "\(Int(history.currentElo.rounded()))"
                )
                .accessibilityHint(
                    "Zumiraj prstima, prevuci za kretanje kroz istoriju, "
                        + "a zatim zadrži i prevuci za detalje meča"
                )

                ChartViewportControls(
                    visibleMatchCount: visibleMatchCount,
                    totalMatchCount: history.points.count,
                    isZoomed: isZoomed,
                    reset: resetZoom
                )

                ChartPerformanceLegend()

                Text(
                    isZoomed
                        ? "Prevuci za kretanje · Zadrži za detalje"
                        : "Zumiraj prstima · Zadrži za detalje"
                )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .task(id: history.points.last?.match) {
                configureInitialViewport()
            }
        }
    }

    private var visibleMatchCount: Int {
        min(
            history.points.count,
            max(2, Int(currentVisibleSpan.rounded(.down)) + 1)
        )
    }

    private var pinchGesture: some Gesture {
        MagnifyGesture(minimumScaleDelta: 0.01)
            .onChanged { value in
                updateZoom(magnification: Double(value.magnification))
            }
            .onEnded { _ in
                pinchStartingSpan = nil
            }
    }

    private func configureInitialViewport() {
        guard visibleMatchSpan == nil else { return }

        let requestedSpan = initialVisibleMatchSpan ?? viewport.totalSpan
        let initialSpan = viewport.visibleSpan(
            from: requestedSpan,
            magnification: 1
        )
        let focus = selectedMatch ?? viewport.lastMatch

        visibleMatchSpan = initialSpan
        scrollPosition = viewport.leadingPosition(
            centeredOn: focus,
            visibleSpan: initialSpan
        )
    }

    private func updateZoom(magnification: Double) {
        let startingSpan = pinchStartingSpan ?? currentVisibleSpan
        if pinchStartingSpan == nil {
            pinchStartingSpan = startingSpan
        }

        let newSpan = viewport.visibleSpan(
            from: startingSpan,
            magnification: magnification
        )
        guard abs(newSpan - currentVisibleSpan) > 0.005 else { return }

        let visibleCenter = currentScrollPosition + currentVisibleSpan / 2
        let focus: Double
        if let selectedMatch,
           selectedMatch >= currentScrollPosition,
           selectedMatch <= currentScrollPosition + currentVisibleSpan {
            focus = selectedMatch
        } else {
            focus = visibleCenter
        }
        visibleMatchSpan = newSpan
        scrollPosition = viewport.leadingPosition(
            centeredOn: focus,
            visibleSpan: newSpan
        )
    }

    private func resetZoom() {
        withAnimation(.smooth(duration: 0.25)) {
            visibleMatchSpan = viewport.totalSpan
            scrollPosition = viewport.firstMatch
        }
    }
}

private struct EloScrubBanner: View {
    let point: PlayerEloHistoryPoint?

    var body: some View {
        Group {
            if let point {
                EloMatchScrubDetail(point: point)
                    .transition(
                        .asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .trailing)),
                            removal: .opacity
                        )
                    )
            } else {
                HStack(spacing: 12) {
                    Image(systemName: "hand.point.up.left.fill")
                        .font(.title3)
                        .foregroundStyle(GweiloTheme.accentBright)
                        .frame(width: 34, height: 34)
                        .background(GweiloTheme.accentBright.opacity(0.12))
                        .clipShape(.rect(cornerRadius: 8))

                    VStack(alignment: .leading, spacing: 3) {
                        Text("PREGLEDAJ MEČ")
                            .font(
                                GweiloTheme.labelFont(
                                    size: 10,
                                    relativeTo: .caption2
                                )
                            )
                            .tracking(1)
                            .foregroundStyle(GweiloTheme.lime)

                        Text("Zadrži i prevuci preko grafikona")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(GweiloTheme.bone)
                    }

                    Spacer()
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 14)
                .background(GweiloTheme.raisedSurface)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(GweiloTheme.accentBright)
                        .frame(width: 3)
                }
                .transition(.opacity)
                .accessibilityLabel(
                    "Zadrži i prevuci preko grafikona za detalje meča"
                )
            }
        }
        .frame(minHeight: 78)
        .clipShape(.rect(cornerRadius: 8))
        .animation(.smooth(duration: 0.24), value: point?.id)
    }
}

private struct ChartViewportControls: View {
    let visibleMatchCount: Int
    let totalMatchCount: Int
    let isZoomed: Bool
    let reset: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isZoomed ? "hand.draw" : "hand.pinch")
                .foregroundStyle(GweiloTheme.accentBright)

            Text(
                isZoomed
                    ? "\(visibleMatchCount) OD \(totalMatchCount) MEČEVA"
                    : "SVIH \(totalMatchCount) MEČEVA"
            )
            .font(GweiloTheme.labelFont(size: 9, relativeTo: .caption2))
            .tracking(0.7)
            .foregroundStyle(GweiloTheme.muted)

            Spacer()

            if isZoomed {
                Button("Prikaži sve", systemImage: "arrow.up.left.and.arrow.down.right") {
                    reset()
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(GweiloTheme.bone)
                .buttonStyle(.plain)
                .accessibilityHint("Vraća grafikon na prikaz svih mečeva")
            }
        }
        .frame(minHeight: 24)
    }
}

private struct ChartPerformanceLegend: View {
    var body: some View {
        HStack(spacing: 14) {
            ChartPerformanceLegendItem(
                band: .gain,
                label: "DOBITAK >5"
            )
            ChartPerformanceLegendItem(
                band: .steady,
                label: "STABILNO ±5"
            )
            ChartPerformanceLegendItem(
                band: .loss,
                label: "GUBITAK <−5"
            )
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Boje grafikona: zeleno za dobitak veći od 5, "
                + "žuto za promenu do 5 i crveno za gubitak veći od 5"
        )
    }
}

private struct ChartPerformanceLegendItem: View {
    let band: EloPerformanceBand
    let label: String

    var body: some View {
        HStack(spacing: 5) {
            Rectangle()
                .fill(band.color)
                .frame(width: 12, height: 3)

            Text(label)
                .font(GweiloTheme.labelFont(size: 9, relativeTo: .caption2))
                .tracking(0.6)
                .foregroundStyle(GweiloTheme.muted)
        }
    }
}

private struct EloMatchScrubDetail: View {
    let point: PlayerEloHistoryPoint

    private var hasMatchResult: Bool {
        point.outcome != nil
            && point.scoreFor != nil
            && point.scoreAgainst != nil
    }

    private var formattedDelta: String {
        guard let delta = point.delta else { return "—" }
        let value = Int(delta.rounded())
        return value > 0 ? "+\(value)" : "\(value)"
    }

    private var formattedScore: String {
        guard let scoreFor = point.scoreFor,
              let scoreAgainst = point.scoreAgainst else {
            return "—"
        }
        return "\(scoreFor)–\(scoreAgainst)"
    }

    private var localizedOutcome: String {
        switch point.outcome {
        case .win:
            "Pobeda"
        case .draw:
            "Nerešeno"
        case .loss:
            "Poraz"
        case nil:
            ""
        }
    }

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("MEČ \(point.match)")
                    .font(GweiloTheme.labelFont(size: 10, relativeTo: .caption2))
                    .tracking(1)
                    .foregroundStyle(point.performanceBand.color)

                Text("VS \(point.opponent ?? "nepoznatog protivnika")")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(
                    point.date.formatted(
                        .dateTime
                            .day()
                            .month(.abbreviated)
                            .year()
                            .locale(Locale(identifier: "sr_Latn_RS"))
                    )
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 3) {
                Text(
                    hasMatchResult
                        ? "\(localizedOutcome) \(formattedScore)"
                        : formattedDelta
                )
                    .font(
                        GweiloTheme.displayFont(
                            size: 25,
                            relativeTo: .title3
                        )
                        .monospacedDigit()
                    )
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .foregroundStyle(
                        point.outcome?.color ?? point.performanceBand.color
                    )

                Text(
                    hasMatchResult
                        ? "\(formattedDelta) Elo · \(Int(point.elo.rounded()))"
                        : "\(Int(point.elo.rounded())) Elo"
                )
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .background(GweiloTheme.raisedSurface)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(point.performanceBand.color)
                .frame(width: 3)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Meč \(point.match), protiv "
                + "\(point.opponent ?? "nepoznatog protivnika"), "
                + "\(localizedOutcome.isEmpty ? "rezultat nije dostupan" : localizedOutcome), "
                + "rezultat \(formattedScore), \(formattedDelta) Elo, "
                + "novi rejting \(Int(point.elo.rounded()))"
        )
    }
}

private extension EloPerformanceBand {
    var color: Color {
        switch self {
        case .gain:
            GweiloTheme.lime
        case .steady:
            GweiloTheme.amber
        case .loss:
            GweiloTheme.coral
        }
    }
}

struct ChartScrubPreviewScreen: View {
    private let history = PlayerEloHistory(
        points: [
            .init(
                match: 1,
                elo: 1_500,
                date: .now.addingTimeInterval(-1_468_800),
                opponent: "Gara",
                delta: nil
            ),
            .init(
                match: 2,
                elo: 1_491,
                date: .now.addingTimeInterval(-1_382_400),
                opponent: "Leo",
                delta: -9
            ),
            .init(
                match: 3,
                elo: 1_494,
                date: .now.addingTimeInterval(-1_296_000),
                opponent: "Miladin",
                delta: 3
            ),
            .init(
                match: 4,
                elo: 1_502,
                date: .now.addingTimeInterval(-1_209_600),
                opponent: "Andrej",
                delta: 8
            ),
            .init(
                match: 5,
                elo: 1_498,
                date: .now.addingTimeInterval(-1_123_200),
                opponent: "Marie",
                delta: -4
            ),
            .init(
                match: 6,
                elo: 1_510,
                date: .now.addingTimeInterval(-1_036_800),
                opponent: "Gara",
                delta: 12
            ),
            .init(
                match: 7,
                elo: 1_503,
                date: .now.addingTimeInterval(-950_400),
                opponent: "Leo",
                delta: -7
            ),
            .init(
                match: 8,
                elo: 1_507,
                date: .now.addingTimeInterval(-864_000),
                opponent: "Miladin",
                delta: 4
            ),
            .init(
                match: 9,
                elo: 1_521,
                date: .now.addingTimeInterval(-777_600),
                opponent: "Andrej",
                delta: 14
            ),
            .init(
                match: 10,
                elo: 1_515,
                date: .now.addingTimeInterval(-691_200),
                opponent: "Marie",
                delta: -6
            ),
            .init(
                match: 11,
                elo: 1_518,
                date: .now.addingTimeInterval(-604_800),
                opponent: "Gara",
                delta: 3
            ),
            .init(
                match: 12,
                elo: 1_531,
                date: .now.addingTimeInterval(-518_400),
                opponent: "Leo",
                delta: 13
            ),
            .init(
                match: 13,
                elo: 1_527,
                date: .now.addingTimeInterval(-432_000),
                opponent: "Miladin",
                delta: -4
            ),
            .init(
                match: 14,
                elo: 1_519,
                date: .now.addingTimeInterval(-345_600),
                opponent: "Andrej",
                delta: -8
            ),
            .init(
                match: 15,
                elo: 1_526,
                date: .now.addingTimeInterval(-259_200),
                opponent: "Marie",
                delta: 7
            ),
            .init(
                match: 16,
                elo: 1_531,
                date: .now.addingTimeInterval(-172_800),
                opponent: "Gara",
                delta: 5
            ),
            .init(
                match: 17,
                elo: 1_543,
                date: .now.addingTimeInterval(-86_400),
                opponent: "Leo",
                delta: 12
            ),
            .init(
                match: 18,
                elo: 1_537,
                date: .now,
                opponent: "Miladin",
                delta: -6,
                outcome: .loss,
                scoreFor: 1,
                scoreAgainst: 3
            )
        ],
        currentElo: 1_537
    )

    var body: some View {
        ZStack {
            ArenaBackground()

            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("INTERACTIVE HISTORY")
                        .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                        .tracking(1.8)
                        .foregroundStyle(GweiloTheme.lime)

                    Text("ELO SCRUB")
                        .font(GweiloTheme.displayFont(size: 44, relativeTo: .largeTitle))
                }

                EloHistoryChart(
                    history: history,
                    accessibilityTitle: "Pregled kretanja Elo rejtinga",
                    initialVisibleMatchSpan: 6
                )

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
        }
    }
}

private enum RecentMatchScope: String, CaseIterable, Identifiable {
    case all
    case againstMe

    var id: Self { self }

    var title: String {
        switch self {
        case .all: "Svi mečevi"
        case .againstMe: "Protiv mene"
        }
    }
}

private struct RecentEloResults: View {
    let title: String?
    let emptyMessage: String
    let results: [PlayerEloHistoryPoint]
    var comparisonOpponentID: UUID? = nil
    var comparisonOpponentName: String? = nil
    var comparison: PlayerHeadToHead? = nil
    var isLoadingComparison = false
    var comparisonErrorMessage: String? = nil
    var retryComparison: (() -> Void)? = nil
    var onSelectAgainstMe: (() -> Void)? = nil
    var onScopeChange: (() -> Void)? = nil

    @State private var scope: RecentMatchScope = .all
    @State private var visibleCount = 5
    @Namespace private var selectionIndicator

    private var scopes: [RecentMatchScope] {
        comparisonOpponentID == nil ? [.all] : RecentMatchScope.allCases
    }

    private var scopedResults: [PlayerEloHistoryPoint] {
        guard scope == .againstMe, let comparisonOpponentID else {
            return results
        }
        return results.filter { result in
            if result.opponentID == comparisonOpponentID {
                return true
            }
            guard let opponent = result.opponent,
                  let comparisonOpponentName else {
                return false
            }
            return opponent.compare(
                comparisonOpponentName,
                options: [.caseInsensitive, .diacriticInsensitive]
            ) == .orderedSame
        }
    }

    private var visibleResults: [PlayerEloHistoryPoint] {
        Array(scopedResults.prefix(visibleCount))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title {
                SectionHeading(title: title)
            }

            if scopes.count > 1 {
                RecentMatchScopePicker(
                    scopes: scopes,
                    selection: $scope,
                    selectionIndicator: selectionIndicator
                )
                .onChange(of: scope) {
                    visibleCount = 5
                    onScopeChange?()
                    if scope == .againstMe {
                        onSelectAgainstMe?()
                    }
                }
            }

            if scope == .againstMe {
                CompactHeadToHeadSummary(
                    comparison: comparison,
                    isLoading: isLoadingComparison,
                    errorMessage: comparisonErrorMessage,
                    retry: retryComparison
                )
            }

            if scopedResults.isEmpty,
               !(scope == .againstMe && comparison?.totalMatches == 0) {
                Text(
                    scope == .againstMe
                        ? "Još niste odigrali međusobni singl meč."
                        : emptyMessage
                )
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(visibleResults) { result in
                        HStack(spacing: 12) {
                            RecentMatchOutcomeBadge(result: result)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(
                                    "VS "
                                        + "\(result.opponent ?? "nepoznatog protivnika")"
                                )
                                    .font(.body.weight(.semibold))
                                Text(
                                    result.date.formatted(
                                        .dateTime
                                            .day()
                                            .month(.abbreviated)
                                            .year()
                                            .locale(
                                                Locale(identifier: "sr_Latn_RS")
                                            )
                                    )
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }

                            Spacer()

                            RecentMatchMetric(result: result)
                        }
                        .padding(.vertical, 12)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(accessibilityLabel(for: result))

                        if result.id != visibleResults.last?.id {
                            Divider()
                        }
                    }
                }

                if visibleResults.count < scopedResults.count {
                    Button {
                        withAnimation(.smooth(duration: 0.28)) {
                            visibleCount += 5
                        }
                    } label: {
                        Label("Učitaj još", systemImage: "chevron.down")
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 44)
                            .foregroundStyle(GweiloTheme.bone)
                            .background(GweiloTheme.raisedSurface)
                            .clipShape(.rect(cornerRadius: 10))
                    }
                    .buttonStyle(ResponsiveButtonStyle())
                    .sensoryFeedback(.impact(weight: .light), trigger: visibleCount)
                }
            }
        }
    }

    private func formattedDelta(_ delta: Double?) -> String {
        guard let delta else { return "—" }
        let value = Int(delta.rounded())
        return value > 0 ? "+\(value)" : "\(value)"
    }

    private func formattedScore(for result: PlayerEloHistoryPoint) -> String {
        result.formattedScore ?? "rezultat nije dostupan"
    }

    private func localizedOutcome(_ outcome: MatchOutcome?) -> String {
        switch outcome {
        case .win:
            "Pobeda"
        case .draw:
            "Nerešeno"
        case .loss:
            "Poraz"
        case nil:
            "Rezultat nije dostupan"
        }
    }

    private func accessibilityLabel(
        for result: PlayerEloHistoryPoint
    ) -> String {
        let outcome = localizedOutcome(result.outcome)
        let opponent = result.opponent ?? "nepoznatog protivnika"
        let score = formattedScore(for: result)
        return "\(outcome) protiv \(opponent), rezultat \(score), "
            + "\(formattedDelta(result.delta)) Elo"
    }
}

private struct CompactHeadToHeadSummary: View {
    let comparison: PlayerHeadToHead?
    let isLoading: Bool
    let errorMessage: String?
    let retry: (() -> Void)?

    var body: some View {
        Group {
            if let comparison {
                if comparison.totalMatches == 0 {
                    Text("Još nema međusobnih singl mečeva.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(GweiloTheme.raisedSurface)
                        .clipShape(.rect(cornerRadius: 10))
                } else {
                    comparisonContent(comparison)
                }
            } else if isLoading {
                HStack(spacing: 10) {
                    ProgressView()
                        .tint(GweiloTheme.lime)
                    Text("Učitavam međusobni skor…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(GweiloTheme.raisedSurface)
                .clipShape(.rect(cornerRadius: 10))
            } else if let errorMessage {
                HStack(spacing: 10) {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if let retry {
                        Button("Ponovo", action: retry)
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(GweiloTheme.lime)
                    }
                }
                .padding(14)
                .background(GweiloTheme.raisedSurface)
                .clipShape(.rect(cornerRadius: 10))
            }
        }
    }

    private func comparisonContent(
        _ comparison: PlayerHeadToHead
    ) -> some View {
        HStack(spacing: 12) {
            CompactComparisonPlayer(player: comparison.player)

            VStack(spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    Text("\(comparison.player.wins)")
                        .foregroundStyle(
                            scoreColor(
                                comparison.player.wins,
                                versus: comparison.opponent.wins
                            )
                        )
                    Text("–")
                        .foregroundStyle(GweiloTheme.muted)
                    Text("\(comparison.opponent.wins)")
                        .foregroundStyle(
                            scoreColor(
                                comparison.opponent.wins,
                                versus: comparison.player.wins
                            )
                        )
                }
                .font(
                    GweiloTheme.displayFont(
                        size: 30,
                        relativeTo: .title2
                    )
                    .monospacedDigit()
                )

                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text("\(comparison.player.elo)")
                        .foregroundStyle(
                            scoreColor(
                                comparison.player.elo,
                                versus: comparison.opponent.elo
                            )
                        )
                    Text("ELO")
                        .foregroundStyle(GweiloTheme.muted)
                    Text("\(comparison.opponent.elo)")
                        .foregroundStyle(
                            scoreColor(
                                comparison.opponent.elo,
                                versus: comparison.player.elo
                            )
                        )
                }
                .font(
                    GweiloTheme.labelFont(
                        size: 11,
                        relativeTo: .caption
                    )
                    .monospacedDigit()
                )

                if comparison.player.draws > 0 {
                    Text("\(comparison.player.draws) nerešeno")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(GweiloTheme.amber)
                }
            }
            .frame(maxWidth: .infinity)

            CompactComparisonPlayer(player: comparison.opponent)
        }
        .padding(14)
        .background(GweiloTheme.raisedSurface)
        .clipShape(.rect(cornerRadius: 10))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(comparison.player.name) \(comparison.player.wins), "
                + "ti \(comparison.opponent.wins), "
                + "\(comparison.player.draws) nerešeno, "
                + "Elo \(comparison.player.elo) prema "
                + "\(comparison.opponent.elo)"
        )
    }

    private func scoreColor(_ score: Int, versus otherScore: Int) -> Color {
        if score > otherScore { return GweiloTheme.lime }
        if score < otherScore { return GweiloTheme.coral }
        return GweiloTheme.bone
    }
}

private struct CompactComparisonPlayer: View {
    let player: HeadToHeadPlayer

    var body: some View {
        PlayerIdentityAvatar(
            name: player.name,
            initials: player.initials,
            avatarURL: player.avatarURL,
            size: 38
        )
        .frame(width: 68)
    }
}

private struct RecentMatchScopePicker: View {
    let scopes: [RecentMatchScope]
    @Binding var selection: RecentMatchScope
    let selectionIndicator: Namespace.ID

    var body: some View {
        HStack(spacing: 24) {
            ForEach(scopes) { scope in
                Button {
                    selection = scope
                } label: {
                    VStack(spacing: 7) {
                        Text(scope.title.uppercased())
                            .font(
                                GweiloTheme.labelFont(
                                    size: 12,
                                    relativeTo: .caption
                                )
                            )
                            .tracking(0.7)
                            .foregroundStyle(
                                selection == scope
                                    ? GweiloTheme.bone
                                    : GweiloTheme.muted
                            )

                        ZStack {
                            Color.clear.frame(height: 2)

                            if selection == scope {
                                Rectangle()
                                    .fill(GweiloTheme.lime)
                                    .matchedGeometryEffect(
                                        id: "recent-match-scope",
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
                    selection == scope ? .isSelected : []
                )
            }
        }
        .animation(.smooth(duration: 0.24), value: selection)
        .sensoryFeedback(.selection, trigger: selection)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)
        }
    }
}

private struct RecentMatchOutcomeBadge: View {
    let result: PlayerEloHistoryPoint

    private var outcome: MatchOutcome? {
        result.resolvedOutcome
    }

    private var color: Color {
        outcome?.color ?? result.performanceBand.color
    }

    private var label: String {
        if let outcome {
            return outcome.shortLabel
        }
        return switch result.performanceBand {
        case .gain: "↑"
        case .steady: "•"
        case .loss: "↓"
        }
    }

    var body: some View {
        if let outcome {
            MatchOutcomeBadge(outcome: outcome)
        } else {
            Text(label)
                .font(GweiloTheme.labelFont(size: 13, relativeTo: .caption))
                .foregroundStyle(color)
                .frame(width: 34, height: 34)
                .background(color.opacity(0.12))
                .overlay {
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(color.opacity(0.42), lineWidth: 1)
                }
                .clipShape(.rect(cornerRadius: 5))
        }
    }
}

private struct RecentMatchMetric: View {
    let result: PlayerEloHistoryPoint

    var body: some View {
        VStack(alignment: .trailing, spacing: 3) {
            if let score = result.formattedScore {
                Text(score)
                    .foregroundStyle(
                        result.resolvedOutcome?.color ?? GweiloTheme.bone
                    )

                HStack(spacing: 4) {
                    Text(formattedDelta)
                        .foregroundStyle(result.performanceBand.color)
                    Text("ELO")
                        .foregroundStyle(GweiloTheme.muted)
                }
                .font(.caption2.monospacedDigit().weight(.bold))
            } else {
                Text(formattedDelta)
                    .foregroundStyle(result.performanceBand.color)

                Text("ELO CHANGE")
                    .font(.caption2.weight(.bold))
                    .tracking(0.4)
                    .foregroundStyle(GweiloTheme.muted)
            }
        }
        .font(
            GweiloTheme.displayFont(size: 23, relativeTo: .title3)
                .monospacedDigit()
        )
    }

    private var formattedDelta: String {
        guard let delta = result.delta else {
            return "—"
        }
        let value = Int(delta.rounded())
        return value > 0 ? "+\(value)" : "\(value)"
    }
}
