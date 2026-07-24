import Charts
import SwiftUI

private enum RankingDestination: Hashable {
    case player(RankingEntry)
    case team(RankingEntry)
}

struct RankingsView: View {
    let dataStore: AppDataStore
    @State private var category = RankingCategory.singles

    private var entries: [RankingEntry] {
        dataStore.rankings(for: category)
            .filter { $0.matches >= category.minimumMatches }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        RankingsHeader(category: $category)
                        EligibilityNote(category: category)
                        RankingsContent(
                            entries: entries,
                            destination: destination(for:),
                            isLoading: dataStore.isLoading,
                            errorMessage: dataStore.errorMessage,
                            retry: {
                                Task { await dataStore.load() }
                            }
                        )
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

    private func destination(for entry: RankingEntry) -> RankingDestination? {
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
    @Binding var category: RankingCategory

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
                ForEach(RankingCategory.allCases) { category in
                    Button {
                        withAnimation(.snappy(duration: 0.18)) {
                            self.category = category
                        }
                    } label: {
                        VStack(spacing: 8) {
                            Text(category.rawValue.uppercased())
                                .font(GweiloTheme.labelFont(size: 13, relativeTo: .caption))
                                .tracking(0.8)
                                .foregroundStyle(
                                    self.category == category
                                        ? GweiloTheme.bone
                                        : GweiloTheme.muted
                                )

                            Rectangle()
                                .fill(
                                    self.category == category
                                        ? GweiloTheme.lime
                                        : Color.clear
                                )
                                .frame(height: 2)
                        }
                    }
                    .buttonStyle(ResponsiveButtonStyle())
                    .accessibilityAddTraits(
                        self.category == category ? .isSelected : []
                    )
                }
            }
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(GweiloTheme.hairline)
                    .frame(height: 1)
            }
        }
        .padding(.top, 18)
    }
}

private struct EligibilityNote: View {
    let category: RankingCategory

    var body: some View {
        Text("Ranked after \(category.minimumMatches) completed matches")
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
            ProgressView("Loading rankings…")
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
            Text("W-D-L")
                .frame(width: 62, alignment: .trailing)
            Text("ELO")
                .frame(width: 48, alignment: .trailing)
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
                        Text("\(entry.matches) matches")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer(minLength: 8)

            Text("\(entry.wins)-\(entry.draws)-\(entry.losses)")
                .font(.caption.monospacedDigit().weight(.medium))
                .frame(width: 62, alignment: .trailing)

            Text("\(entry.elo)")
                .font(GweiloTheme.displayFont(size: 19, relativeTo: .body).monospacedDigit())
                .foregroundStyle(GweiloTheme.bone)
                .frame(width: 48, alignment: .trailing)

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
        _history = State(initialValue: initialHistory)
        _headToHead = State(initialValue: initialHeadToHead)
    }

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
                            ProgressView("Loading Elo history…")
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
            if history == nil {
                await load()
            }
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let historyRequest = dataStore.playerEloHistory(for: player.id)
            history = try await historyRequest
        } catch {
            errorMessage = error.localizedDescription
        }

        if player.id != dataStore.currentUserID {
            await loadHeadToHead()
        }
    }

    private func loadHeadToHead() async {
        guard !isLoadingComparison else { return }
        isLoadingComparison = true
        comparisonErrorMessage = nil
        defer { isLoadingComparison = false }
        do {
            headToHead = try await dataStore.headToHead(for: player.id)
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
        _profile = State(initialValue: initialProfile)
        _history = State(initialValue: initialHistory)
    }

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
                        ProgressView("Loading doubles team…")
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
            if profile == nil {
                await load()
            }
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let profileRequest = dataStore.doublesTeamProfile(for: team.id)
            async let historyRequest = dataStore.doublesTeamEloHistory(for: team.id)
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
            .init(match: 1, elo: 1_660, date: .now.addingTimeInterval(-864_000), opponent: "Gara", delta: 9),
            .init(match: 2, elo: 1_649, date: .now.addingTimeInterval(-691_200), opponent: "Leo", delta: -11),
            .init(match: 3, elo: 1_674, date: .now.addingTimeInterval(-518_400), opponent: "Miladin", delta: 25),
            .init(match: 4, elo: 1_691, date: .now.addingTimeInterval(-345_600), opponent: "Andrej", delta: 17),
            .init(match: 5, elo: 1_704, date: .now.addingTimeInterval(-172_800), opponent: "Marie", delta: 13),
            .init(match: 6, elo: 1_718, date: .now, opponent: "Gara", delta: 14)
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
                ProgressView("Loading head-to-head…")
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

    private var segments: [EloHistorySegment] {
        zip(history.points, history.points.dropFirst()).map {
            EloHistorySegment(start: $0.0, end: $0.1)
        }
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
                        LineMark(
                            x: .value("Match", Double(segment.start.match)),
                            y: .value("Elo", segment.start.elo),
                            series: .value("Segment", segment.id)
                        )
                        .foregroundStyle(segment.performanceBand.color)
                        .lineStyle(StrokeStyle(lineWidth: 3))
                        .interpolationMethod(.monotone)

                        LineMark(
                            x: .value("Match", Double(segment.end.match)),
                            y: .value("Elo", segment.end.elo),
                            series: .value("Segment", segment.id)
                        )
                        .foregroundStyle(segment.performanceBand.color)
                        .lineStyle(StrokeStyle(lineWidth: 3))
                        .interpolationMethod(.monotone)
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

private struct EloHistorySegment: Identifiable {
    let start: PlayerEloHistoryPoint
    let end: PlayerEloHistoryPoint

    var id: Int { end.match }
    var performanceBand: EloPerformanceBand { end.performanceBand }
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

    private var formattedDelta: String {
        guard let delta = point.delta else { return "—" }
        let value = Int(delta.rounded())
        return value > 0 ? "+\(value)" : "\(value)"
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
                Text(formattedDelta)
                    .font(
                        GweiloTheme.displayFont(
                            size: 25,
                            relativeTo: .title3
                        )
                        .monospacedDigit()
                    )
                    .foregroundStyle(point.performanceBand.color)

                Text("\(Int(point.elo.rounded())) Elo")
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
            + "\(formattedDelta) Elo, resulting rating \(Int(point.elo.rounded()))"
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
                delta: -6
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
                            Circle()
                                .fill(resultColor(for: result))
                                .frame(width: 7, height: 7)

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

                            Text(formattedDelta(result.delta))
                                .font(.body.monospacedDigit().weight(.bold))
                                .foregroundStyle(resultColor(for: result))

                            Text("\(Int(result.elo.rounded()))")
                                .font(.caption.monospacedDigit().weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 40, alignment: .trailing)
                        }
                        .padding(.vertical, 12)

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

    private func resultColor(for result: PlayerEloHistoryPoint) -> Color {
        result.performanceBand.color
    }
}
