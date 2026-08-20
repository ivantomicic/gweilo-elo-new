import SwiftUI

@main
struct GweiloWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self)
    private var appDelegate
    @State private var syncService = WatchWidgetSyncService.shared
    @State private var workoutManager = WatchWorkoutManager.shared

    init() {
        WatchWidgetSyncService.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            InstallationProofView(
                snapshot: syncService.snapshot,
                workoutManager: workoutManager
            )
        }
    }
}
