import Foundation

private struct SessionRecord: Decodable, Sendable {
    let id: UUID
    let playerCount: Int
    let createdAt: Date
    let status: SessionStatus
    let bestPlayerDisplayName: String?
    let bestPlayerDelta: Double?
    let worstPlayerDisplayName: String?
    let worstPlayerDelta: Double?
    let sessionMatches: [SessionSummaryMatchRecord]?

    private enum CodingKeys: String, CodingKey {
        case id
        case playerCount = "player_count"
        case createdAt = "created_at"
        case status
        case bestPlayerDisplayName = "best_player_display_name"
        case bestPlayerDelta = "best_player_delta"
        case worstPlayerDisplayName = "worst_player_display_name"
        case worstPlayerDelta = "worst_player_delta"
        case sessionMatches = "session_matches"
    }
}

private struct SessionSummaryMatchRecord: Decodable, Sendable {
    let matchType: String
    let roundNumber: Int
    let status: String?

    private enum CodingKeys: String, CodingKey {
        case matchType = "match_type"
        case roundNumber = "round_number"
        case status
    }
}

private struct SessionPlayerRecord: Decodable, Sendable {
    let playerID: UUID
    let team: String?

    private enum CodingKeys: String, CodingKey {
        case playerID = "player_id"
        case team
    }
}

private struct SessionDetailMatchRecord: Decodable, Sendable {
    let id: UUID
    let roundNumber: Int
    let matchType: SessionMatchType
    let matchOrder: Int
    let playerIDs: [UUID]
    let status: String?
    let teamOneScore: Int?
    let teamTwoScore: Int?
    let isRated: Bool

    private enum CodingKeys: String, CodingKey {
        case id
        case roundNumber = "round_number"
        case matchType = "match_type"
        case matchOrder = "match_order"
        case playerIDs = "player_ids"
        case status
        case teamOneScore = "team1_score"
        case teamTwoScore = "team2_score"
        case isRated = "is_rated"
    }
}

private struct SessionPlaceholderRecord: Decodable, Sendable {
    let id: UUID
    let displayName: String
    let team: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case team
    }
}

private struct SessionPlayerEloSnapshotRecord: Decodable, Sendable {
    let matchID: UUID
    let playerID: UUID
    let elo: Double

    private enum CodingKeys: String, CodingKey {
        case matchID = "match_id"
        case playerID = "player_id"
        case elo
    }
}

private struct SessionDetailEnvelopeRecord: Decodable, Sendable {
    let playerCount: Int
    let createdAt: Date
    let status: SessionStatus
    let bestPlayerDisplayName: String?
    let bestPlayerDelta: Double?
    let worstPlayerDisplayName: String?
    let worstPlayerDelta: Double?
    let sessionPlayers: [SessionPlayerRecord]
    let sessionPlaceholders: [SessionPlaceholderRecord]
    let sessionMatches: [SessionDetailMatchRecord]

    private enum CodingKeys: String, CodingKey {
        case playerCount = "player_count"
        case createdAt = "created_at"
        case status
        case bestPlayerDisplayName = "best_player_display_name"
        case bestPlayerDelta = "best_player_delta"
        case worstPlayerDisplayName = "worst_player_display_name"
        case worstPlayerDelta = "worst_player_delta"
        case sessionPlayers = "session_players"
        case sessionPlaceholders = "session_placeholders"
        case sessionMatches = "session_matches"
    }
}

private struct ProfileRecord: Decodable, Sendable {
    let id: UUID
    let displayName: String?
    let avatarURL: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case avatarURL = "avatar_url"
    }
}

private struct SessionEloPredictionsResponse: Decodable, Sendable {
    let predictions: [MatchEloPrediction]
}

private struct SessionPlayerSummaryRecord: Decodable, Sendable {
    let playerID: UUID
    let eloBefore: Double?
    let eloAfter: Double?
    let eloChange: Double?
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let draws: Int

    private enum CodingKeys: String, CodingKey {
        case playerID = "player_id"
        case eloBefore = "elo_before"
        case eloAfter = "elo_after"
        case eloChange = "elo_change"
        case matchesPlayed = "matches_played"
        case wins
        case losses
        case draws
    }
}

private struct SessionTeamSummaryRecord: Decodable, Sendable {
    let teamID: UUID
    let playerOneID: UUID
    let playerTwoID: UUID
    let playerOneName: String
    let playerTwoName: String
    let playerOneAvatar: String?
    let playerTwoAvatar: String?
    let eloBefore: Double
    let eloAfter: Double
    let eloChange: Double
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let draws: Int

    private enum CodingKeys: String, CodingKey {
        case teamID = "team_id"
        case playerOneID = "player1_id"
        case playerTwoID = "player2_id"
        case playerOneName = "player1_name"
        case playerTwoName = "player2_name"
        case playerOneAvatar = "player1_avatar"
        case playerTwoAvatar = "player2_avatar"
        case eloBefore = "elo_before"
        case eloAfter = "elo_after"
        case eloChange = "elo_change"
        case matchesPlayed = "matches_played"
        case wins
        case losses
        case draws
    }
}

