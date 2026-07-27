import ActivityKit
import Foundation
import Observation

private struct LiveActivityTokenRegistration: Encodable {
    let token: String
    let tokenType: String
    let activityId: String?
    let sessionId: UUID?
    let environment: String
    let bundleId: String
    let deviceIdentifier: UUID
}

private struct LiveActivityTokenRemoval: Encodable {
    let tokenType: String?
    let activityId: String?
    let deviceIdentifier: UUID
}

private struct LiveActivityRegistrationResponse: Decodable {
    let registered: Bool
}

private struct LiveActivityAPIClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String

    func register(_ registration: LiveActivityTokenRegistration) async throws {
        let _: LiveActivityRegistrationResponse = try await perform(
            method: "POST",
            body: registration
        )
    }

    func remove(_ removal: LiveActivityTokenRemoval) async throws {
        let _: LiveActivityRegistrationResponse = try await perform(
            method: "DELETE",
            body: removal
        )
    }

    private func perform<Response: Decodable, Body: Encodable>(
        method: String,
        body: Body
    ) async throws -> Response {
        var request = URLRequest(
            url: configuration.apiBaseURL.appending(
                path: "api/live-activities/tokens"
            )
        )
        request.httpMethod = method
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue(
            "Bearer \(accessToken)",
            forHTTPHeaderField: "Authorization"
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard
            let httpResponse = response as? HTTPURLResponse,
            (200..<300).contains(httpResponse.statusCode)
        else {
            throw BackendAPIError.rejected(
                "Live Activity registration failed."
            )
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

@Observable
@MainActor
final class SessionLiveActivityManager {
    static let shared = SessionLiveActivityManager()

    private(set) var isEnabled = true
    private(set) var statusMessage: String?

    @ObservationIgnored
    private var apiClient: LiveActivityAPIClient?
    @ObservationIgnored
    private var pushToStartTask: Task<Void, Never>?
    @ObservationIgnored
    private var activityUpdatesTask: Task<Void, Never>?
    @ObservationIgnored
    private var tokenTasks: [String: Task<Void, Never>] = [:]

    private init() {}

    func configure(
        configuration: AppConfiguration,
        session: AuthSession,
        enabled: Bool
    ) {
        apiClient = LiveActivityAPIClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        isEnabled = enabled
        startObserversIfNeeded()
    }

    func updateAccessToken(
        configuration: AppConfiguration,
        session: AuthSession
    ) {
        apiClient = LiveActivityAPIClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
    }

    func clearConfiguration() {
        apiClient = nil
        pushToStartTask?.cancel()
        pushToStartTask = nil
        activityUpdatesTask?.cancel()
        activityUpdatesTask = nil
        tokenTasks.values.forEach { $0.cancel() }
        tokenTasks.removeAll()
    }

    func setEnabled(_ enabled: Bool) async {
        isEnabled = enabled
        guard !enabled else {
            startObserversIfNeeded()
            return
        }
        pushToStartTask?.cancel()
        pushToStartTask = nil
        activityUpdatesTask?.cancel()
        activityUpdatesTask = nil
        tokenTasks.values.forEach { $0.cancel() }
        tokenTasks.removeAll()

        for activityID in Activity<GweiloSessionActivityAttributes>
            .activities
            .map(\.id)
        {
            await Self.endActivity(
                id: activityID,
                content: nil,
                dismissalDate: nil
            )
        }
        if let apiClient {
            try? await apiClient.remove(
                LiveActivityTokenRemoval(
                    tokenType: nil,
                    activityId: nil,
                    deviceIdentifier: Self.deviceIdentifier
                )
            )
        }
    }

    func sync(detail: SessionDetail) async {
        guard
            isEnabled,
            ActivityAuthorizationInfo().areActivitiesEnabled
        else {
            return
        }

        let sessionID = detail.session.id.uuidString.lowercased()
        let existing = Activity<GweiloSessionActivityAttributes>.activities
            .first { $0.attributes.sessionID.lowercased() == sessionID }
        let content = ActivityContent(
            state: makeState(detail),
            staleDate: Date().addingTimeInterval(2 * 60 * 60)
        )

        if detail.session.status == .completed {
            if let existing {
                await Self.endActivity(
                    id: existing.id,
                    content: content,
                    dismissalDate: Date().addingTimeInterval(15 * 60)
                )
            }
            return
        }

        if let existing {
            await Self.updateActivity(id: existing.id, content: content)
            observeUpdateToken(for: existing)
            return
        }

        do {
            let activity = try Activity.request(
                attributes: GweiloSessionActivityAttributes(
                    sessionID: sessionID,
                    playerCount: detail.session.playerCount
                ),
                content: content,
                pushType: .token
            )
            observeUpdateToken(for: activity)
        } catch {
            statusMessage = "Live Activity nije mogla da se pokrene."
        }
    }

    private func startObserversIfNeeded() {
        guard isEnabled else { return }

        if pushToStartTask == nil {
            pushToStartTask = Task { [weak self] in
                for await token in
                    Activity<GweiloSessionActivityAttributes>
                        .pushToStartTokenUpdates
                {
                    guard let self else { return }
                    await self.upload(
                        token: token,
                        type: "push_to_start",
                        activityID: nil,
                        sessionID: nil
                    )
                }
            }
        }

        for activity in Activity<GweiloSessionActivityAttributes>.activities {
            observeUpdateToken(for: activity)
        }

        if activityUpdatesTask == nil {
            activityUpdatesTask = Task { [weak self] in
                for await activity in
                    Activity<GweiloSessionActivityAttributes>.activityUpdates
                {
                    guard let self else { return }
                    self.observeUpdateToken(for: activity)
                }
            }
        }
    }

    private func observeUpdateToken(
        for activity: Activity<GweiloSessionActivityAttributes>
    ) {
        guard tokenTasks[activity.id] == nil else { return }
        tokenTasks[activity.id] = Task { [weak self] in
            for await token in activity.pushTokenUpdates {
                guard let self else { return }
                await self.upload(
                    token: token,
                    type: "update",
                    activityID: activity.id,
                    sessionID: UUID(uuidString: activity.attributes.sessionID)
                )
            }
        }
    }

    private func upload(
        token: Data,
        type: String,
        activityID: String?,
        sessionID: UUID?
    ) async {
        guard let apiClient, isEnabled else { return }
        do {
            try await apiClient.register(
                LiveActivityTokenRegistration(
                    token: token.hexString,
                    tokenType: type,
                    activityId: activityID,
                    sessionId: sessionID,
                    environment: Self.environment,
                    bundleId: Self.bundleID,
                    deviceIdentifier: Self.deviceIdentifier
                )
            )
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func makeState(
        _ detail: SessionDetail
    ) -> GweiloSessionActivityAttributes.ContentState {
        let matches = detail.rounds.flatMap(\.matches)
        let completed = matches.filter(\.isCompleted)
        let pending = matches.filter { !$0.isCompleted }
        let round = detail.session.currentRound
            ?? pending.first?.roundNumber
            ?? detail.session.totalRounds
        let currentMatches = pending
            .filter { $0.roundNumber == round }
        let nextRound = pending
            .map(\.roundNumber)
            .first { $0 > round }
        let nextMatches = nextRound.map { nextRound in
            pending.filter { $0.roundNumber == nextRound }
        } ?? []
        let latest = completed.last
        let latestResult: String? = latest.flatMap { match in
            guard
                let teamOneScore = match.teamOneScore,
                let teamTwoScore = match.teamTwoScore
            else {
                return nil
            }
            let names = detail.teamNames(for: match.playerIDs)
            return "\(names.0) \(teamOneScore)–\(teamTwoScore) \(names.1)"
        }

        return GweiloSessionActivityAttributes.ContentState(
            currentRound: round,
            totalRounds: detail.session.totalRounds,
            completedMatches: completed.count,
            totalMatches: matches.count,
            status: detail.session.status.rawValue,
            headline: detail.session.status == .completed
                ? "Sesija je završena"
                : "Runda \(round) je spremna",
            matchups: currentMatches.map { match in
                let names = detail.teamNames(for: match.playerIDs)
                return GweiloSessionActivityAttributes.Matchup(
                    left: names.0,
                    right: names.1,
                    kind: match.type.label
                )
            },
            playerNames: detail.participants.map(\.name),
            nextMatchups: nextMatches.map { match in
                let names = detail.teamNames(for: match.playerIDs)
                return GweiloSessionActivityAttributes.Matchup(
                    left: names.0,
                    right: names.1,
                    kind: match.type.label
                )
            },
            latestResult: latestResult,
            bestPlayerName: detail.session.bestPlayer,
            bestPlayerDelta: detail.session.bestDelta,
            worstPlayerName: detail.session.worstPlayer,
            worstPlayerDelta: detail.session.worstDelta
        )
    }

    private static var bundleID: String {
        Bundle.main.bundleIdentifier ?? "com.ivantomicic.gweilo"
    }

    private nonisolated static func updateActivity(
        id: String,
        content: ActivityContent<
            GweiloSessionActivityAttributes.ContentState
        >
    ) async {
        guard
            let activity = Activity<GweiloSessionActivityAttributes>
                .activities
                .first(where: { $0.id == id })
        else {
            return
        }
        await activity.update(content)
    }

    private nonisolated static func endActivity(
        id: String,
        content: ActivityContent<
            GweiloSessionActivityAttributes.ContentState
        >?,
        dismissalDate: Date?
    ) async {
        guard
            let activity = Activity<GweiloSessionActivityAttributes>
                .activities
                .first(where: { $0.id == id })
        else {
            return
        }
        if let dismissalDate {
            await activity.end(
                content,
                dismissalPolicy: .after(dismissalDate)
            )
        } else {
            await activity.end(content, dismissalPolicy: .immediate)
        }
    }

    private static var environment: String {
        #if DEBUG
        "development"
        #else
        "production"
        #endif
    }

    private static var deviceIdentifier: UUID {
        let key = "gweilo.liveActivityDeviceIdentifier"
        if
            let value = UserDefaults.standard.string(forKey: key),
            let identifier = UUID(uuidString: value)
        {
            return identifier
        }
        let identifier = UUID()
        UserDefaults.standard.set(identifier.uuidString, forKey: key)
        return identifier
    }
}

private extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
