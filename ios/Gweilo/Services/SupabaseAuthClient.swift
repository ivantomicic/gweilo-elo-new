import Foundation
import OSLog

private struct AuthAppMetadata: Codable, Sendable {
    let role: String?
    let roles: [String]?
}

struct AuthenticatedUser: Codable, Sendable {
    let id: UUID
    let email: String?
    private let appMetadata: AuthAppMetadata?

    init(
        id: UUID,
        email: String?,
        role: String? = nil
    ) {
        self.id = id
        self.email = email
        appMetadata = AuthAppMetadata(
            role: role,
            roles: role.map { [$0] }
        )
    }

    var canManageSessions: Bool {
        let roles = Set(
            (appMetadata?.roles ?? []) + [appMetadata?.role].compactMap { $0 }
        )
        return roles.contains("admin") || roles.contains("mod")
    }

    var isAdmin: Bool {
        appMetadata?.role == "admin" ||
        appMetadata?.roles?.contains("admin") == true
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case email
        case appMetadata = "app_metadata"
    }
}

struct AuthSession: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let expiresAt: Int?
    let user: AuthenticatedUser

    init(
        accessToken: String,
        refreshToken: String,
        expiresIn: Int,
        expiresAt: Int?,
        user: AuthenticatedUser
    ) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresIn = expiresIn
        self.expiresAt = expiresAt
        self.user = user
    }

    func needsRefresh(
        at date: Date = .now,
        leeway: TimeInterval = 90
    ) -> Bool {
        guard let expiresAt else { return false }
        return date.timeIntervalSince1970 + leeway >= TimeInterval(expiresAt)
    }

    private enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case user
    }
}

private struct PasswordSignInRequest: Encodable {
    let email: String
    let password: String
}

private struct RefreshTokenRequest: Encodable {
    let refreshToken: String

    private enum CodingKeys: String, CodingKey {
        case refreshToken = "refresh_token"
    }
}

private struct UserUpdateRequest: Encodable {
    var email: String?
    var password: String?
    var data: [String: String]?

    private enum CodingKeys: String, CodingKey {
        case email
        case password
        case data
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(email, forKey: .email)
        try container.encodeIfPresent(password, forKey: .password)
        try container.encodeIfPresent(data, forKey: .data)
    }
}

struct SupabaseErrorResponse: Decodable {
    let message: String?
    let errorDescription: String?
    let code: String?
    let errorCode: String?

    private enum CodingKeys: String, CodingKey {
        case message
        case errorDescription = "error_description"
        case code
        case errorCode = "error_code"
    }
}

enum AuthenticationError: LocalizedError {
    case cancelled
    case invalidResponse
    case sessionExpired
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .cancelled:
            "Prijava je otkazana."
        case .invalidResponse:
            "Supabase je vratio neispravan odgovor."
        case .sessionExpired:
            "Sesija je istekla. Prijavi se ponovo."
        case let .rejected(message):
            message
        }
    }
}

struct SupabaseAuthClient: Sendable {
    let configuration: AppConfiguration
    var session: URLSession = AppNetwork.session

    func googleAuthorizationURL() throws -> URL {
        let endpoint = configuration.supabaseURL.appending(path: "auth/v1/authorize")
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
            throw AuthenticationError.invalidResponse
        }
        components.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: "gweilo://login-callback")
        ]
        guard let url = components.url else {
            throw AuthenticationError.invalidResponse
        }
        return url
    }

    func session(fromOAuthCallback callbackURL: URL) async throws -> AuthSession {
        guard
            callbackURL.scheme == "gweilo",
            callbackURL.host == "login-callback"
        else {
            throw AuthenticationError.invalidResponse
        }
        let values = oauthCallbackValues(from: callbackURL)

        if let message = values["error_description"] ?? values["error"] {
            throw AuthenticationError.rejected(message)
        }
        guard
            let accessToken = values["access_token"],
            let refreshToken = values["refresh_token"]
        else {
            throw AuthenticationError.invalidResponse
        }

        let expiresIn = Int(values["expires_in"] ?? "") ?? 3600
        let expiresAt = Int(values["expires_at"] ?? "")
            ?? Int(Date.now.timeIntervalSince1970) + expiresIn
        let user = try await user(accessToken: accessToken)

        return AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: expiresIn,
            expiresAt: expiresAt,
            user: user
        )
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        let endpoint = configuration.supabaseURL
            .appending(path: "auth/v1/token")
            .appending(queryItems: [URLQueryItem(name: "grant_type", value: "password")])
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            PasswordSignInRequest(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
        )

        return try await perform(request)
    }

    func refreshSession(refreshToken: String) async throws -> AuthSession {
        let endpoint = configuration.supabaseURL
            .appending(path: "auth/v1/token")
            .appending(queryItems: [
                URLQueryItem(name: "grant_type", value: "refresh_token")
            ])
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            RefreshTokenRequest(refreshToken: refreshToken)
        )

        return try await perform(request)
    }

    func updateUser(
        accessToken: String,
        email: String? = nil,
        password: String? = nil,
        metadata: [String: String]? = nil
    ) async throws -> AuthenticatedUser {
        let endpoint = configuration.supabaseURL.appending(path: "auth/v1/user")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "PUT"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            UserUpdateRequest(email: email, password: password, data: metadata)
        )

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthenticationError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let response = try? JSONDecoder().decode(SupabaseErrorResponse.self, from: data)
            throw AuthenticationError.rejected(
                response?.message ?? response?.errorDescription ?? "Ažuriranje naloga nije uspelo."
            )
        }
        return try JSONDecoder().decode(AuthenticatedUser.self, from: data)
    }

    private func perform(_ request: URLRequest) async throws -> AuthSession {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthenticationError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let response = try? JSONDecoder().decode(SupabaseErrorResponse.self, from: data)
            let isRefresh = request.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }?
                .queryItems?.contains { $0.name == "grant_type" && $0.value == "refresh_token" } == true
            let revokedCodes = ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired"]
            if isRefresh, [400, 401, 403].contains(httpResponse.statusCode),
               revokedCodes.contains(response?.code ?? response?.errorCode ?? "") {
                throw AuthenticationError.sessionExpired
            }
            throw AuthenticationError.rejected(
                response?.message ??
                response?.errorDescription ??
                "Prijava nije uspela. Proveri email i lozinku."
            )
        }

        return try JSONDecoder().decode(AuthSession.self, from: data)
    }

    private func user(accessToken: String) async throws -> AuthenticatedUser {
        let endpoint = configuration.supabaseURL.appending(path: "auth/v1/user")
        var request = URLRequest(url: endpoint)
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: request)
        guard
            let httpResponse = response as? HTTPURLResponse,
            (200..<300).contains(httpResponse.statusCode)
        else {
            throw AuthenticationError.invalidResponse
        }
        return try JSONDecoder().decode(AuthenticatedUser.self, from: data)
    }

    private func oauthCallbackValues(from callbackURL: URL) -> [String: String] {
        var values: [String: String] = [:]

        URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
            .queryItems?
            .forEach { values[$0.name] = $0.value }

        if let fragment = callbackURL.fragment {
            URLComponents(string: "?\(fragment)")?
                .queryItems?
                .forEach { values[$0.name] = $0.value }
        }

        return values
    }
}