private struct SessionSummaryResponse: Decodable, Sendable {
    let singles: [SessionPlayerSummaryRecord]?
    let doublesPlayer: [SessionPlayerSummaryRecord]?
    let doublesTeam: [SessionTeamSummaryRecord]?

    private enum CodingKeys: String, CodingKey {
        case singles
        case doublesPlayer = "doubles_player"
        case doublesTeam = "doubles_team"
    }
}

private struct PostgrestErrorResponse: Decodable {
    let message: String?
    let details: String?
}

struct SupabaseDataClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String
    var session: URLSession = .shared

    func fetchSessionDetail(session summary: SessionSummary) async throws -> SessionDetail {
        async let sessionRecordRequest: [SessionDetailEnvelopeRecord] = get(
            table: "sessions",
            queryItems: [
                .init(
                    name: "select",
                    value: "player_count,created_at,status,best_player_display_name,best_player_delta,worst_player_display_name,worst_player_delta,session_players(player_id,team),session_placeholders(id,display_name,team),session_matches(id,round_number,match_type,match_order,player_ids,status,team1_score,team2_score,is_rated)"
                ),
                .init(name: "id", value: "eq.\(summary.id.uuidString)"),
                .init(name: "limit", value: "1")
            ]
        )
        async let eloPredictionsRequest = fetchSessionEloPredictions(
            sessionID: summary.id
        )
        async let sessionSummaryRequest = fetchSessionSummary(
            sessionID: summary.id
        )

        let sessionRecords = try await sessionRecordRequest
        let latestSession = sessionRecords.first
        let sessionPlayers = latestSession?.sessionPlayers ?? []
        let sessionPlaceholders = latestSession?.sessionPlaceholders ?? []
        let matchRecords = (latestSession?.sessionMatches ?? []).sorted {
            if $0.roundNumber != $1.roundNumber {
                return $0.roundNumber < $1.roundNumber
            }
            return $0.matchOrder < $1.matchOrder
        }
        let eloPredictions = (try? await eloPredictionsRequest)?.predictions ?? []
        let sessionSummary = try? await sessionSummaryRequest
        let eloPredictionsByMatchID = Dictionary(
            uniqueKeysWithValues: eloPredictions.map { ($0.matchId, $0) }
        )
        let participantIDs = Set(
            sessionPlayers.map(\.playerID)
                + sessionPlaceholders.map(\.id)
                + matchRecords.flatMap(\.playerIDs)
        )
        let matchIDs = matchRecords.map(\.id)

        async let profilesRequest = fetchProfiles(ids: participantIDs)
        async let snapshotsRequest = fetchEloSnapshots(matchIDs: matchIDs)
        let profiles = (try? await profilesRequest) ?? []
        let snapshotRecords = (try? await snapshotsRequest) ?? []

        var names = Dictionary(
            uniqueKeysWithValues: profiles.map { ($0.id, $0.displayName ?? "User") }
        )
        for placeholder in sessionPlaceholders {
            names[placeholder.id] = placeholder.displayName
        }
        var teamByPlayerID = Dictionary(
            uniqueKeysWithValues: sessionPlayers.map { ($0.playerID, $0.team) }
        )
        for placeholder in sessionPlaceholders {
            teamByPlayerID[placeholder.id] = placeholder.team
        }
        let participants = participantIDs
            .map { playerID in
                SessionParticipant(
                    id: playerID,
                    name: names[playerID] ?? "User",
                    avatarURL: profiles
                        .first { $0.id == playerID }
                        .flatMap(\.avatarURL)
                        .flatMap(URL.init(string:)),
                    team: teamByPlayerID[playerID] ?? nil
                )
            }
            .sorted {
                let leftTeam = $0.team ?? ""
                let rightTeam = $1.team ?? ""
                if leftTeam != rightTeam {
                    return leftTeam < rightTeam
                }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }

        let matches = matchRecords.map { record in
            SessionMatch(
                id: record.id,
                roundNumber: record.roundNumber,
                type: record.matchType,
                order: record.matchOrder,
                playerIDs: record.playerIDs,
                isCompleted: record.status == "completed",
                teamOneScore: record.teamOneScore,
                teamTwoScore: record.teamTwoScore,
                eloPrediction: eloPredictionsByMatchID[record.id],
                isRated: record.isRated
            )
        }
        let matchesByRound = Dictionary(grouping: matches, by: \.roundNumber)
        let rounds = matchesByRound.keys.sorted().map { roundNumber in
            let roundMatches = (matchesByRound[roundNumber] ?? [])
                .sorted { $0.order < $1.order }
            let activePlayerIDs = Set(roundMatches.flatMap(\.playerIDs))
            return SessionRound(
                number: roundNumber,
                matches: roundMatches,
                restingPlayers: participants.filter {
                    !activePlayerIDs.contains($0.id)
                }
            )
        }
        let singlesPerformance = makePlayerPerformance(
            from: sessionSummary?.singles ?? []
        )
        let doublesPlayerPerformance = makePlayerPerformance(
            from: sessionSummary?.doublesPlayer ?? []
        )
        let doublesTeamPerformance = makeTeamPerformance(
            from: sessionSummary?.doublesTeam ?? []
        )

        let completedMatches = matchRecords.filter { $0.status == "completed" }
        let pendingRounds = matchRecords
            .filter { $0.status != "completed" }
            .map(\.roundNumber)
        let inferredStatus: SessionStatus = pendingRounds.isEmpty && !matchRecords.isEmpty
            ? .completed
            : latestSession?.status ?? summary.status
        let refreshedSummary = SessionSummary(
            id: summary.id,
            createdAt: latestSession?.createdAt ?? summary.createdAt,
            playerCount: latestSession?.playerCount ?? summary.playerCount,
            status: inferredStatus,
            currentRound: inferredStatus == .active ? pendingRounds.min() : nil,
            totalRounds: matchRecords.map(\.roundNumber).max() ?? summary.totalRounds,
            singlesMatches: completedMatches.filter {
                $0.matchType == .singles
            }.count,
            doublesMatches: completedMatches.filter {
                $0.matchType == .doubles
            }.count,
            bestPlayer: latestSession?.bestPlayerDisplayName ?? summary.bestPlayer,
            bestDelta: latestSession?.bestPlayerDelta.map { Int($0.rounded()) }
                ?? summary.bestDelta,
            worstPlayer: latestSession?.worstPlayerDisplayName ?? summary.worstPlayer,
            worstDelta: latestSession?.worstPlayerDelta.map { Int($0.rounded()) }
                ?? summary.worstDelta
        )

        return SessionDetail(
            session: refreshedSummary,
            participants: participants,
            singlesPerformance: singlesPerformance,
            doublesPlayerPerformance: doublesPlayerPerformance,
            doublesTeamPerformance: doublesTeamPerformance,
            rounds: rounds,
            playerEloSnapshots: snapshotRecords.map {
                SessionPlayerEloSnapshot(
                    matchID: $0.matchID,
                    playerID: $0.playerID,
                    elo: $0.elo
                )
            }
        )
    }

    private func fetchProfiles(
        ids: Set<UUID>
    ) async throws -> [ProfileRecord] {
        guard !ids.isEmpty else { return [] }
        let value = ids.map(\.uuidString).joined(separator: ",")
        return try await get(
            table: "profiles",
            queryItems: [
                .init(name: "select", value: "id,display_name,avatar_url"),
                .init(name: "id", value: "in.(\(value))")
            ]
        )
    }

    private func fetchEloSnapshots(
        matchIDs: [UUID]
    ) async throws -> [SessionPlayerEloSnapshotRecord] {
        guard !matchIDs.isEmpty else { return [] }
        let value = matchIDs.map(\.uuidString).joined(separator: ",")
        return try await get(
            table: "elo_snapshots",
            queryItems: [
                .init(name: "select", value: "match_id,player_id,elo"),
                .init(name: "match_id", value: "in.(\(value))")
            ]
        )
    }

    private func fetchSessionSummary(
        sessionID: UUID
    ) async throws -> SessionSummaryResponse {
        let endpoint = configuration.apiBaseURL.appending(
            path: "api/sessions/\(sessionID.uuidString.lowercased())/summary"
        )
        var request = URLRequest(url: endpoint)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard
            let httpResponse = response as? HTTPURLResponse,
            (200..<300).contains(httpResponse.statusCode)
        else {
            throw LiveDataError.invalidResponse
        }
        return try JSONDecoder().decode(SessionSummaryResponse.self, from: data)
    }

    private func makePlayerPerformance(
        from records: [SessionPlayerSummaryRecord]
    ) -> [SessionPlayerPerformance] {
        records.map { record in
            SessionPlayerPerformance(
                playerID: record.playerID,
                matchesPlayed: record.matchesPlayed,
                wins: record.wins,
                losses: record.losses,
                draws: record.draws,
                eloBefore: record.eloBefore,
                eloAfter: record.eloAfter,
                eloChange: record.eloChange
            )
        }
        .sorted {
            if $0.wins != $1.wins { return $0.wins > $1.wins }
            if $0.losses != $1.losses { return $0.losses < $1.losses }
            return ($0.eloChange ?? 0) > ($1.eloChange ?? 0)
        }
    }

    private func makeTeamPerformance(
        from records: [SessionTeamSummaryRecord]
    ) -> [SessionTeamPerformance] {
        records.map { record in
            SessionTeamPerformance(
                id: record.teamID,
                playerOneID: record.playerOneID,
                playerTwoID: record.playerTwoID,
                playerOneName: record.playerOneName,
                playerTwoName: record.playerTwoName,
                playerOneAvatarURL: record.playerOneAvatar.flatMap(URL.init(string:)),
                playerTwoAvatarURL: record.playerTwoAvatar.flatMap(URL.init(string:)),
                matchesPlayed: record.matchesPlayed,
                wins: record.wins,
                losses: record.losses,
                draws: record.draws,
                eloBefore: record.eloBefore,
                eloAfter: record.eloAfter,
                eloChange: record.eloChange
            )
        }
        .sorted {
            if $0.wins != $1.wins { return $0.wins > $1.wins }
            if $0.losses != $1.losses { return $0.losses < $1.losses }
            return $0.eloChange > $1.eloChange
        }
    }

    private func fetchSessionEloPredictions(
        sessionID: UUID
    ) async throws -> SessionEloPredictionsResponse {
        let endpoint = configuration.apiBaseURL.appending(
            path: "api/sessions/\(sessionID.uuidString.lowercased())/elo-predictions"
        )
        var request = URLRequest(url: endpoint)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard
            let httpResponse = response as? HTTPURLResponse,
            (200..<300).contains(httpResponse.statusCode)
        else {
            throw LiveDataError.invalidResponse
        }
        return try JSONDecoder().decode(
            SessionEloPredictionsResponse.self,
            from: data
        )
    }

    func fetchSessions() async throws -> [SessionSummary] {
        let records: [SessionRecord] = try await get(
            table: "sessions",
            queryItems: [
                .init(
                    name: "select",
                    value: "id,player_count,created_at,status,best_player_display_name,best_player_delta,worst_player_display_name,worst_player_delta,session_matches(match_type,round_number,status)"
                ),
                .init(name: "order", value: "created_at.desc"),
                .init(name: "limit", value: "30")
            ]
        )

        return records.map { record in
            let sessionMatches = record.sessionMatches ?? []
            let completedMatches = sessionMatches.filter { $0.status == "completed" }
            let pendingRounds = sessionMatches
                .filter { $0.status != "completed" }
                .map(\.roundNumber)

            return SessionSummary(
                id: record.id,
                createdAt: record.createdAt,
                playerCount: record.playerCount,
                status: record.status,
                currentRound: record.status == .active ? pendingRounds.min() : nil,
                totalRounds: sessionMatches.map(\.roundNumber).max() ?? 0,
                singlesMatches: completedMatches.filter { $0.matchType == "singles" }.count,
                doublesMatches: completedMatches.filter { $0.matchType == "doubles" }.count,
                bestPlayer: record.bestPlayerDisplayName,
                bestDelta: record.bestPlayerDelta.map { Int($0.rounded()) },
                worstPlayer: record.worstPlayerDisplayName,
                worstDelta: record.worstPlayerDelta.map { Int($0.rounded()) }
            )
        }
    }

    private func get<Response: Decodable>(
        table: String,
        queryItems: [URLQueryItem]
    ) async throws -> Response {
        var components = URLComponents(
            url: configuration.supabaseURL.appending(path: "rest/v1/\(table)"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = queryItems
        guard let url = components?.url else {
            throw LiveDataError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw LiveDataError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 {
                throw LiveDataError.unauthorized
            }
            let errorResponse = try? JSONDecoder().decode(
                PostgrestErrorResponse.self,
                from: data
            )
            throw LiveDataError.requestFailed(
                errorResponse?.message ??
                errorResponse?.details ??
                "The server rejected the request."
            )
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let fractionalFormatter = ISO8601DateFormatter()
            fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractionalFormatter.date(from: value)
                ?? ISO8601DateFormatter().date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Invalid ISO 8601 date"
            )
        }
        return try decoder.decode(Response.self, from: data)
    }
}

