import Foundation

private struct PlayerMissionsResponse: Decodable {
    let snapshot: RivalryMissionSnapshot?
}

private struct AdminMissionsResponse: Decodable {
    let snapshots: [RivalryMissionSnapshot]
}

private struct RivalryMissionsErrorResponse: Decodable {
    let error: String?
    let detail: String?
}

struct RivalryMissionsClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String
    var session: URLSession = .shared

    func playerSnapshot() async throws -> RivalryMissionSnapshot? {
        let response: PlayerMissionsResponse = try await perform(
            path: "api/missions"
        )
        return response.snapshot
    }

    func adminSnapshots() async throws -> [RivalryMissionSnapshot] {
        let response: AdminMissionsResponse = try await perform(
            path: "api/admin/missions"
        )
        return response.snapshots
    }

    func regenerateAdminSnapshots() async throws -> [RivalryMissionSnapshot] {
        let response: AdminMissionsResponse = try await perform(
            path: "api/admin/missions",
            method: "POST"
        )
        return response.snapshots
    }

    private func perform<Response: Decodable>(
        path: String,
        method: String = "GET"
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

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAPIError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let serverError = try? JSONDecoder().decode(
                RivalryMissionsErrorResponse.self,
                from: data
            )
            throw BackendAPIError.rejected(
                serverError?.error
                    ?? serverError?.detail
                    ?? "Misije trenutno nisu dostupne."
            )
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw BackendAPIError.rejected(
                "Server je vratio neispravne podatke za misije."
            )
        }
    }
}
