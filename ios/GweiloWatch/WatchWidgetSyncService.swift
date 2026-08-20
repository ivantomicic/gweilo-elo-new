@preconcurrency import WatchConnectivity
import Observation
import WidgetKit

@MainActor
@Observable
final class WatchWidgetSyncService: NSObject, WCSessionDelegate {
    static let shared = WatchWidgetSyncService()

    private(set) var snapshot: GweiloWidgetSnapshot?

    @ObservationIgnored
    private let session: WCSession?
    @ObservationIgnored
    private var hasActivated = false

    private override init() {
        snapshot = GweiloWidgetSnapshotStore().load()
        session = WCSession.isSupported() ? .default : nil
        super.init()
    }

    func activate() {
        guard let session else { return }

        if let data = session.receivedApplicationContext[
            GweiloWidgetSnapshot.watchApplicationContextKey
        ] as? Data {
            saveSnapshot(data)
        }

        guard !hasActivated else { return }
        hasActivated = true
        session.delegate = self
        session.activate()
    }

    private func saveSnapshot(_ data: Data) {
        guard let snapshot = try? JSONDecoder().decode(
            GweiloWidgetSnapshot.self,
            from: data
        ) else {
            return
        }

        GweiloWidgetSnapshotStore().save(snapshot)
        self.snapshot = snapshot
        WidgetCenter.shared.reloadTimelines(
            ofKind: GweiloWidgetSnapshot.watchWidgetKind
        )
        WidgetCenter.shared.reloadTimelines(
            ofKind: GweiloWidgetSnapshot.watchEloChartWidgetKind
        )
        WidgetCenter.shared.reloadTimelines(
            ofKind: GweiloWidgetSnapshot.watchFormWidgetKind
        )
        WidgetCenter.shared.reloadTimelines(
            ofKind: GweiloWidgetSnapshot.watchAverageFormWidgetKind
        )
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        guard let data = session.receivedApplicationContext[
            GweiloWidgetSnapshot.watchApplicationContextKey
        ] as? Data else {
            return
        }

        Task { @MainActor [weak self] in
            self?.saveSnapshot(data)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        guard let data = applicationContext[
            GweiloWidgetSnapshot.watchApplicationContextKey
        ] as? Data else {
            return
        }

        Task { @MainActor [weak self] in
            self?.saveSnapshot(data)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessageData messageData: Data
    ) {
        Task { @MainActor [weak self] in
            self?.saveSnapshot(messageData)
        }
    }
}
