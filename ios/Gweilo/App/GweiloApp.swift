import SwiftUI

@main
struct GweiloApp: App {
    @UIApplicationDelegateAdaptor(NotificationAppDelegate.self)
    private var notificationDelegate

    init() {
        IPhoneWatchSyncService.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .task {
                    await WidgetPreviewSeeder.seedIfRequested()
                }
        }
    }
}
