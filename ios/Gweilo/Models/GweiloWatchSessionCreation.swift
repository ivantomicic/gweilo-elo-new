import Foundation

struct GweiloWatchSessionRequest: Codable, Equatable, Sendable {
    let id: UUID
    let command: Command

    init(id: UUID = UUID(), command: Command) {
        self.id = id
        self.command = command
    }

    enum Command: Codable, Equatable, Sendable {
        case loadPlayers
        case preview(
            draft: SessionCreationDraft,
            currentPreview: SessionSchedulePreview?,
            randomizing: Bool
        )
        case create(
            draft: SessionCreationDraft,
            preview: SessionSchedulePreview
        )
    }
}

struct GweiloWatchSessionResponse: Codable, Equatable, Sendable {
    let requestID: UUID
    let payload: Payload?
    let errorMessage: String?

    enum Payload: Codable, Equatable, Sendable {
        case players([SessionCreationPlayer])
        case preview(SessionSchedulePreview)
        case created(sessionID: UUID)
    }

    static func success(
        requestID: UUID,
        payload: Payload
    ) -> GweiloWatchSessionResponse {
        GweiloWatchSessionResponse(
            requestID: requestID,
            payload: payload,
            errorMessage: nil
        )
    }

    static func failure(
        requestID: UUID,
        message: String
    ) -> GweiloWatchSessionResponse {
        GweiloWatchSessionResponse(
            requestID: requestID,
            payload: nil,
            errorMessage: message
        )
    }
}
