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
                                category: category,
                                eligibilityRule: dataStore.rankingEligibility.rule(
                                    for: category
                                ),
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
    let category: RankingCategory
    let selectCategory: (RankingCategory) -> Void
    @Namespace private var selectionIndicator

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 5) {
                Text("CURRENT ELO")
                    .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                    .tracking(1.8)
                    .foregroundStyle(GweiloTheme.lime)

                Text("RANKINGS")
                    .font(GweiloTheme.displayFont(size: 46, relativeTo: .largeTitle))
                    .tracking(-0.5)
                    .foregroundStyle(GweiloTheme.bone)
            }

            HStack(spacing: 24) {
                ForEach(RankingCategory.allCases) { option in
                    Button {
                        selectCategory(option)
                    } label: {
                        VStack(spacing: 8) {
                            Text(option.rawValue.uppercased())
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
            .accessibilityLabel("Ranking category")
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
    let category: RankingCategory
    let eligibilityRule: RankingEligibilityRule
    let entries: [RankingEntry]
    let destination: (RankingEntry) -> RankingDestination?
    let isLoading: Bool
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            EligibilityNote(rule: eligibilityRule)
            RankingsContent(
                entries: entries,
                destination: destination,
                isLoading: isLoading,
                errorMessage: errorMessage,
                retry: retry
            )
        }
    }
}

private struct EligibilityNote: View {
    let rule: RankingEligibilityRule

    var body: some View {
        Text(
            "\(rule.minimumMatches) matches · active in the last "
                + "\(rule.maximumInactivityDays) days"
        )
            .font(.caption)
            .foregroundStyle(.secondary)
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
            GweiloLoadingView("Loading rankings…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let errorMessage, entries.isEmpty {
            ContentUnavailableView {
                Label("Couldn’t load rankings", systemImage: "wifi.exclamationmark")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Try again", action: retry)
                    .buttonStyle(.borderedProminent)
            }
        } else if entries.isEmpty {
            ContentUnavailableView(
                "No eligible players",
                systemImage: "chart.line.uptrend.xyaxis",
                description: Text("Players will appear after enough completed matches.")
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
            Text("#")
                .frame(width: 24, alignment: .leading)
            Text("PLAYER")
            Spacer()
            Text("FORM")
                .frame(width: 56, alignment: .center)
            Text("ELO")
                .frame(width: 56, alignment: .trailing)
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
            Text("\(rank)")
                .font(GweiloTheme.labelFont(size: 13, relativeTo: .caption).monospacedDigit())
                .foregroundStyle(
                    rank == 1
                        ? GweiloTheme.lime
                        : (rank <= 3 ? GweiloTheme.accentBright : GweiloTheme.muted)
                )
                .frame(width: 24, alignment: .leading)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 9) {
                    PlayerIdentityAvatar(
                        name: entry.name,
                        initials: entry.initials,
                        avatarURL: entry.avatarURL,
                        size: 30
                    )
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.name)
                            .font(.body.weight(.semibold))
                            .lineLimit(1)
                        Text(
                            "\(entry.matches) matches · "
                                + "\(entry.wins)-\(entry.draws)-\(entry.losses)"
                        )
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer(minLength: 8)

            RecentFormBar(values: entry.recentForm)
                .frame(width: 56)

            Text("\(entry.elo)")
                .font(GweiloTheme.displayFont(size: 19, relativeTo: .body).monospacedDigit())
                .foregroundStyle(GweiloTheme.bone)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(width: 56, alignment: .trailing)

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
            "Rank \(rank), \(entry.name), \(entry.elo) Elo, \(entry.wins) wins, \(entry.draws) draws, \(entry.losses) losses"
        )
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
            .accessibilityLabel("Form over the last five sessions")
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
            guard let value else { return "no result" }
            let prefix = value > 0 ? "+" : ""
            return "\(prefix)\(Int(value.rounded())) Elo"
        }
        .joined(separator: ", ")
    }
}

struct PlayerProfileView: View {
    let player: RankingEntry
    let dataStore: AppDataStore

