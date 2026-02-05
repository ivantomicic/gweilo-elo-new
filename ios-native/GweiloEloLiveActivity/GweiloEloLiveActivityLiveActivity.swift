//
//  GweiloEloLiveActivityLiveActivity.swift
//  GweiloEloLiveActivity
//
//  Created by Ivan Tomicic on 5. 2. 2026..
//

import ActivityKit
import WidgetKit
import SwiftUI

struct GweiloEloLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct GweiloEloLiveActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GweiloEloLiveActivityAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension GweiloEloLiveActivityAttributes {
    fileprivate static var preview: GweiloEloLiveActivityAttributes {
        GweiloEloLiveActivityAttributes(name: "World")
    }
}

extension GweiloEloLiveActivityAttributes.ContentState {
    fileprivate static var smiley: GweiloEloLiveActivityAttributes.ContentState {
        GweiloEloLiveActivityAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: GweiloEloLiveActivityAttributes.ContentState {
         GweiloEloLiveActivityAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: GweiloEloLiveActivityAttributes.preview) {
   GweiloEloLiveActivityLiveActivity()
} contentStates: {
    GweiloEloLiveActivityAttributes.ContentState.smiley
    GweiloEloLiveActivityAttributes.ContentState.starEyes
}
