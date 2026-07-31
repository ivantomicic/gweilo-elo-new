import Foundation

struct AdminActivityEvent: Identifiable, Hashable, Sendable {
    let id: UUID
    let userID: UUID?
    let eventName: String
    let page: String?
    let createdAt: Date
}

extension AdminActivityEvent: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id
        case userID = "user_id"
        case eventName = "event_name"
        case page
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let dateValue = try container.decode(
            String.self,
            forKey: .createdAt
        )
        guard let createdAt = ActivityDateParser.date(from: dateValue) else {
            throw DecodingError.dataCorruptedError(
                forKey: .createdAt,
                in: container,
                debugDescription: "Invalid activity timestamp."
            )
        }

        id = try container.decode(UUID.self, forKey: .id)
        userID = try container.decodeIfPresent(UUID.self, forKey: .userID)
        eventName = try container.decode(String.self, forKey: .eventName)
        page = try container.decodeIfPresent(String.self, forKey: .page)
        self.createdAt = createdAt
    }
}

struct AdminActivityVisit: Identifiable, Hashable, Sendable {
    let id: UUID
    let userID: UUID?
    let user: AdminUser?
    let events: [AdminActivityEvent]

    var startedAt: Date { events.first?.createdAt ?? .distantPast }
    var endedAt: Date { events.last?.createdAt ?? startedAt }
    var duration: TimeInterval { max(0, endedAt.timeIntervalSince(startedAt)) }

    var userName: String {
        user?.name ?? (userID == nil ? "Anonymous" : "Unknown user")
    }

    var searchableText: String {
        (
            [userName, user?.email ?? ""]
                + events.flatMap {
                    [$0.eventName, $0.page ?? "", $0.readableLabel]
                }
        )
        .joined(separator: " ")
    }
}

extension AdminActivityEvent {
    var readableLabel: String {
        switch eventName {
        case "app_loaded":
            return "App loaded"
        case "user_logged_in":
            return "Logged in"
        case "page_viewed":
            return page.map(ActivityPageLabel.label) ?? "Page viewed"
        case "player_viewed":
            return "Player profile"
        default:
            return eventName
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
        }
    }

    var isSystemEvent: Bool {
        eventName == "app_loaded" || eventName == "user_logged_in"
    }
}

private enum ActivityPageLabel {
    private static let labels: [String: String] = [
        "/": "Home",
        "/dashboard": "Dashboard",
        "/statistics": "Statistics",
        "/sessions": "Sessions",
        "/start-session": "Start session",
        "/calculator": "Calculator",
        "/polls": "Polls",
        "/notifications": "Notifications",
        "/settings": "Settings",
        "/no-shows": "No shows",
        "/rules": "Rules",
        "/admin": "Admin",
        "/admin/activity": "Admin activity",
        "/admin/missions": "Admin missions",
        "/admin/settings": "Admin settings"
    ]

    static func label(for path: String) -> String {
        let normalized = path
            .split(separator: "?", maxSplits: 1)
            .first?
            .split(separator: "#", maxSplits: 1)
            .first
            .map(String.init) ?? path

        if let label = labels[normalized] {
            return label
        }
        if normalized.hasPrefix("/session/") {
            return "Session"
        }
        if normalized.hasPrefix("/player/") {
            return "Player profile"
        }
        return normalized
    }
}

private enum ActivityDateParser {
    static func date(from value: String) -> Date? {
        let normalized = value.replacingOccurrences(of: " ", with: "T")
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds
        ]
        if let date = fractional.date(from: normalized)
            ?? ISO8601DateFormatter().date(from: normalized) {
            return date
        }

        // analytics_events.created_at is a PostgreSQL TIMESTAMP column,
        // not TIMESTAMPTZ, so PostgREST can return it without a timezone.
        // These values originated as UTC ISO timestamps in the tracker.
        for format in [
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss"
        ] {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .iso8601)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = format
            if let date = formatter.date(from: normalized) {
                return date
            }
        }

        return nil
    }
}

