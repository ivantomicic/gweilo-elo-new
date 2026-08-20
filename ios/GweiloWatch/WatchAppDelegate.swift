@preconcurrency import HealthKit
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidBecomeActive() {
        Task { @MainActor in
            WatchWorkoutManager.shared.applicationDidBecomeActive()
        }
    }

    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            WatchWorkoutManager.shared.receive(workoutConfiguration)
        }
    }

    func handleActiveWorkoutRecovery() {
        Task { @MainActor in
            WatchWorkoutManager.shared.recoverActiveWorkout()
        }
    }
}
