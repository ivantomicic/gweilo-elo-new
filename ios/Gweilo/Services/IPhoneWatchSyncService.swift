@preconcurrency import WatchConnectivity

@MainActor
final class IPhoneWatchSyncService: NSObject, WCSessionDelegate {
    typealias SessionCreationHandler = @MainActor @Sendable (
        GweiloWatchSessionRequest
    ) async -> GweiloWatchSessionResponse

    static let shared = IPhoneWatchSyncService()

    private let session: WCSession?
    private var pendingSnapshot: GweiloWidgetSnapshot?
    private var hasActivated = false
    private var sessionCreationHandler: SessionCreationHandler?

    private override init() {
        session = WCSession.isSupported() ? .default : nil
        super.init()
    }

    func activate() {
        guard let session else { return }

        if let cachedSnapshot = GweiloWidgetSnapshotStore().load() {
            pendingSnapshot = cachedSnapshot
        }

        guard !hasActivated else {
            sendPendingSnapshotIfPossible()
            return
        }

        hasActivated = true
        session.delegate = self
        session.activate()
    }

    func send(_ snapshot: GweiloWidgetSnapshot) {
        pendingSnapshot = snapshot
        activate()
        sendPendingSnapshotIfPossible()
    }

    func registerSessionCreationHandler(
        _ handler: @escaping SessionCreationHandler
    ) {
        sessionCreationHandler = handler
        activate()
    }

    private func sendPendingSnapshotIfPossible() {
        guard
            let session,
            session.activationState == .activated,
            session.isPaired,
            session.isWatchAppInstalled,
            let pendingSnapshot,
            let data = try? JSONEncoder().encode(pendingSnapshot)
        else {
            return
        }

        do {
            try session.updateApplicationContext([
                GweiloWidgetSnapshot.watchApplicationContextKey: data
            ])
            if session.isReachable {
                session.sendMessageData(data, replyHandler: nil) { _ in
                    // The application context remains the durable fallback.
                }
            }
            self.pendingSnapshot = nil
        } catch {
            // Keep the newest snapshot queued for the next activation or app refresh.
        }
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        Task { @MainActor [weak self] in
            self?.sendPendingSnapshotIfPossible()
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor [weak self] in
            self?.sendPendingSnapshotIfPossible()
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessageData messageData: Data,
        replyHandler: @escaping (Data) -> Void
    ) {
        let reply = SendableWatchReplyHandler(replyHandler)
        Task { @MainActor [weak self] in
            let response = await self?.response(to: messageData)
                ?? .failure(
                    requestID: UUID(),
                    message: "Otvori Gweilo na iPhone-u i pokušaj ponovo."
                )
            guard let data = try? JSONEncoder().encode(response) else {
                return
            }
            reply.send(data)
        }
    }

    private func response(
        to messageData: Data
    ) async -> GweiloWatchSessionResponse {
        do {
            let request = try JSONDecoder().decode(
                GweiloWatchSessionRequest.self,
                from: messageData
            )
            guard let sessionCreationHandler else {
                return .failure(
                    requestID: request.id,
                    message: "Otvori Gweilo na iPhone-u i pokušaj ponovo."
                )
            }
            return await sessionCreationHandler(request)
        } catch {
            return .failure(
                requestID: UUID(),
                message: "Zahtev sa Apple Watch-a nije mogao da se obradi."
            )
        }
    }
}

nonisolated private struct SendableWatchReplyHandler: @unchecked Sendable {
    let send: (Data) -> Void

    init(_ send: @escaping (Data) -> Void) {
        self.send = send
    }
}