enum LiveDataError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "Supabase adresa za podatke nije ispravna."
        case .invalidResponse:
            "Supabase je vratio neispravan odgovor."
        case .unauthorized:
            "Prijava je istekla. Vrati se u aplikaciju i pokušaj ponovo."
        case let .requestFailed(message):
            "Aktuelni podaci nisu mogli da se učitaju. \(message)"
        }
    }
}

private struct RoundSubmissionRequest: Encodable {
    private struct MatchScore: Encodable {
        let matchId: String
        let team1Score: Int
        let team2Score: Int
    }

    private let matchScores: [MatchScore]

    init(matchScores: [RoundMatchScoreSubmission]) {
        self.matchScores = matchScores.map { score in
            MatchScore(
                matchId: score.matchId.uuidString.lowercased(),
                team1Score: score.team1Score,
                team2Score: score.team2Score
            )
        }
    }
}

private struct MatchResultEditRequest: Encodable {
    let team1Score: Int
    let team2Score: Int
    let reason: String?
}

private struct APIErrorResponse: Decodable {
    let error: String?
    let detail: String?
    let details: String?
}

private struct AdminUsersResponse: Decodable {
    let users: [AdminUserResponse]
}

private struct AdminUserResponse: Decodable {
    let id: UUID
    let name: String
    let avatar: String?
}

