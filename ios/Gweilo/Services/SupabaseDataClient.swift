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

    private enum CodingKeys: String, CodingKey {
        case id
        case playerCount = "player_count"
        case createdAt = "created_at"
        case status
        case bestPlayerDisplayName = "best_player_display_name"
        case bestPlayerDelta = "best_player_delta"
        case worstPlayerDisplayName = "worst_player_display_name"
        case worstPlayerDelta = "worst_player_delta"
    }
}

private struct MatchRecord: Decodable, Sendable {
    let sessionID: UUID
    let matchType: String
    let roundNumber: Int
    let status: String?

    private enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
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

    private enum CodingKeys: String, CodingKey {
        case id
        case roundNumber = "round_number"
        case matchType = "match_type"
        case matchOrder = "match_order"
        case playerIDs = "player_ids"
        case status
        case teamOneScore = "team1_score"
        case teamTwoScore = "team2_score"
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

private struct PostgrestErrorResponse: Decodable {
    let message: String?
    let details: String?
}

struct SupabaseDataClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String
    var session: URLSession = .shared

    func fetchSessionDetail(session summary: SessionSummary) async throws -> SessionDetail {
        async let sessionRecordRequest: [SessionRecord] = get(
            table: "sessions",
            queryItems: [
                .init(
                    name: "select",
                    value: "id,player_count,created_at,status,best_player_display_name,best_player_delta,worst_player_display_name,worst_player_delta"
                ),
                .init(name: "id", value: "eq.\(summary.id.uuidString)"),
                .init(name: "limit", value: "1")
            ]
        )
        async let eloPredictionsRequest = fetchSessionEloPredictions(
            sessionID: summary.id
        )
        async let sessionPlayersRequest: [SessionPlayerRecord] = get(
            table: "session_players",
            queryItems: [
                .init(name: "select", value: "player_id,team"),
                .init(name: "session_id", value: "eq.\(summary.id.uuidString)")
            ]
        )
        async let matchesRequest: [SessionDetailMatchRecord] = get(
            table: "session_matches",
            queryItems: [
                .init(
                    name: "select",
                    value: "id,round_number,match_type,match_order,player_ids,status,team1_score,team2_score"
                ),
                .init(name: "session_id", value: "eq.\(summary.id.uuidString)"),
                .init(name: "order", value: "round_number.asc,match_order.asc")
            ]
        )

        let (sessionRecords, sessionPlayers, matchRecords) = try await (
            sessionRecordRequest,
            sessionPlayersRequest,
            matchesRequest
        )
        let latestSession = sessionRecords.first
        let eloPredictions = (try? await eloPredictionsRequest)?.predictions ?? []
        let eloPredictionsByMatchID = Dictionary(
            uniqueKeysWithValues: eloPredictions.map { ($0.matchId, $0) }
        )
        let participantIDs = Set(
            sessionPlayers.map(\.playerID)
                + matchRecords.flatMap(\.playerIDs)
        )

        let profiles: [ProfileRecord]
        if participantIDs.isEmpty {
            profiles = []
        } else {
            let ids = participantIDs.map(\.uuidString).joined(separator: ",")
            profiles = try await get(
                table: "profiles",
                queryItems: [
                    .init(name: "select", value: "id,display_name,avatar_url"),
                    .init(name: "id", value: "in.(\(ids))")
                ]
            )
        }

        let names = Dictionary(
            uniqueKeysWithValues: profiles.map { ($0.id, $0.displayName ?? "User") }
        )
        let teamByPlayerID = Dictionary(
            uniqueKeysWithValues: sessionPlayers.map { ($0.playerID, $0.team) }
        )
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
                eloPrediction: eloPredictionsByMatchID[record.id]
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
            rounds: rounds
        )
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
                    value: "id,player_count,created_at,status,best_player_display_name,best_player_delta,worst_player_display_name,worst_player_delta"
                ),
                .init(name: "order", value: "created_at.desc"),
                .init(name: "limit", value: "30")
            ]
        )

        guard !records.isEmpty else { return [] }

        let ids = records.map(\.id.uuidString).joined(separator: ",")
        let matches: [MatchRecord] = try await get(
            table: "session_matches",
            queryItems: [
                .init(name: "select", value: "session_id,match_type,round_number,status"),
                .init(name: "session_id", value: "in.(\(ids))")
            ]
        )
        let matchesBySession = Dictionary(grouping: matches, by: \.sessionID)

        return records.map { record in
            let sessionMatches = matchesBySession[record.id] ?? []
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
            "The Supabase data URL is invalid."
        case .invalidResponse:
            "Supabase returned an invalid response."
        case .unauthorized:
            "Your login expired. Return to the app and try again."
        case let .requestFailed(message):
            "Could not load live data. \(message)"
        }
    }
}

