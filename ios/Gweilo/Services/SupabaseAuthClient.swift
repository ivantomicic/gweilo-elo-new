import Foundation

struct AuthenticatedUser: Codable, Sendable {
    let id: UUID
    let email: String?
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

private struct SupabaseErrorResponse: Decodable {
    let message: String?
    let errorDescription: String?

    private enum CodingKeys: String, CodingKey {
        case message
        case errorDescription = "error_description"
    }
}

enum AuthenticationError: LocalizedError {
    case invalidResponse
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "Supabase returned an invalid response."
        case let .rejected(message):
            message
        }
    }
}

struct SupabaseAuthClient: Sendable {
    let configuration: AppConfiguration
    var session: URLSession = .shared

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
                "Sign-in failed. Check your email and password."
            )
        }

        return try JSONDecoder().decode(AuthSession.self, from: data)
    }
}