private struct SessionPlayerPayload: Encodable {
    let id: UUID
    let name: String
    let avatar: String?
    let isPlaceholder: Bool
}

private struct SessionCreationRequest: Encodable {
    let playerCount: Int
    let players: [SessionPlayerPayload]
    let rounds: [SessionScheduleRound]?
    let fourPlayerFormat: FourPlayerSessionFormat
    let sixPlayerFormat: FourPlayerSessionFormat?
}

private struct ActiveSessionResponse: Decodable {
    struct ActiveSession: Decodable {
        let id: UUID
    }

    let session: ActiveSession?
}

private struct CancelSessionResponse: Decodable {
    let success: Bool
    let cancelledSessionId: UUID
}

private struct ForceCloseSessionResponse: Decodable {
    let success: Bool
    let message: String?
}

private struct PlayerEloHistoryPointResponse: Decodable {
    let match: Int
    let elo: Double
    let date: String
    let opponent: String?
    let opponentId: UUID?
    let delta: Double?
    let result: String?
    let scoreFor: Int?
    let scoreAgainst: Int?
}

private struct PlayerEloHistoryResponse: Decodable {
    let data: [PlayerEloHistoryPointResponse]
    let currentElo: Double
}

private struct TopThreePlayerResponse: Decodable {
    let playerID: UUID

