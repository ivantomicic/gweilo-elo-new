import Foundation
import ActivityKit

@available(iOS 16.1, *)
final class SessionLiveActivityManager {
  static let shared = SessionLiveActivityManager()

  private init() {}

  func sync(with session: ActiveSession?) async {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

    if let session {
      await startOrUpdate(session: session)
    } else {
      await endAll()
    }
  }

  private func startOrUpdate(session: ActiveSession) async {
    let attributes = SessionLiveActivityAttributes(
      sessionId: session.id.uuidString,
      playerCount: session.player_count,
      startedAt: session.startedAtDate
    )
    let contentState = SessionLiveActivityAttributes.ContentState(status: "Live")

    if let existing = Activity<SessionLiveActivityAttributes>.activities.first(where: { $0.attributes.sessionId == attributes.sessionId }) {
      await existing.update(using: contentState)
      return
    }

    for activity in Activity<SessionLiveActivityAttributes>.activities {
      await activity.end(using: nil, dismissalPolicy: .immediate)
    }

    do {
      _ = try Activity.request(
        attributes: attributes,
        contentState: contentState,
        pushType: nil
      )
    } catch {
      print("Failed to start Live Activity: \(error)")
    }
  }

  private func endAll() async {
    for activity in Activity<SessionLiveActivityAttributes>.activities {
      await activity.end(using: nil, dismissalPolicy: .immediate)
    }
  }
}