    @State private var history: PlayerEloHistory?
    @State private var headToHead: PlayerHeadToHead?
    @State private var isLoading = false
    @State private var isLoadingComparison = false
    @State private var errorMessage: String?
    @State private var comparisonErrorMessage: String?

    init(
        player: RankingEntry,
        dataStore: AppDataStore,
        initialHistory: PlayerEloHistory? = nil,
        initialHeadToHead: PlayerHeadToHead? = nil
    ) {
        self.player = player
        self.dataStore = dataStore
        _history = State(
            initialValue: initialHistory
                ?? dataStore.cachedPlayerEloHistory(for: player.id)
        )
        _headToHead = State(
            initialValue: initialHeadToHead
                ?? dataStore.cachedHeadToHead(for: player.id)
        )
        loadsRemoteData = initialHistory == nil && initialHeadToHead == nil
    }

    private let loadsRemoteData: Bool

    private var recentResults: [PlayerEloHistoryPoint] {
        Array(
            (history?.points ?? [])
                .filter { $0.match > 0 && $0.opponent != nil }
                .suffix(5)
                .reversed()
        )
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 30) {
                    PlayerProfileHeader(player: player)
                    PlayerRecordStrip(player: player)
                    if player.id != dataStore.currentUserID {
                        PlayerHeadToHeadSection(
                            comparison: headToHead,
                            isLoading: isLoadingComparison,
                            errorMessage: comparisonErrorMessage,
                            retry: {
                                Task { await loadHeadToHead() }
                            }
                        )
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        SectionHeading(title: "Singles Elo")

                        if let history {
                            EloHistoryChart(
                                history: history,
                                accessibilityTitle: "Singles Elo trend"
                            )
                        } else if isLoading {
                            GweiloLoadingView(
                                "Loading Elo history…",
                                size: 108
                            )
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 60)
                        } else if let errorMessage {
                            DataErrorNotice(
                                message: errorMessage,
                                retry: {
                                    Task { await load() }
                                }
                            )
                        }
                    }

