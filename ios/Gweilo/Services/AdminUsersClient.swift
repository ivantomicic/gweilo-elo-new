import Foundation

enum AdminUserRole: String, CaseIterable, Codable, Identifiable, Sendable {
    case user
    case mod
    case admin
    case guest

    var id: Self { self }

    var displayName: String {
        switch self {
        case .user: "User"
        case .mod: "Moderator"
        case .admin: "Admin"
        case .guest: "Guest"
        }
    }
}

struct AdminUser: Identifiable, Hashable, Decodable, Sendable {
    let id: UUID
    let email: String
    let name: String
    let avatar: URL?
    let role: AdminUserRole
    let sessionsPerWeek: Int?
    let accessDisabled: Bool?

    var initials: String {
        name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}

struct AdminUserUpdate: Encodable, Sendable {
    let name: String
    let email: String
    let role: AdminUserRole
    let sessionsPerWeek: Int?

    private enum CodingKeys: String, CodingKey {
        case name
        case email
        case role
        case sessionsPerWeek
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(email, forKey: .email)
        try container.encode(role, forKey: .role)
        if let sessionsPerWeek {
            try container.encode(
                sessionsPerWeek,
                forKey: .sessionsPerWeek
            )
        } else {
            try container.encodeNil(forKey: .sessionsPerWeek)
        }
    }
}

private struct AdminUsersResponse: Decodable {
    let users: [AdminUser]
}

private struct AdminUserResponse: Decodable {
    let user: AdminUser
}

private struct AdminUsersErrorResponse: Decodable {
    let error: String?
    let detail: String?
}

struct AdminUsersClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String
    var session: URLSession = .shared

    func users() async throws -> [AdminUser] {
        let response: AdminUsersResponse = try await perform(
            path: "api/admin/users"
        )
        return response.users
    }

    func update(
        userID: UUID,
        with update: AdminUserUpdate
    ) async throws -> AdminUser {
        let response: AdminUserResponse = try await perform(
            path: "api/admin/users/\(userID.uuidString)",
            method: "PATCH",
            body: update
        )
        return response.user
    }

    func removeAccess(for userID: UUID) async throws -> AdminUser {
        let response: AdminUserResponse = try await perform(
            path: "api/admin/users/\(userID.uuidString)",
            method: "PATCH",
            body: AccessUpdate(accessDisabled: true)
        )
        return response.user
    }

    private func perform<Response: Decodable>(
        path: String,
        method: String = "GET"
    ) async throws -> Response {
        try await perform(path: path, method: method, bodyData: nil)
    }

    private func perform<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body
    ) async throws -> Response {
        try await perform(
            path: path,
            method: method,
            bodyData: try JSONEncoder().encode(body)
        )
    }

    private func perform<Response: Decodable>(
        path: String,
        method: String,
        bodyData: Data?
    ) async throws -> Response {
        var request = URLRequest(
            url: configuration.apiBaseURL.appending(path: path)
        )
        request.httpMethod = method
        request.setValue(
            "Bearer \(accessToken)",
            forHTTPHeaderField: "Authorization"
        )
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bodyData {
            request.httpBody = bodyData
            request.setValue(
                "application/json",
                forHTTPHeaderField: "Content-Type"
            )
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAPIError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let serverError = try? JSONDecoder().decode(
                AdminUsersErrorResponse.self,
                from: data
            )
            throw BackendAPIError.rejected(
                serverError?.error
                    ?? serverError?.detail
                    ?? "User management request failed."
            )
        }

        return try JSONDecoder().decode(Response.self, from: data)
    }
}

private struct AccessUpdate: Encodable {
    let accessDisabled: Bool
}
