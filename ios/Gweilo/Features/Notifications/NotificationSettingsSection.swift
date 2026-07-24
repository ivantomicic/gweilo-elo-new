import SwiftUI
import UserNotifications

struct NotificationSettingsSection: View {
    @Environment(\.openURL) private var openURL
    let manager: PushNotificationManager

    var body: some View {
        Section {
            LabeledContent("iOS permission") {
                Text(manager.authorizationLabel)
                    .foregroundStyle(
                        manager.isSystemAuthorized
                            ? GweiloTheme.lime
                            : .secondary
                    )
            }

            permissionAction

            if let preferences = manager.preferences {
                Toggle(
                    "Allow Gweilo notifications",
                    isOn: masterBinding(preferences: preferences)
                )
                .tint(GweiloTheme.lime)
                .disabled(manager.isSavingPreference)

                ForEach(PushNotificationPreference.allCases) { preference in
                    Toggle(
                        isOn: binding(
                            for: preference,
                            preferences: preferences
                        )
                    ) {
                        Label(
                            preference.title,
                            systemImage: preference.systemImage
                        )
                    }
                    .tint(GweiloTheme.lime)
                    .disabled(
                        !preferences.enabled
                            || manager.isSavingPreference
                    )
                    .accessibilityHint(preference.detail)
                }

                Button {
                    Task { await manager.sendTest() }
                } label: {
                    Label(
                        manager.isSendingTest
                            ? "Sending test…"
                            : "Send test notification",
                        systemImage: "paperplane"
                    )
                }
                .disabled(
                    !manager.isSystemAuthorized
                        || !preferences.enabled
                        || manager.isSendingTest
                )
            } else if manager.isLoadingPreferences {
                HStack {
                    ProgressView()
                    Text("Loading preferences…")
                        .foregroundStyle(.secondary)
                }
            } else {
                Button("Reload preferences", systemImage: "arrow.clockwise") {
                    Task { await manager.loadPreferences() }
                }
            }

            if let statusMessage = manager.statusMessage {
                Text(statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } header: {
            Text("NOTIFICATIONS")
        } footer: {
            Text(
                "Your choices apply to every iPhone connected to this Gweilo account. iOS permission must also be enabled on each device."
            )
        }
    }

    @ViewBuilder
    private var permissionAction: some View {
        switch manager.authorizationStatus {
        case .notDetermined:
            Button("Enable notifications", systemImage: "bell.badge") {
                Task { await manager.requestAuthorization() }
            }
        case .denied:
            Button("Open iOS Settings", systemImage: "gear") {
                guard let settingsURL = URL(
                    string: UIApplication.openSettingsURLString
                ) else {
                    return
                }
                openURL(settingsURL)
            }
        default:
            EmptyView()
        }
    }

    private func masterBinding(
        preferences: PushNotificationPreferences
    ) -> Binding<Bool> {
        Binding(
            get: { preferences.enabled },
            set: { value in
                Task {
                    await manager.setNotificationsEnabled(value)
                }
            }
        )
    }

    private func binding(
        for preference: PushNotificationPreference,
        preferences: PushNotificationPreferences
    ) -> Binding<Bool> {
        Binding(
            get: { preference.value(in: preferences) },
            set: { value in
                Task {
                    await manager.setPreference(
                        preference,
                        enabled: value
                    )
                }
            }
        )
    }
}

