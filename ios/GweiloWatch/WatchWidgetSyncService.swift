@preconcurrency import WatchConnectivity
import Foundation
import Observation
import WidgetKit

@MainActor
@Observable
final class WatchWidgetSyncService: NSObject, WCSessionDelegate {
    static let shared = WatchWidgetSyncService()

    private(set) var snapshot: GweiloWidgetSnapshot?
    private(set) var isPhoneReachable = false

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

        isPhoneReachable = session.isReachable

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

    func performSessionCommand(
        _ command: GweiloWatchSessionRequest.Command
    ) async throws -> GweiloWatchSessionResponse.Payload {
        activate()
        guard let session, session.activationState == .activated else {
            throw WatchSessionCreationError.phoneUnavailable
        }
        guard session.isReachable else {
            throw WatchSessionCreationError.phoneUnavailable
        }

        let request = GweiloWatchSessionRequest(command: command)
        let requestData = try JSONEncoder().encode(request)

        return try await withCheckedThrowingContinuation { continuation in
            let replyGate = WatchSessionReplyGate(continuation: continuation)
            let callbacks = WatchSessionMessageCallbacks(
                requestID: request.id,
                replyGate: replyGate
            )
            replyGate.startTimeout()

            session.sendMessageData(
                requestData,
                replyHandler: callbacks.handleReply,
                errorHandler: callbacks.handleError
            )
        }
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

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor [weak self] in
            self?.isPhoneReachable = session.isReachable
        }
    }
}

private enum WatchSessionCreationError: LocalizedError, Sendable {
    case phoneUnavailable
    case invalidResponse
    case timedOut
    case rejected(String)

    nonisolated var errorDescription: String? {
        switch self {
        case .phoneUnavailable:
            "Otvori Gweilo na iPhone-u i drži telefon u blizini."
        case .invalidResponse:
            "iPhone je vratio neispravan odgovor. Pokušaj ponovo."
        case .timedOut:
            "iPhone nije odgovorio na vreme. Otvori Gweilo i pokušaj ponovo."
        case let .rejected(message):
            message
        }
    }
}

nonisolated private struct WatchSessionMessageCallbacks: Sendable {
    let requestID: UUID
    let replyGate: WatchSessionReplyGate

    func handleReply(_ data: Data) {
        Task { @MainActor in
            do {
                let response = try JSONDecoder().decode(
                    GweiloWatchSessionResponse.self,
                    from: data
                )
                guard response.requestID == requestID else {
                    throw WatchSessionCreationError.invalidResponse
                }
                if let errorMessage = response.errorMessage {
                    throw WatchSessionCreationError.rejected(errorMessage)
                }
                guard let payload = response.payload else {
                    throw WatchSessionCreationError.invalidResponse
                }
                replyGate.resolve(.success(payload))
            } catch {
                replyGate.resolve(.failure(error))
            }
        }
    }

    func handleError(_ error: any Error) {
        let message = error.localizedDescription
        Task { @MainActor in
            replyGate.resolve(
                .failure(
                    WatchSessionCreationError.rejected(message)
                )
            )
        }
    }
}

nonisolated private final class WatchSessionReplyGate: @unchecked Sendable {
    typealias Payload = GweiloWatchSessionResponse.Payload

    private let lock = NSLock()
    private var continuation: CheckedContinuation<Payload, any Error>?
    private var timeoutTask: Task<Void, Never>?

    init(continuation: CheckedContinuation<Payload, any Error>) {
        self.continuation = continuation
    }

    func startTimeout() {
        let task = Task { [weak self] in
            try? await Task.sleep(for: .seconds(12))
            guard !Task.isCancelled else { return }
            self?.resolve(.failure(WatchSessionCreationError.timedOut))
        }

        lock.lock()
        if continuation == nil {
            lock.unlock()
            task.cancel()
            return
        }
        timeoutTask = task
        lock.unlock()
    }

    func resolve(_ result: Result<Payload, any Error>) {
        lock.lock()
        guard let continuation else {
            lock.unlock()
            return
        }
        self.continuation = nil
        let timeoutTask = self.timeoutTask
        self.timeoutTask = nil
        lock.unlock()

        timeoutTask?.cancel()
        continuation.resume(with: result)
    }
}
