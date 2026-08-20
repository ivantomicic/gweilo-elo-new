@preconcurrency import HealthKit
import Observation
import WatchKit

@MainActor
@Observable
final class WatchWorkoutManager: NSObject {
    enum Phase: Equatable {
        case idle
        case starting
        case running
        case paused
        case ending
        case failed
    }

    static let shared = WatchWorkoutManager()

    private(set) var phase: Phase = .idle
    private(set) var activeCalories = 0.0
    private(set) var heartRate = 0.0
    private(set) var errorMessage: String?
    private(set) var activationSequence = 0
    var isStartPromptPresented = false
    var isEndPromptPresented = false

    @ObservationIgnored
    private let healthStore = HKHealthStore()
    @ObservationIgnored
    private var workoutSession: HKWorkoutSession?
    @ObservationIgnored
    private var workoutBuilder: HKLiveWorkoutBuilder?
    @ObservationIgnored
    private var pendingConfiguration: HKWorkoutConfiguration?
    @ObservationIgnored
    private var currentGweiloSessionID: UUID?
    @ObservationIgnored
    private let defaults = UserDefaults.standard

    private let lastHandledSessionKey =
        "gweilo-watch-last-workout-offer-session-v1"

    private override init() {
        super.init()
    }

    var isWorkoutActive: Bool {
        switch phase {
        case .starting, .running, .paused, .ending:
            true
        case .idle, .failed:
            false
        }
    }

    var isPaused: Bool {
        phase == .paused
    }

    func receive(_ configuration: HKWorkoutConfiguration) {
        pendingConfiguration = configuration
    }

    func applicationDidBecomeActive() {
        activationSequence &+= 1
    }

    func activeGweiloSessionChanged(to sessionID: UUID?) {
        if let sessionID {
            currentGweiloSessionID = sessionID
            guard !isWorkoutActive,
                  lastHandledSessionID != sessionID else {
                return
            }
            isStartPromptPresented = true
            return
        }

        guard currentGweiloSessionID != nil else { return }
        currentGweiloSessionID = nil
        if isWorkoutActive {
            isEndPromptPresented = true
        }
    }

    func declineWorkout() {
        WatchHaptics.play(.click)
        markCurrentSessionHandled()
        pendingConfiguration = nil
        isStartPromptPresented = false
    }

    func dismissError() {
        WatchHaptics.play(.click)
        errorMessage = nil
        if phase == .failed {
            phase = .idle
        }
    }

