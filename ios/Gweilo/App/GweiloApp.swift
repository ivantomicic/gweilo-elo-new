import SwiftUI

@main
struct GweiloApp: App {
    @UIApplicationDelegateAdaptor(NotificationAppDelegate.self)
    private var notificationDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}