private struct RoundSubmissionRequest: Encodable {
    let matchScores: [RoundMatchScoreSubmission]
}

private struct APIErrorResponse: Decodable {
    let error: String?
    let detail: String?
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
}

private struct SessionCreationRequest: Encodable {
    let playerCount: Int
    let players: [SessionPlayerPayload]
    let rounds: [SessionScheduleRound]?
    let fourPlayerFormat: FourPlayerSessionFormat
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

enum BackendAPIError: LocalizedError {
    case invalidResponse
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The Gweilo server returned an invalid response."
        case let .rejected(message):
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
                ? "Your login expired. Reopen the app and try again."
                : "The round could not be submitted."
            throw BackendAPIError.rejected(
                errorResponse?.error ?? errorResponse?.detail ?? fallback
            )
        }

        return try JSONDecoder().decode(RoundSubmissionResult.self, from: data)
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
        request.httpBody = try JSONEncoder().encode(
            RoundSubmissionRequest(matchScores: scores)
        )
        return request
    }

    func fetchPlayerEloHistory(playerID: UUID) async throws -> PlayerEloHistory {
        let request = try makePlayerEloHistoryRequest(playerID: playerID)
        let responseBody: PlayerEloHistoryResponse = try await perform(
            request,
            fallbackMessage: "Could not load this player's Elo history."
        )
        return makeEloHistory(from: responseBody)
    }

    func fetchTopThreeSinglesPlayerIDs() async throws -> [UUID] {
        let response: TopThreePlayersResponse = try await perform(
            makeTopThreeSinglesRequest(),
            fallbackMessage: "Could not load the current Top 3."
        )
        return response.data.map(\.playerID)
    }

    func fetchRankings() async throws -> RankingsSnapshot {
        let response: StatisticsResponse = try await perform(
            makeStatisticsRequest(),
            fallbackMessage: "Could not load the current rankings."
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
                        recentForm: team.recentForm
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
            fallbackMessage: "Could not load head-to-head results."
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
            fallbackMessage: "Could not load this doubles team."
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
            fallbackMessage: "Could not load this team's Elo history."
        )
        return makeEloHistory(from: response)
    }

    func fetchAvailableSessionPlayers() async throws -> [SessionCreationPlayer] {
        let request = makeAvailableSessionPlayersRequest()
        let response: AdminUsersResponse = try await perform(
            request,
            fallbackMessage: "Could not load the player list."
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
            fallbackMessage: "Could not prepare this schedule."
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
            fallbackMessage: "Could not create this session."
        )
    }

    func fetchActiveSessionID() async throws -> UUID? {
        let response: ActiveSessionResponse = try await perform(
            makeAuthenticatedRequest(path: "api/sessions/active"),
            fallbackMessage: "Could not check the active session."
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
            fallbackMessage: "Could not cancel this session."
        )
    }

    func forceCloseSession(sessionID: UUID) async throws {
        var request = makeAuthenticatedRequest(
            path: "api/sessions/\(sessionID.uuidString.lowercased())/force-close"
        )
        request.httpMethod = "POST"
        let _: ForceCloseSessionResponse = try await perform(
            request,
            fallbackMessage: "Could not force-close this session."
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
            format: draft.fourPlayerFormat
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
            recentForm: player.recentForm
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
                        avatar: $0.avatarURL?.absoluteString
                    )
                },
                rounds: rounds,
                fourPlayerFormat: format
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