    private enum CodingKeys: String, CodingKey {
        case playerID = "player_id"
    }
}

private struct TopThreePlayersResponse: Decodable {
    let data: [TopThreePlayerResponse]
}

private struct CalculatorPlayerResponse: Decodable {
    let id: UUID
    let name: String
    let avatar: String?
    let elo: Double
    let matchesPlayed: Int

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case avatar
        case elo
        case matchesPlayed
    }
}

private struct CalculatorPlayersResponse: Decodable {
    let players: [CalculatorPlayerResponse]
}

private struct StatisticsPlayerResponse: Decodable {
    let playerID: UUID
    let displayName: String
    let avatar: String?
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let elo: Double
    let rankDurationDays: Int?
    let recentForm: [Double]
    let recentFormScores: [Double]?

    private enum CodingKeys: String, CodingKey {
        case playerID = "player_id"
        case displayName = "display_name"
        case avatar
        case matchesPlayed = "matches_played"
        case wins
        case losses
        case draws
        case elo
        case rankDurationDays = "rank_duration_days"
        case recentForm = "recent_form"
        case recentFormScores = "recent_form_scores"
    }
}

private struct StatisticsTeamMemberResponse: Decodable {
    let id: UUID
    let displayName: String

    private enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
    }
}

private struct StatisticsTeamResponse: Decodable {
    let teamID: UUID
    let player1: StatisticsTeamMemberResponse
    let player2: StatisticsTeamMemberResponse
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let elo: Double
    let rankDurationDays: Int?
    let recentForm: [Double]
    let recentFormScores: [Double]?

    private enum CodingKeys: String, CodingKey {
        case teamID = "team_id"
        case player1
        case player2
        case matchesPlayed = "matches_played"
        case wins
        case losses
        case draws
        case elo
        case rankDurationDays = "rank_duration_days"
        case recentForm = "recent_form"
        case recentFormScores = "recent_form_scores"
    }
}

private struct StatisticsResponse: Decodable {
    let singles: [StatisticsPlayerResponse]
    let doublesPlayers: [StatisticsPlayerResponse]
    let doublesTeams: [StatisticsTeamResponse]
    let eligibility: RankingEligibility?
}

struct RankingsSnapshot: Sendable {
    let singles: [RankingEntry]
    let doublesPlayers: [RankingEntry]
    let doublesTeams: [RankingEntry]
    let eligibility: RankingEligibility
}

private struct HeadToHeadPlayerResponse: Decodable {
    let id: UUID
    let displayName: String
    let avatar: String?
    let elo: Double
    let wins: Int
    let losses: Int
    let draws: Int
    let setsWon: Int
    let setsLost: Int

    private enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case avatar
        case elo
        case wins
        case losses
        case draws
        case setsWon
        case setsLost
    }
}

private struct HeadToHeadResponse: Decodable {
    let player1: HeadToHeadPlayerResponse
    let player2: HeadToHeadPlayerResponse
    let totalMatches: Int
}

private struct DoublesTeamMemberResponse: Decodable {
    let id: UUID
    let displayName: String
    let avatar: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case avatar
    }
}

private struct DoublesTeamProfileResponse: Decodable {
    let id: UUID
    let displayName: String
    let player1: DoublesTeamMemberResponse
    let player2: DoublesTeamMemberResponse
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let draws: Int
    let setsWon: Int
    let setsLost: Int
    let elo: Double

    private enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case player1
        case player2
        case matchesPlayed = "matches_played"
        case wins
        case losses
        case draws
        case setsWon = "sets_won"
        case setsLost = "sets_lost"
        case elo
    }
}

struct RoundSubmissionResult: Decodable, Sendable {
    let success: Bool
    let message: String?
    let ratingsDeferred: Bool?
    let ratingsApplied: Bool?
    let combinedWithRound: Int?
}

struct MatchResultEditResult: Decodable, Sendable {
    let success: Bool
    let message: String?
    let ratingsDeferred: Bool?
}

enum BackendAPIError: LocalizedError {
    case invalidResponse
    case rejected(String)
    case sessionNotFound(String)

    var isSessionNotFound: Bool {
        if case .sessionNotFound = self {
            return true
        }
        return false
    }

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "Gweilo server je vratio neispravan odgovor."
        case let .rejected(message):
            message
        case let .sessionNotFound(message):
            message
        }
    }
}

