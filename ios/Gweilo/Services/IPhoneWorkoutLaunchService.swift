@preconcurrency import HealthKit

@MainActor
final class IPhoneWorkoutLaunchService {
    static let shared = IPhoneWorkoutLaunchService()

    private let healthStore = HKHealthStore()

    private init() {}

    func requestWorkoutPromptOnWatch() {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .tableTennis
        configuration.locationType = .indoor

        Task {
            do {
                try await healthStore.startWatchApp(
                    toHandle: configuration
                )
            } catch {
                // The active-session snapshot remains the durable fallback.
                // Opening Gweilo on Watch will still offer the workout once.
            }
        }
    }
}