    func startWorkout() async {
        guard !isWorkoutActive else { return }

        WatchHaptics.play(.start)
        isStartPromptPresented = false
        errorMessage = nil
        phase = .starting

        do {
            try await requestAuthorization()

            let configuration = pendingConfiguration
                ?? Self.tableTennisConfiguration()
            let session = try HKWorkoutSession(
                healthStore: healthStore,
                configuration: configuration
            )
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )
            session.delegate = self
            builder.delegate = self

            workoutSession = session
            workoutBuilder = builder
            markCurrentSessionHandled()
            pendingConfiguration = nil

            let startDate = Date.now
            session.startActivity(with: startDate)
            try await builder.beginCollection(at: startDate)
            phase = .running
        } catch {
            WatchHaptics.play(.failure)
            workoutSession?.end()
            clearWorkout()
            phase = .failed
            errorMessage = error.localizedDescription
        }
    }

    func togglePause() {
        guard let workoutSession else { return }
        if phase == .paused {
            WatchHaptics.play(.start)
            workoutSession.resume()
        } else if phase == .running {
            WatchHaptics.play(.stop)
            workoutSession.pause()
        }
    }

    func keepRecording() {
        WatchHaptics.play(.click)
        isEndPromptPresented = false
    }

    func endWorkout() async {
        WatchHaptics.play(.stop)
        guard let workoutSession, let workoutBuilder else {
            clearWorkout()
            return
        }

        isEndPromptPresented = false
        phase = .ending
        let endDate = Date.now
        workoutSession.end()

        do {
            try await workoutBuilder.endCollection(at: endDate)
            _ = try await workoutBuilder.finishWorkout()
            clearWorkout()
            phase = .idle
            WatchHaptics.play(.success)
        } catch {
            WatchHaptics.play(.failure)
            clearWorkout()
            phase = .failed
            errorMessage = error.localizedDescription
        }
    }

    func elapsedTime(at date: Date) -> TimeInterval {
        workoutBuilder?.elapsedTime(at: date) ?? 0
    }

    func recoverActiveWorkout() {
        phase = .starting
        healthStore.recoverActiveWorkoutSession { [weak self] session, error in
            let errorMessage = error?.localizedDescription
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let session {
                    self.attachRecoveredSession(session)
                } else if let errorMessage {
                    self.phase = .failed
                    self.errorMessage = errorMessage
                } else {
                    self.phase = .idle
                }
            }
        }
    }

    private func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw WorkoutError.healthDataUnavailable
        }

        let workoutType = HKObjectType.workoutType()
        let heartRateType = HKQuantityType(.heartRate)
        let activeEnergyType = HKQuantityType(.activeEnergyBurned)
        try await healthStore.requestAuthorization(
            toShare: [workoutType],
            read: [workoutType, heartRateType, activeEnergyType]
        )
    }

    private func attachRecoveredSession(_ session: HKWorkoutSession) {
        let builder = session.associatedWorkoutBuilder()
        session.delegate = self
        builder.delegate = self
        workoutSession = session
        workoutBuilder = builder
        updatePhase(from: session.state)
        updateStatistics(
            identifiers: [
                HKQuantityTypeIdentifier.heartRate.rawValue,
                HKQuantityTypeIdentifier.activeEnergyBurned.rawValue,
            ]
        )
    }

    private func updatePhase(from state: HKWorkoutSessionState) {
        switch state {
        case .running:
            phase = .running
        case .paused:
            phase = .paused
        case .ended, .stopped:
            if phase != .ending {
                clearWorkout()
                phase = .idle
            }
        case .notStarted, .prepared:
            phase = .starting
        @unknown default:
            break
        }
    }

    private func updateStatistics(identifiers: Set<String>) {
        guard let workoutBuilder else { return }

        if identifiers.contains(
            HKQuantityTypeIdentifier.activeEnergyBurned.rawValue
        ) {
            let energyType = HKQuantityType(.activeEnergyBurned)
            if let value = workoutBuilder.statistics(for: energyType)?
                .sumQuantity()?.doubleValue(for: .kilocalorie()) {
                activeCalories = value
            }
        }

        if identifiers.contains(HKQuantityTypeIdentifier.heartRate.rawValue) {
            let heartRateType = HKQuantityType(.heartRate)
            if let value = workoutBuilder.statistics(for: heartRateType)?
                .mostRecentQuantity()?.doubleValue(
                    for: .count().unitDivided(by: .minute())
                ) {
                heartRate = value
            }
        }
    }

    private func clearWorkout() {
        workoutSession = nil
        workoutBuilder = nil
        activeCalories = 0
        heartRate = 0
    }

    private func markCurrentSessionHandled() {
        guard let currentGweiloSessionID else { return }
        defaults.set(
            currentGweiloSessionID.uuidString,
            forKey: lastHandledSessionKey
        )
    }

    private var lastHandledSessionID: UUID? {
        defaults.string(forKey: lastHandledSessionKey)
            .flatMap(UUID.init(uuidString:))
    }

    private static func tableTennisConfiguration()
        -> HKWorkoutConfiguration {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .tableTennis
        configuration.locationType = .indoor
        return configuration
    }
}

@MainActor
enum WatchHaptics {
    static func play(_ type: WKHapticType) {
        WKInterfaceDevice.current().play(type)
    }
}

extension WatchWorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            self?.updatePhase(from: toState)
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: any Error
    ) {
        let message = error.localizedDescription
        Task { @MainActor [weak self] in
            self?.clearWorkout()
            self?.phase = .failed
            self?.errorMessage = message
        }
    }
}

extension WatchWorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(
        _ workoutBuilder: HKLiveWorkoutBuilder
    ) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        let identifiers = Set(collectedTypes.map(\.identifier))
        Task { @MainActor [weak self] in
            self?.updateStatistics(identifiers: identifiers)
        }
    }
}

private enum WorkoutError: LocalizedError {
    case healthDataUnavailable

    var errorDescription: String? {
        "Health data is unavailable on this Apple Watch."
    }
}