struct AdminActivityClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String
    var session: URLSession = .shared

    func activity(limit: Int = 100) async throws -> [AdminActivityVisit] {
        async let eventsRequest = events(limit: limit)
        async let usersRequest = AdminUsersClient(
            configuration: configuration,
            accessToken: accessToken,
            session: session
        ).users()

        let (events, users) = try await (eventsRequest, usersRequest)
        return makeVisits(events: events, users: users)
    }

    private func events(limit: Int) async throws -> [AdminActivityEvent] {
        let endpoint = configuration.supabaseURL
            .appending(path: "rest/v1/analytics_events")
            .appending(queryItems: [
                .init(
                    name: "select",
                    value: "id,user_id,event_name,page,created_at"
                ),
                .init(name: "order", value: "created_at.desc"),
                .init(name: "limit", value: String(limit))
            ])
        var request = URLRequest(url: endpoint)
        request.setValue(
            configuration.supabaseAnonKey,
            forHTTPHeaderField: "apikey"
        )
        request.setValue(
            "Bearer \(accessToken)",
            forHTTPHeaderField: "Authorization"
        )
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw BackendAPIError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            let serverError = try? JSONDecoder().decode(
                SupabaseErrorResponse.self,
                from: data
            )
            throw BackendAPIError.rejected(
                serverError?.message
                    ?? serverError?.errorDescription
                    ?? "Activity could not be loaded."
            )
        }
        do {
            return try JSONDecoder().decode(
                [AdminActivityEvent].self,
                from: data
            )
        } catch let DecodingError.dataCorrupted(context) {
            throw BackendAPIError.rejected(
                "An activity record has an unsupported value: "
                    + context.debugDescription
            )
        } catch let DecodingError.typeMismatch(_, context) {
            throw BackendAPIError.rejected(
                "An activity record has an unexpected field type: "
                    + context.debugDescription
            )
        } catch let DecodingError.valueNotFound(_, context) {
            throw BackendAPIError.rejected(
                "An activity record is missing a value: "
                    + context.debugDescription
            )
        } catch let DecodingError.keyNotFound(key, _) {
            throw BackendAPIError.rejected(
                "An activity record is missing \(key.stringValue)."
            )
        }
    }

    private func makeVisits(
        events: [AdminActivityEvent],
        users: [AdminUser]
    ) -> [AdminActivityVisit] {
        let usersByID = Dictionary(
            uniqueKeysWithValues: users.map { ($0.id, $0) }
        )
        let groupedEvents = Dictionary(
            grouping: events,
            by: { $0.userID?.uuidString ?? "__anonymous__" }
        )
        var visits: [AdminActivityVisit] = []

        for userEvents in groupedEvents.values {
            let sortedEvents = userEvents.sorted {
                $0.createdAt < $1.createdAt
            }
            var currentVisit: [AdminActivityEvent] = []

            for event in sortedEvents {
                let previous = currentVisit.last
                let splitForInactivity = previous.map {
                    event.createdAt.timeIntervalSince($0.createdAt) > 30 * 60
                } ?? false
                let splitForReload = !currentVisit.isEmpty
                    && event.eventName == "app_loaded"
                    && currentVisit.contains {
                        ["app_loaded", "page_viewed", "player_viewed"]
                            .contains($0.eventName)
                    }

                if splitForInactivity || splitForReload {
                    appendVisit(
                        currentVisit,
                        usersByID: usersByID,
                        to: &visits
                    )
                    currentVisit = [event]
                } else {
                    currentVisit.append(event)
                }
            }

            appendVisit(
                currentVisit,
                usersByID: usersByID,
                to: &visits
            )
        }

        return visits.sorted { $0.startedAt > $1.startedAt }
    }

    private func appendVisit(
        _ events: [AdminActivityEvent],
        usersByID: [UUID: AdminUser],
        to visits: inout [AdminActivityVisit]
    ) {
        guard let first = events.first else { return }
        visits.append(
            AdminActivityVisit(
                id: first.id,
                userID: first.userID,
                user: first.userID.flatMap { usersByID[$0] },
                events: events
            )
        )
    }
}
