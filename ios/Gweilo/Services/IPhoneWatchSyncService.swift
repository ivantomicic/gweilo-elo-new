@preconcurrency import WatchConnectivity

@MainActor
final class IPhoneWatchSyncService: NSObject, WCSessionDelegate {
    static let shared = IPhoneWatchSyncService()

    private let session: WCSession?
    private var pendingSnapshot: GweiloWidgetSnapshot?
    private var hasActivated = false

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
}