struct GweiloAPIClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String
    var session: URLSession = .shared

    func submitRound(
        sessionID: UUID,
        roundNumber: Int,
        scores: [RoundMatchScoreSubmission]
    ) async throws -> RoundSubmissionResult {
        let request = try makeSubmitRoundRequest(
            sessionID: sessionID,
            roundNumber: roundNumber,
            scores: scores
        )

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAPIError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            let fallback = httpResponse.statusCode == 401
                ? "Prijava je istekla. Ponovo otvori aplikaciju i pokušaj ponovo."
                : "Runda nije mogla da se sačuva."
            let message =
                if httpResponse.statusCode >= 500 {
                    errorResponse?.details ??
                    errorResponse?.detail ??
                    errorResponse?.error ??
                    fallback
                } else {
                    errorResponse?.error ??
                    errorResponse?.detail ??
                    errorResponse?.details ??
                    fallback
                }
            if httpResponse.statusCode == 404,
               errorResponse?.error == "Session not found" {
                throw BackendAPIError.sessionNotFound("Termin nije pronađen.")
            }
            throw BackendAPIError.rejected(
                message
            )
        }

        return try JSONDecoder().decode(RoundSubmissionResult.self, from: data)
    }

    func editMatchResult(
        sessionID: UUID,
        matchID: UUID,
        teamOneScore: Int,
        teamTwoScore: Int,
        reason: String?
    ) async throws -> MatchResultEditResult {
        let request = try makeEditMatchResultRequest(
            sessionID: sessionID,
            matchID: matchID,
            teamOneScore: teamOneScore,
            teamTwoScore: teamTwoScore,
            reason: reason
        )
        return try await perform(
            request,
            fallbackMessage: "Rezultat meča nije mogao da se izmeni."
        )
    }

    func makeSubmitRoundRequest(
        sessionID: UUID,
        roundNumber: Int,
        scores: [RoundMatchScoreSubmission]
    ) throws -> URLRequest {
        let endpoint = configuration.apiBaseURL
            .appending(path: "api/sessions/\(sessionID.uuidString)/rounds/\(roundNumber)/submit")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("ios", forHTTPHeaderField: "X-Gweilo-Client")
        request.httpBody = try JSONEncoder().encode(
            RoundSubmissionRequest(matchScores: scores)
        )
        return request
    }

    func makeEditMatchResultRequest(
        sessionID: UUID,
        matchID: UUID,
        teamOneScore: Int,
        teamTwoScore: Int,
        reason: String?
    ) throws -> URLRequest {
        var request = makeAuthenticatedRequest(
            path: "api/sessions/\(sessionID.uuidString.lowercased())/matches/\(matchID.uuidString.lowercased())/edit"
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("ios", forHTTPHeaderField: "X-Gweilo-Client")
        request.httpBody = try JSONEncoder().encode(
            MatchResultEditRequest(
                team1Score: teamOneScore,
                team2Score: teamTwoScore,
                reason: reason
            )
        )
        return request
    }

    func fetchPlayerEloHistory(playerID: UUID) async throws -> PlayerEloHistory {
        let request = try makePlayerEloHistoryRequest(playerID: playerID)
        let responseBody: PlayerEloHistoryResponse = try await perform(
            request,
            fallbackMessage: "Elo istorija ovog igrača nije mogla da se učita."
        )
        return makeEloHistory(from: responseBody)
    }

    func fetchTopThreeSinglesPlayerIDs() async throws -> [UUID] {
        let response: TopThreePlayersResponse = try await perform(
            makeTopThreeSinglesRequest(),
            fallbackMessage: "Trenutna najbolja 3 igrača nisu mogla da se učitaju."
        )
        return response.data.map(\.playerID)
    }

    func fetchCalculatorPlayers() async throws -> [EloCalculatorPlayer] {
        let response: CalculatorPlayersResponse = try await perform(
            makeCalculatorPlayersRequest(),
            fallbackMessage: "Ne mogu da učitam igrače za kalkulator."
        )
        return response.players.map {
            EloCalculatorPlayer(
                id: $0.id,
                name: $0.name,
                avatarURL: $0.avatar.flatMap(URL.init(string:)),
                elo: $0.elo,
                matchesPlayed: $0.matchesPlayed
            )
        }
    }

    func fetchRankings() async throws -> RankingsSnapshot {
        let response: StatisticsResponse = try await perform(
            makeStatisticsRequest(),
            fallbackMessage: "Nije moguće učitati trenutnu statistiku."
        )
        let eligibility = response.eligibility ?? .fallback

        return RankingsSnapshot(
            singles: response.singles
                .filter {
                    response.eligibility != nil ||
                    $0.matchesPlayed >= eligibility.singles.minimumMatches
                }
                .map { makeRankingEntry(from: $0) },
            doublesPlayers: response.doublesPlayers
                .filter {
                    response.eligibility != nil ||
                    $0.matchesPlayed >= eligibility.doublesPlayers.minimumMatches
                }
                .map { makeRankingEntry(from: $0) },
            doublesTeams: response.doublesTeams
                .filter {
                    response.eligibility != nil ||
                    $0.matchesPlayed >= eligibility.doublesTeams.minimumMatches
                }
                .map { team in
                    RankingEntry(
                        id: team.teamID,
                        name: "\(team.player1.displayName) + \(team.player2.displayName)",
                        avatarURL: nil,
                        elo: Int(team.elo.rounded()),
                        matches: team.matchesPlayed,
                        wins: team.wins,
                        losses: team.losses,
                        draws: team.draws,
                        rankDays: team.rankDurationDays,
                        recentForm: team.recentForm,
                        recentFormScores: team.recentFormScores
                    )
                },
            eligibility: eligibility
        )
    }

    func fetchHeadToHead(
        playerID: UUID,
        opponentID: UUID
    ) async throws -> PlayerHeadToHead {
        let request = try makeHeadToHeadRequest(
            playerID: playerID,
            opponentID: opponentID
        )
        let response: HeadToHeadResponse = try await perform(
            request,
            fallbackMessage: "Međusobni rezultati nisu mogli da se učitaju."
        )
        return PlayerHeadToHead(
            player: makeHeadToHeadPlayer(from: response.player1),
            opponent: makeHeadToHeadPlayer(from: response.player2),
            totalMatches: response.totalMatches
        )
    }

    func fetchDoublesTeamProfile(teamID: UUID) async throws -> DoublesTeamProfile {
        let request = makeDoublesTeamProfileRequest(teamID: teamID)
        let response: DoublesTeamProfileResponse = try await perform(
            request,
            fallbackMessage: "Ovaj dubl tim nije mogao da se učita."
        )
        return DoublesTeamProfile(
            id: response.id,
            name: response.displayName,
            playerOne: makeTeamMember(from: response.player1),
            playerTwo: makeTeamMember(from: response.player2),
            matches: response.matchesPlayed,
            wins: response.wins,
            losses: response.losses,
            draws: response.draws,
            setsWon: response.setsWon,
            setsLost: response.setsLost,
            elo: Int(response.elo.rounded())
        )
    }

    func fetchDoublesTeamEloHistory(teamID: UUID) async throws -> PlayerEloHistory {
        let request = makeDoublesTeamEloHistoryRequest(teamID: teamID)
        let response: PlayerEloHistoryResponse = try await perform(
            request,
            fallbackMessage: "Elo istorija ovog tima nije mogla da se učita."
        )
        return makeEloHistory(from: response)
    }

    func fetchAvailableSessionPlayers() async throws -> [SessionCreationPlayer] {
        let request = makeAvailableSessionPlayersRequest()
        let response: AdminUsersResponse = try await perform(
            request,
            fallbackMessage: "Lista igrača nije mogla da se učita."
        )
        return response.users.map {
            SessionCreationPlayer(
                id: $0.id,
                name: $0.name,
                avatarURL: $0.avatar.flatMap(URL.init(string:)),
                elo: nil
            )
        }
    }

    func previewSession(
        players: [SessionCreationPlayer],
        format: FourPlayerSessionFormat
    ) async throws -> SessionSchedulePreview {
        let request = try makeSessionPreviewRequest(
            players: players,
            format: format
        )
        return try await perform(
            request,
            fallbackMessage: "Raspored nije mogao da se pripremi."
        )
    }

    func createSession(
        from draft: SessionCreationDraft,
        preview: SessionSchedulePreview
    ) async throws -> CreatedSessionResult {
        let request = try makeCreateSessionRequest(
            from: draft,
            preview: preview
        )
        return try await perform(
            request,
            fallbackMessage: "Nije moguće napraviti termin."
        )
    }

    func fetchActiveSessionID() async throws -> UUID? {
        let response: ActiveSessionResponse = try await perform(
            makeAuthenticatedRequest(path: "api/sessions/active"),
            fallbackMessage: "Nije moguće proveriti aktivni termin."
        )
        return response.session?.id
    }

    func cancelSession(sessionID: UUID) async throws {
        var request = makeAuthenticatedRequest(
            path: "api/sessions/\(sessionID.uuidString.lowercased())/cancel"
        )
        request.httpMethod = "POST"
        let _: CancelSessionResponse = try await perform(
            request,
            fallbackMessage: "Nije moguće otkazati termin."
        )
    }

    func forceCloseSession(sessionID: UUID) async throws {
        var request = makeAuthenticatedRequest(
            path: "api/sessions/\(sessionID.uuidString.lowercased())/force-close"
        )
        request.httpMethod = "POST"
        let _: ForceCloseSessionResponse = try await perform(
            request,
            fallbackMessage: "Nije moguće završiti termin."
        )
    }

    func makeAvailableSessionPlayersRequest() -> URLRequest {
        var components = URLComponents(
            url: configuration.apiBaseURL.appending(path: "api/admin/users"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "excludeGuests", value: "true")
        ]
        return makeAuthenticatedRequest(
            url: components?.url
                ?? configuration.apiBaseURL.appending(path: "api/admin/users")
        )
    }

    func makeSessionPreviewRequest(
        players: [SessionCreationPlayer],
        format: FourPlayerSessionFormat
    ) throws -> URLRequest {
        try makeSessionCreationRequest(
            path: "api/sessions/preview",
            players: players,
            rounds: nil,
            format: format
        )
    }

    func makeCreateSessionRequest(
        from draft: SessionCreationDraft,
        preview: SessionSchedulePreview
    ) throws -> URLRequest {
        var request = try makeSessionCreationRequest(
            path: "api/sessions",
            players: preview.players,
            rounds: preview.rounds,
            format: draft.selectedFormat
        )
        request.setValue(
            draft.idempotencyKey.uuidString.lowercased(),
            forHTTPHeaderField: "Idempotency-Key"
        )
        return request
    }

    func makeHeadToHeadRequest(
        playerID: UUID,
        opponentID: UUID
    ) throws -> URLRequest {
        var components = URLComponents(
            url: configuration.apiBaseURL
                .appending(
                    path: "api/player/\(playerID.uuidString.lowercased())/head-to-head"
                ),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(
                name: "opponentId",
                value: opponentID.uuidString.lowercased()
            )
        ]
        guard let endpoint = components?.url else {
            throw BackendAPIError.invalidResponse
        }
        return makeAuthenticatedRequest(url: endpoint)
    }

    func makeDoublesTeamProfileRequest(teamID: UUID) -> URLRequest {
        makeAuthenticatedRequest(
            path: "api/team/\(teamID.uuidString.lowercased())"
        )
    }

    func makeDoublesTeamEloHistoryRequest(teamID: UUID) -> URLRequest {
        makeAuthenticatedRequest(
            path: "api/team/\(teamID.uuidString.lowercased())/elo-history"
        )
    }

    func makeTopThreeSinglesRequest() -> URLRequest {
        makeAuthenticatedRequest(path: "api/statistics/top3")
    }

    func makeCalculatorPlayersRequest() -> URLRequest {
        makeAuthenticatedRequest(path: "api/calculator/players")
    }

    func makeStatisticsRequest() -> URLRequest {
        makeAuthenticatedRequest(path: "api/statistics")
    }

    private func makeRankingEntry(
        from player: StatisticsPlayerResponse
    ) -> RankingEntry {
        RankingEntry(
            id: player.playerID,
            name: player.displayName,
            avatarURL: player.avatar.flatMap(URL.init(string:)),
            elo: Int(player.elo.rounded()),
            matches: player.matchesPlayed,
            wins: player.wins,
            losses: player.losses,
            draws: player.draws,
            rankDays: player.rankDurationDays,
            recentForm: player.recentForm,
            recentFormScores: player.recentFormScores
        )
    }

    private func makeEloHistory(
        from responseBody: PlayerEloHistoryResponse
    ) -> PlayerEloHistory {
        let iso8601WithFractionalSeconds = ISO8601DateFormatter()
        iso8601WithFractionalSeconds.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds
        ]
        let iso8601 = ISO8601DateFormatter()
        let points = responseBody.data.compactMap { point -> PlayerEloHistoryPoint? in
            guard let date = iso8601WithFractionalSeconds.date(from: point.date)
                    ?? iso8601.date(from: point.date) else {
                return nil
            }
            return PlayerEloHistoryPoint(
                match: point.match,
                elo: point.elo,
                date: date,
                opponent: point.opponent,
                opponentID: point.opponentId,
                delta: point.delta,
                outcome: point.result.flatMap(MatchOutcome.init(rawValue:)),
                scoreFor: point.scoreFor,
                scoreAgainst: point.scoreAgainst
            )
        }
        return PlayerEloHistory(
            points: points,
            currentElo: responseBody.currentElo
        )
    }

    private func makeHeadToHeadPlayer(
        from response: HeadToHeadPlayerResponse
    ) -> HeadToHeadPlayer {
        HeadToHeadPlayer(
            id: response.id,
            name: response.displayName,
            avatarURL: response.avatar.flatMap(URL.init(string:)),
            elo: Int(response.elo.rounded()),
            wins: response.wins,
            losses: response.losses,
            draws: response.draws,
            setsWon: response.setsWon,
            setsLost: response.setsLost
        )
    }

    private func makeTeamMember(
        from response: DoublesTeamMemberResponse
    ) -> DoublesTeamMember {
        DoublesTeamMember(
            id: response.id,
            name: response.displayName,
            avatarURL: response.avatar.flatMap(URL.init(string:))
        )
    }

    func makePlayerEloHistoryRequest(playerID: UUID) throws -> URLRequest {
        var components = URLComponents(
            url: configuration.apiBaseURL.appending(path: "api/player/elo-history"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(
                name: "playerId",
                value: playerID.uuidString.lowercased()
            )
        ]
        guard let endpoint = components?.url else {
            throw BackendAPIError.invalidResponse
        }

        var request = URLRequest(url: endpoint)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func makeAuthenticatedRequest(path: String) -> URLRequest {
        makeAuthenticatedRequest(
            url: configuration.apiBaseURL.appending(path: path)
        )
    }

    private func makeAuthenticatedRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func makeSessionCreationRequest(
        path: String,
        players: [SessionCreationPlayer],
        rounds: [SessionScheduleRound]?,
        format: FourPlayerSessionFormat
    ) throws -> URLRequest {
        var request = makeAuthenticatedRequest(path: path)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            SessionCreationRequest(
                playerCount: players.count,
                players: players.map {
                    SessionPlayerPayload(
                        id: $0.id,
                        name: $0.name,
                        avatar: $0.avatarURL?.absoluteString,
                        isPlaceholder: $0.isPlaceholder
                    )
                },
                rounds: rounds,
                fourPlayerFormat: format,
                sixPlayerFormat: players.count == 6 ? format : nil
            )
        )
        return request
    }

    private func perform<Response: Decodable>(
        _ request: URLRequest,
        fallbackMessage: String
    ) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAPIError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw BackendAPIError.rejected(
                errorResponse?.error ??
                errorResponse?.detail ??
                fallbackMessage
            )
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}
