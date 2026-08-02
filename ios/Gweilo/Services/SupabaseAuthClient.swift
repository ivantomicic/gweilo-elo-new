import Foundation

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

    private enum CodingKeys: String, CodingKey {
        case message
        case errorDescription = "error_description"
    }
}

enum AuthenticationError: LocalizedError {
    case cancelled
    case invalidResponse
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .cancelled:
            "Prijava je otkazana."
        case .invalidResponse:
            "Supabase je vratio neispravan odgovor."
        case let .rejected(message):
            message
        }
    }
}

struct SupabaseAuthClient: Sendable {
    let configuration: AppConfiguration
    var session: URLSession = .shared

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
