import XCTest
@testable import Gweilo

final class WatchSessionCreationTests: XCTestCase {
    @MainActor
    func testWatchPreviewRequestPreservesSharedDraft() throws {
        let players = [
            makePlayer(name: "Ivan"),
            makePlayer(name: "Gara"),
            makePlayer(name: "Leo"),
            makePlayer(name: "Andrej")
        ]
        var draft = SessionCreationDraft()
        draft.setPlayerCount(4)
        draft.fourPlayerFormat = .mixed
        players.forEach { draft.toggle($0) }

        let request = GweiloWatchSessionRequest(
            command: .preview(
                draft: draft,
                currentPreview: nil,
                randomizing: false
            )
        )

        let data = try JSONEncoder().encode(request)
        let decoded = try JSONDecoder().decode(
            GweiloWatchSessionRequest.self,
            from: data
        )

        XCTAssertEqual(decoded, request)
        XCTAssertEqual(decoded.id, request.id)
    }

    @MainActor
    func testWatchCreateResponseRoundTrips() throws {
        let sessionID = UUID()
        let response = GweiloWatchSessionResponse.success(
            requestID: UUID(),
            payload: .created(sessionID: sessionID)
        )

        let data = try JSONEncoder().encode(response)
        let decoded = try JSONDecoder().decode(
            GweiloWatchSessionResponse.self,
            from: data
        )

        XCTAssertEqual(decoded, response)
    }

    private func makePlayer(name: String) -> SessionCreationPlayer {
        SessionCreationPlayer(
            id: UUID(),
            name: name,
            avatarURL: nil,
            elo: 1_500
        )
    }
}
