import Foundation
import ActivityKit

struct SessionLiveActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var status: String
  }

  var sessionId: String
  var playerCount: Int
  var startedAt: Date
}