                    RecentEloResults(
                        title: "Recent singles",
                        emptyMessage: "Recent singles results will appear here.",
                        results: recentResults
                    )
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle(player.name)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: player.id) {
            if loadsRemoteData {
                await load()
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
                                    accessibilityTitle: "Doubles team Elo trend"
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

    var body: some View {
        HStack(spacing: 17) {
            PlayerIdentityAvatar(
                name: player.name,
                initials: player.initials,
                avatarURL: player.avatarURL,
                size: 72
            )

            VStack(alignment: .leading, spacing: 5) {
                Text("PLAYER PROFILE")
                    .font(GweiloTheme.labelFont(size: 12, relativeTo: .caption))
                    .tracking(1.8)
                    .foregroundStyle(GweiloTheme.lime)

                Text(player.name.uppercased())
                    .font(GweiloTheme.displayFont(size: 42, relativeTo: .largeTitle))
                    .tracking(-0.4)
                    .foregroundStyle(GweiloTheme.bone)

                Text("\(player.elo) Elo")
                    .font(GweiloTheme.labelFont(size: 17, relativeTo: .headline).monospacedDigit())
                    .foregroundStyle(GweiloTheme.accentBright)
            }
        }
        .padding(.top, 14)
    }
}

private struct PlayerRecordStrip: View {
    let player: RankingEntry

    var body: some View {
        HStack(spacing: 0) {
            ProfileMetric(value: "\(player.matches)", label: "MATCHES")
            ProfileMetric(value: "\(player.wins)", label: "WINS")
            ProfileMetric(value: "\(player.draws)", label: "DRAWS")
            ProfileMetric(value: "\(player.losses)", label: "LOSSES")
        }
        .padding(.vertical, 15)
        .overlay(alignment: .top) { Divider() }
        .overlay(alignment: .bottom) { Divider() }
    }
}

private struct PlayerHeadToHeadSection: View {
    let comparison: PlayerHeadToHead?
    let isLoading: Bool
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "You vs this player")

            if let comparison {
                HeadToHeadScoreboard(comparison: comparison)
            } else if isLoading {
                GweiloLoadingView(
                    "Loading head-to-head…",
                    size: 96
                )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else if let errorMessage {
                DataErrorNotice(message: errorMessage, retry: retry)
            } else {
                Text("Head-to-head results will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct HeadToHeadScoreboard: View {
    let comparison: PlayerHeadToHead

    var body: some View {
        VStack(spacing: 15) {
            HStack(alignment: .top, spacing: 12) {
                ComparisonPlayer(
                    player: comparison.player,
                    contextLabel: "PROFILE"
                )

                Text("VS")
                    .font(GweiloTheme.labelFont(size: 11, relativeTo: .caption2))
                    .tracking(1.2)
                    .foregroundStyle(GweiloTheme.lime)
                    .padding(.top, 19)

                ComparisonPlayer(
                    player: comparison.opponent,
                    contextLabel: "YOU"
                )
            }

            if comparison.totalMatches == 0 {
                Text("No singles matches between you yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 10) {
                    ComparisonMetric(
                        label: "MATCH WINS",
                        left: comparison.player.wins,
                        right: comparison.opponent.wins
                    )
                    ComparisonMetric(
                        label: "SETS",
                        left: comparison.player.setsWon,
                        right: comparison.opponent.setsWon
                    )
                    ComparisonMetric(
                        label: "ELO",
                        left: comparison.player.elo,
                        right: comparison.opponent.elo
                    )
                }
            }
        }
        .padding(16)
        .flatSurface(cornerRadius: 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(comparison.player.name) versus \(comparison.opponent.name), "
            + "\(comparison.player.wins) to \(comparison.opponent.wins) match wins"
        )
    }
}

private struct ComparisonPlayer: View {
    let player: HeadToHeadPlayer
    let contextLabel: String

    var body: some View {
        VStack(spacing: 7) {
            PlayerIdentityAvatar(
                name: player.name,
                initials: player.initials,
                avatarURL: player.avatarURL,
                size: 46
            )
            Text(player.name)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
            Text(contextLabel)
                .font(GweiloTheme.labelFont(size: 9, relativeTo: .caption2))
                .tracking(1)
                .foregroundStyle(GweiloTheme.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct ComparisonMetric: View {
    let label: String
    let left: Int
    let right: Int

    var body: some View {
        HStack {
            Text("\(left)")
                .foregroundStyle(resultColor(left, comparedWith: right))
            Spacer()
            Text(label)
                .font(GweiloTheme.labelFont(size: 10, relativeTo: .caption2))
                .tracking(1)
                .foregroundStyle(GweiloTheme.muted)
            Spacer()
            Text("\(right)")
                .foregroundStyle(resultColor(right, comparedWith: left))
        }
        .font(GweiloTheme.displayFont(size: 23, relativeTo: .title3).monospacedDigit())
    }

    private func resultColor(_ value: Int, comparedWith otherValue: Int) -> Color {
        if value > otherValue { return GweiloTheme.lime }
        if value < otherValue { return GweiloTheme.coral }
        return GweiloTheme.bone
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
                "No singles history yet",
                systemImage: "chart.xyaxis.line",
                description: Text("The first completed singles result will start this chart.")
            )
            .frame(maxWidth: .infinity)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Chart {
                    ForEach(segments) { segment in
                        ForEach(segment.samples) { sample in
                            LineMark(
                                x: .value("Match", sample.match),
                                y: .value("Elo", sample.elo),
                                series: .value("Segment", segment.id)
                            )
                            .foregroundStyle(segment.performanceBand.color)
                            .lineStyle(StrokeStyle(lineWidth: 3))
                            .interpolationMethod(.monotone)
                        }
                    }

                    if let latestPoint = history.points.last,
                       latestPoint.id != selectedPoint?.id {
                        PointMark(
                            x: .value("Match", Double(latestPoint.match)),
                            y: .value("Elo", latestPoint.elo)
                        )
                        .foregroundStyle(GweiloTheme.lime)
                        .symbolSize(56)
                    }

                    if let selectedPoint {
                        RuleMark(
                            x: .value(
                                "Selected match",
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
                                "Selected match",
                                Double(selectedPoint.match)
                            ),
                            y: .value("Selected Elo", selectedPoint.elo)
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
                    "\(accessibilityTitle), \(Int(history.currentElo.rounded())) current Elo"
                )
                .accessibilityHint(
                    "Pinch to zoom, swipe to move through history, and hold then drag to inspect matches"
                )

                ChartViewportControls(
                    visibleMatchCount: visibleMatchCount,
                    totalMatchCount: history.points.count,
                    isZoomed: isZoomed,
                    reset: resetZoom
                )

                ChartPerformanceLegend()

                if let selectedPoint {
                    EloMatchScrubDetail(point: selectedPoint)
                }

                Text(
                    isZoomed
                        ? "Swipe to move · Hold and drag to inspect"
                        : "Pinch to zoom · Hold and drag to inspect"
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
        if selectedMatch == nil {
            selectedMatch = history.points.last.map { Double($0.match) }
        }

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
                    ? "\(visibleMatchCount) OF \(totalMatchCount) MATCHES"
                    : "ALL \(totalMatchCount) MATCHES"
            )
            .font(GweiloTheme.labelFont(size: 9, relativeTo: .caption2))
            .tracking(0.7)
            .foregroundStyle(GweiloTheme.muted)

            Spacer()

            if isZoomed {
                Button("Show all", systemImage: "arrow.up.left.and.arrow.down.right") {
                    reset()
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(GweiloTheme.bone)
                .buttonStyle(.plain)
                .accessibilityHint("Resets the chart zoom")
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
                label: "GAIN >5"
            )
            ChartPerformanceLegendItem(
                band: .steady,
                label: "STEADY ±5"
            )
            ChartPerformanceLegendItem(
                band: .loss,
                label: "LOSS <−5"
            )
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Chart colors: green for gains above 5, amber within 5, red for losses above 5"
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

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("MATCH \(point.match)")
                    .font(GweiloTheme.labelFont(size: 10, relativeTo: .caption2))
                    .tracking(1)
                    .foregroundStyle(point.performanceBand.color)

                Text("vs \(point.opponent ?? "Unknown opponent")")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(
                    point.date.formatted(
                        .dateTime.day().month(.abbreviated).year()
                    )
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 3) {
                Text(
                    hasMatchResult
                        ? "\(point.outcome?.shortLabel ?? "") \(formattedScore)"
                        : formattedDelta
                )
                    .font(
                        GweiloTheme.displayFont(
                            size: 25,
                            relativeTo: .title3
                        )
                        .monospacedDigit()
                    )
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
            "Match \(point.match), against \(point.opponent ?? "unknown opponent"), "
            + "\(point.outcome?.label ?? "result unavailable"), "
            + "score \(formattedScore), \(formattedDelta) Elo, "
            + "resulting rating \(Int(point.elo.rounded()))"
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

private extension MatchOutcome {
    var color: Color {
        switch self {
        case .win:
            GweiloTheme.lime
        case .loss:
            GweiloTheme.coral
        case .draw:
            GweiloTheme.amber
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
                    accessibilityTitle: "Elo trend preview",
                    initialVisibleMatchSpan: 6
                )

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
        }
    }
}

private struct RecentEloResults: View {
    let title: String
    let emptyMessage: String
    let results: [PlayerEloHistoryPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: title)

            if results.isEmpty {
                Text(emptyMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(results) { result in
                        HStack(spacing: 12) {
                            RecentMatchOutcomeBadge(result: result)

                            VStack(alignment: .leading, spacing: 3) {
                                Text("vs \(result.opponent ?? "Unknown")")
                                    .font(.body.weight(.semibold))
                                Text(
                                    result.date.formatted(
                                        .dateTime.day().month(.abbreviated).year()
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

                        if result.id != results.last?.id {
                            Divider()
                        }
                    }
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
        result.formattedScore ?? "score unavailable"
    }

    private func accessibilityLabel(
        for result: PlayerEloHistoryPoint
    ) -> String {
        let outcome = result.outcome?.label ?? "Result unavailable"
        let opponent = result.opponent ?? "unknown opponent"
        let score = formattedScore(for: result)
        return "\(outcome) against \(opponent), score \(score), "
            + "\(formattedDelta(result.delta)) Elo"
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