/// Shared, bounded transport. Only idempotent reads may be retried automatically.
enum AppNetwork {
    nonisolated private static let logger = Logger(subsystem: "com.ivantomicic.gweilo", category: "Networking")
    nonisolated static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 25
        return URLSession(configuration: configuration)
    }()

    nonisolated static func data(for request: URLRequest, session: URLSession) async throws -> (Data, URLResponse) {
        let canRetry = ["GET", "HEAD"].contains(request.httpMethod ?? "GET")
        for attempt in 0...1 {
            try Task.checkCancellation()
            do {
                let startedAt = ContinuousClock.now
                let result = try await session.data(for: request)
                let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
                let duration = startedAt.duration(to: .now)
                logger.debug("Request completed: HTTP \(status), duration \(String(describing: duration), privacy: .public)")
                if canRetry, attempt == 0, let response = result.1 as? HTTPURLResponse,
                   [429, 502, 503, 504, 520].contains(response.statusCode) {
                    // Do not retry early when the server asks for a longer wait.
                    let header = response.value(forHTTPHeaderField: "Retry-After")
                    let delay = header.flatMap(Double.init) ?? (header == nil ? 0.5 : 60)
                    if delay >= 0, delay <= 2 {
                        try await Task.sleep(for: .seconds(delay))
                        continue
                    }
                }
                return result
            } catch let error as URLError where canRetry && attempt == 0 &&
                [.timedOut, .networkConnectionLost, .cannotConnectToHost].contains(error.code) {
                try await Task.sleep(for: .milliseconds(500))
            }
        }
        throw URLError(.timedOut)
    }

    static func message(for error: Error) -> String {
        if let error = error as? URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost:
                return "Veza trenutno nije dostupna. Sačuvani podaci su i dalje tu. Pokušaj ponovo."
            case .timedOut:
                return "Učitavanje traje duže nego obično. Pokušaj ponovo."
            default: break
            }
        }
        return "Podaci trenutno nisu mogli da se osveže. Pokušaj ponovo."
    }
}

struct AuthenticatedRequestExecutor: Sendable {
    let token: @MainActor @Sendable (_ rejectedToken: String?) async throws -> String
    var isCurrentUser: @MainActor @Sendable () -> Bool = { true }

    nonisolated func data(for request: URLRequest, session: URLSession) async throws -> (Data, URLResponse) {
        let accessToken = try await token(nil)
        try Task.checkCancellation()
        var authenticated = request
        authenticated.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let result = try await AppNetwork.data(for: authenticated, session: session)
        guard await isCurrentUser() else { throw CancellationError() }
        guard (result.1 as? HTTPURLResponse)?.statusCode == 401 else { return result }
        // One refresh and one replay, never an unbounded authentication loop.
        let refreshedToken = try await token(accessToken)
        try Task.checkCancellation()
        authenticated.setValue("Bearer \(refreshedToken)", forHTTPHeaderField: "Authorization")
        let replayed = try await AppNetwork.data(for: authenticated, session: session)
        guard await isCurrentUser() else { throw CancellationError() }
        return replayed
    }
}
