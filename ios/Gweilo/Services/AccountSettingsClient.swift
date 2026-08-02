import Foundation

struct AccountProfile: Sendable {
    let displayName: String
    let avatarURL: URL?
}

private struct AccountProfileResponse: Decodable {
    let displayName: String?
    let avatarURL: String?

    private enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case avatarURL = "avatar_url"
    }
}

private struct ProfileUpdateRequest: Encodable {
    var displayName: String?
    var avatarURL: String?
    var manualAvatarURL: String?

    private enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case manualAvatarURL = "manual_avatar_url"
    }
}

struct AccountSettingsClient: Sendable {
    let configuration: AppConfiguration
    var session: URLSession = .shared

    func profile(
        userID: UUID,
        accessToken: String
    ) async throws -> AccountProfile? {
        let endpoint = configuration.supabaseURL
            .appending(path: "rest/v1/profiles")
            .appending(queryItems: [
                .init(name: "select", value: "display_name,avatar_url"),
                .init(name: "id", value: "eq.\(userID.uuidString.lowercased())")
            ])
        var request = authorizedRequest(endpoint, accessToken: accessToken)
        request.httpMethod = "GET"

        let (data, response) = try await session.data(for: request)
        try validate(response, data: data)
        let profiles = try JSONDecoder().decode([AccountProfileResponse].self, from: data)
        guard let profile = profiles.first else { return nil }
        return AccountProfile(
            displayName: profile.displayName ?? "Korisnik",
            avatarURL: profile.avatarURL.flatMap(URL.init(string:))
        )
    }

    func updateDisplayName(
        _ displayName: String,
        accessToken: String,
        userID: UUID
    ) async throws -> AuthenticatedUser {
        let authClient = SupabaseAuthClient(configuration: configuration)
        let user = try await authClient.updateUser(
            accessToken: accessToken,
            metadata: ["display_name": displayName]
        )
        try await updateProfile(
            ProfileUpdateRequest(displayName: displayName),
            userID: userID,
            accessToken: accessToken
        )
        return user
    }

    func uploadAvatar(
        _ data: Data,
        mimeType: String,
        accessToken: String,
        userID: UUID
    ) async throws -> URL {
        guard data.count <= 5 * 1024 * 1024 else {
            throw AuthenticationError.rejected("Izaberi fotografiju manju od 5 MB.")
        }
        guard mimeType.hasPrefix("image/") else {
            throw AuthenticationError.rejected("Izaberi datoteku sa fotografijom.")
        }

        let fileExtension: String
        switch mimeType {
        case "image/png": fileExtension = "png"
        case "image/heic", "image/heif": fileExtension = "heic"
        case "image/gif": fileExtension = "gif"
        default: fileExtension = "jpg"
        }
        let objectName = "\(userID.uuidString.lowercased())-\(UUID().uuidString.lowercased()).\(fileExtension)"
        let uploadURL = configuration.supabaseURL
            .appending(path: "storage/v1/object/avatars/\(objectName)")
        var uploadRequest = authorizedRequest(uploadURL, accessToken: accessToken)
        uploadRequest.httpMethod = "POST"
        uploadRequest.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        uploadRequest.setValue("false", forHTTPHeaderField: "x-upsert")
        uploadRequest.httpBody = data

        let (uploadData, uploadResponse) = try await session.data(for: uploadRequest)
        try validate(uploadResponse, data: uploadData)

        let publicURL = configuration.supabaseURL
            .appending(path: "storage/v1/object/public/avatars/\(objectName)")
        try await updateProfile(
            ProfileUpdateRequest(
                avatarURL: publicURL.absoluteString,
                manualAvatarURL: publicURL.absoluteString
            ),
            userID: userID,
            accessToken: accessToken
        )
        return publicURL
    }

    private func updateProfile(
        _ update: ProfileUpdateRequest,
        userID: UUID,
        accessToken: String
    ) async throws {
        let endpoint = configuration.supabaseURL
            .appending(path: "rest/v1/profiles")
            .appending(queryItems: [
                .init(name: "id", value: "eq.\(userID.uuidString.lowercased())")
            ])
        var request = authorizedRequest(endpoint, accessToken: accessToken)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(update)

        let (data, response) = try await session.data(for: request)
        try validate(response, data: data)
    }

    private func authorizedRequest(_ url: URL, accessToken: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let response = response as? HTTPURLResponse else {
            throw AuthenticationError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            let error = try? JSONDecoder().decode(SupabaseErrorResponse.self, from: data)
            throw AuthenticationError.rejected(
                error?.message ?? error?.errorDescription ?? "Ažuriranje naloga nije uspelo."
            )
        }
    }
}
