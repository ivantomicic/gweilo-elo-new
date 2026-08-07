import ActivityKit
import WidgetKit

@MainActor
enum WidgetPreviewSeeder {
    static func seedIfRequested() async {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments

        if arguments.contains("-widget-preview-data") {
            GweiloWidgetSnapshotStore().save(.preview)
            WidgetCenter.shared.reloadAllTimelines()
        }

        if arguments.contains("-live-activity-preview") {
            await startOrRefreshLiveActivity()
        }
        #endif
    }

    #if DEBUG
    private static func startOrRefreshLiveActivity() async {
        guard
            ActivityAuthorizationInfo().areActivitiesEnabled
        else {
            return
        }

        let content = ActivityContent(
            state: GweiloSessionActivityAttributes.ContentState.previewActive,
            staleDate: Date().addingTimeInterval(2 * 60 * 60)
        )

        let existingActivities = Activity<GweiloSessionActivityAttributes>.activities
        for existing in existingActivities {
            await existing.end(nil, dismissalPolicy: .immediate)
        }
        if !existingActivities.isEmpty {
            try? await Task.sleep(for: .milliseconds(300))
        }

        _ = try? Activity.request(
            attributes: GweiloSessionActivityAttributes.preview,
            content: content,
            pushType: nil
        )
    }
    #endif
}
