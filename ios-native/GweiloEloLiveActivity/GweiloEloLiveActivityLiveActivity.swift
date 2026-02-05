//
//  GweiloEloLiveActivityLiveActivity.swift
//  GweiloEloLiveActivity
//
//  Created by Ivan Tomicic on 5. 2. 2026..
//

import ActivityKit
import WidgetKit
import SwiftUI

struct SessionLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SessionLiveActivityAttributes.self) { context in
      HStack(spacing: 12) {
        Circle()
          .fill(Color.green)
          .frame(width: 10, height: 10)
          .overlay(
            Circle()
              .stroke(Color.green.opacity(0.4), lineWidth: 6)
              .opacity(0.6)
          )

        VStack(alignment: .leading, spacing: 4) {
          Text("Active session")
            .font(.headline.weight(.semibold))
          Text("\(context.attributes.playerCount) players • started \(context.attributes.startedAt, style: .relative)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        Spacer()

        Text(context.state.status.uppercased())
          .font(.caption2.weight(.bold))
          .foregroundStyle(.white)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(Color.green.opacity(0.8))
          .clipShape(Capsule())
      }
      .padding()
      .activityBackgroundTint(Color(.systemBackground))
      .activitySystemActionForegroundColor(Color(.label))

    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text("Session")
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text("\(context.attributes.playerCount) players")
              .font(.caption.weight(.semibold))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text("Live")
            .font(.caption.weight(.bold))
            .foregroundStyle(.green)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("Started \(context.attributes.startedAt, style: .relative)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      } compactLeading: {
        Text("\(context.attributes.playerCount)")
          .font(.caption2.weight(.bold))
      } compactTrailing: {
        Image(systemName: "bolt.circle.fill")
          .foregroundStyle(.green)
      } minimal: {
        Image(systemName: "bolt.fill")
          .foregroundStyle(.green)
      }
      .keylineTint(Color.green)
    }
  }
}

// Preview intentionally removed for iOS 16.x compatibility.
