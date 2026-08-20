import SwiftUI
import UserNotifications

struct NotificationSettingsSection: View {
    @Environment(\.openURL) private var openURL
    let manager: PushNotificationManager

    var body: some View {
        Section {
            LabeledContent("iOS dozvola") {
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
                    "Dozvoli Gweilo obaveštenja",
                    isOn: masterBinding(preferences: preferences)
                )
                .tint(GweiloTheme.lime)
                .disabled(manager.isSavingPreference)

                ForEach(PushNotificationPreference.visibleCases) { preference in
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
                            ? "Šaljem test…"
                            : "Pošalji test obaveštenje",
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
                    Text("Učitavam podešavanja…")
                        .foregroundStyle(.secondary)
                }
            } else {
                Button("Učitaj ponovo", systemImage: "arrow.clockwise") {
                    Task { await manager.loadPreferences(forceRefresh: true) }
                }
            }

            if let statusMessage = manager.statusMessage {
                Text(statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } header: {
            Text("OBAVEŠTENJA")
        } footer: {
            Text(
                "Podešavanja važe za svaki iPhone povezan sa ovim Gweilo nalogom. iOS dozvola mora biti uključena na svakom uređaju."
            )
        }
    }

    @ViewBuilder
    private var permissionAction: some View {
        switch manager.authorizationStatus {
        case .notDetermined:
            Button("Uključi obaveštenja", systemImage: "bell.badge") {
                Task { await manager.requestAuthorization() }
            }
        case .denied:
            Button("Otvori iOS podešavanja", systemImage: "gear") {
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
