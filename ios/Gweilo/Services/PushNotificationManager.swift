import Foundation
import Observation
import UIKit
import UserNotifications

private struct PushNotificationAPIErrorResponse: Decodable {
    let error: String?
    let detail: String?
}

private struct PushNotificationAPIClient: Sendable {
    let configuration: AppConfiguration
    let accessToken: String
    var session: URLSession = .shared

    func fetchPreferences() async throws -> PushNotificationPreferences {
        let response: PushNotificationPreferencesResponse = try await perform(
            path: "api/notifications/preferences"
        )
        return response.preferences
    }

    func updatePreferences(
        _ patch: PushNotificationPreferencesPatch
    ) async throws -> PushNotificationPreferences {
        let response: PushNotificationPreferencesResponse = try await perform(
            path: "api/notifications/preferences",
            method: "PATCH",
            body: patch
        )
        return response.preferences
    }

    func registerDevice(_ device: PushDeviceRegistration) async throws {
        let _: DeviceRegistrationResponse = try await perform(
            path: "api/notifications/devices",
            method: "POST",
            body: device
        )
    }

    func unregisterDevice(_ device: PushDeviceUnregistration) async throws {
        let _: DeviceRegistrationResponse = try await perform(
            path: "api/notifications/devices",
            method: "DELETE",
            body: device
        )
    }

    func sendTest() async throws -> PushNotificationTestResponse {
        try await perform(
            path: "api/notifications/test",
            method: "POST"
        )
    }

    private func perform<Response: Decodable>(
        path: String,
        method: String = "GET"
    ) async throws -> Response {
        try await perform(
            path: path,
            method: method,
            bodyData: nil
        )
    }

    private func perform<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body
    ) async throws -> Response {
        try await perform(
            path: path,
            method: method,
            bodyData: try JSONEncoder().encode(body)
        )
    }

    private func perform<Response: Decodable>(
        path: String,
        method: String,
        bodyData: Data?
    ) async throws -> Response {
        var request = URLRequest(
            url: configuration.apiBaseURL.appending(path: path)
        )
        request.httpMethod = method
        request.setValue(
            "Bearer \(accessToken)",
            forHTTPHeaderField: "Authorization"
        )
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Accept"
        )
        if let bodyData {
            request.httpBody = bodyData
            request.setValue(
                "application/json",
                forHTTPHeaderField: "Content-Type"
            )
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAPIError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorResponse = try? JSONDecoder().decode(
                PushNotificationAPIErrorResponse.self,
                from: data
            )
            throw BackendAPIError.rejected(
                errorResponse?.error
                    ?? errorResponse?.detail
                    ?? "Notification settings could not be updated."
            )
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

private struct DeviceRegistrationResponse: Decodable, Sendable {
    let registered: Bool
}

@Observable
@MainActor
final class PushNotificationManager {
    static let shared = PushNotificationManager()

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private(set) var preferences: PushNotificationPreferences?
    private(set) var isLoadingPreferences = false
    private(set) var isSavingPreference = false
    private(set) var isRegisteringDevice = false
    private(set) var isSendingTest = false
    private(set) var statusMessage: String?
    private(set) var pendingSessionID: UUID?
    private(set) var shouldOpenSessions = false

    @ObservationIgnored
    private let notificationCenter = UNUserNotificationCenter.current()
    @ObservationIgnored
    private var apiClient: PushNotificationAPIClient?
    @ObservationIgnored
    private var deviceToken: String?

    private init() {}

    var isSystemAuthorized: Bool {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            true
        default:
            false
        }
    }

    var authorizationLabel: String {
        switch authorizationStatus {
        case .notDetermined: "Nije uključeno"
        case .denied: "Blokirano u iOS podešavanjima"
        case .authorized: "Uključeno"
        case .provisional: "Tiha isporuka"
        case .ephemeral: "Privremeno uključeno"
        @unknown default: "Nepoznato"
        }
    }

    func configure(
        configuration: AppConfiguration,
        session: AuthSession
    ) async {
        apiClient = PushNotificationAPIClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        await refreshAuthorizationStatus()
        await loadPreferences()
        SessionLiveActivityManager.shared.configure(
            configuration: configuration,
            session: session,
            enabled: preferences?.liveActivitiesEnabled ?? true
        )
        if isSystemAuthorized {
            UIApplication.shared.registerForRemoteNotifications()
        }
        await registerDeviceIfPossible()
    }

    func updateAccessToken(
        configuration: AppConfiguration,
        session: AuthSession
    ) {
        apiClient = PushNotificationAPIClient(
            configuration: configuration,
            accessToken: session.accessToken
        )
        SessionLiveActivityManager.shared.updateAccessToken(
            configuration: configuration,
            session: session
        )
    }

    func clearConfiguration() {
        apiClient = nil
        preferences = nil
        SessionLiveActivityManager.shared.clearConfiguration()
    }

    func requestAuthorization() async {
        statusMessage = nil
        do {
            let granted = try await notificationCenter.requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            await refreshAuthorizationStatus()
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
                statusMessage = "Obaveštenja su uključena."
            } else {
                statusMessage = "Obaveštenja nisu uključena."
            }
        } catch {
            statusMessage = "iOS nije uspeo da uključi obaveštenja."
        }
    }

    func refreshAuthorizationStatus() async {
        let settings = await notificationCenter.notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    func loadPreferences() async {
        guard let apiClient, !isLoadingPreferences else { return }
        isLoadingPreferences = true
        defer { isLoadingPreferences = false }
        do {
            preferences = try await apiClient.fetchPreferences()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func setNotificationsEnabled(_ value: Bool) async {
        await updatePreferences(
            PushNotificationPreferencesPatch(enabled: value)
        )
    }

    func setPreference(
        _ preference: PushNotificationPreference,
        enabled: Bool
    ) async {
        await updatePreferences(preference.patch(value: enabled))
        if preference == .liveActivities {
            await SessionLiveActivityManager.shared.setEnabled(enabled)
        }
    }

    func sendTest() async {
        guard let apiClient, !isSendingTest else { return }
        isSendingTest = true
        statusMessage = nil
        defer { isSendingTest = false }
        do {
            let response = try await apiClient.sendTest()
            switch response.result.status {
            case "configuration_required":
                statusMessage =
                    "Aplikacija je spremna, ali Apple APNs podaci još nisu povezani."
            case "no_recipients":
                statusMessage =
                    "Ovaj iPhone još nije završio registraciju kod Apple-a."
            default:
                statusMessage = "Test obaveštenje je poslato."
            }
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func didRegisterForRemoteNotifications(deviceToken data: Data) async {
        deviceToken = data.map { String(format: "%02x", $0) }.joined()
        await registerDeviceIfPossible()
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        statusMessage = "Apple registracija nije uspela: \(error.localizedDescription)"
    }

    func unregisterCurrentDevice() async {
        if let apiClient, let deviceToken {
            do {
                try await apiClient.unregisterDevice(
                    PushDeviceUnregistration(
                        token: deviceToken,
                        environment: Self.environment,
                        bundleId: Self.bundleID
                    )
                )
            } catch {
                // Signing out must still succeed if the network is unavailable.
            }
        }
        UIApplication.shared.unregisterForRemoteNotifications()
        self.deviceToken = nil
        self.apiClient = nil
        preferences = nil
        await SessionLiveActivityManager.shared.setEnabled(false)
    }

    func handleNotification(userInfo: [AnyHashable: Any]) {
        let route = userInfo["route"] as? String
        if route == "sessions" {
            pendingSessionID = nil
            shouldOpenSessions = true
            return
        }

        guard
            route == "session",
            let sessionIDString = userInfo["sessionId"] as? String,
            let sessionID = UUID(uuidString: sessionIDString)
        else {
            return
        }
        shouldOpenSessions = false
        pendingSessionID = sessionID
    }

    func handleDeepLink(_ url: URL) {
        guard url.scheme == "gweilo", url.host == "session" else { return }
        let value = url.pathComponents
            .filter { $0 != "/" }
            .first
        guard let value, let sessionID = UUID(uuidString: value) else { return }
        shouldOpenSessions = false
        pendingSessionID = sessionID
    }

    func consumePendingSession(_ sessionID: UUID) {
        guard pendingSessionID == sessionID else { return }
        pendingSessionID = nil
    }

    func consumeSessionsDestination() {
        shouldOpenSessions = false
    }

    private func updatePreferences(
        _ patch: PushNotificationPreferencesPatch
    ) async {
        guard let apiClient, !isSavingPreference else { return }
        isSavingPreference = true
        statusMessage = nil
        defer { isSavingPreference = false }
        do {
            preferences = try await apiClient.updatePreferences(patch)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func registerDeviceIfPossible() async {
        guard
            let apiClient,
            let deviceToken,
            isSystemAuthorized,
            !isRegisteringDevice
        else {
            return
        }

        isRegisteringDevice = true
        defer { isRegisteringDevice = false }
        do {
            try await apiClient.registerDevice(
                PushDeviceRegistration(
                    token: deviceToken,
                    environment: Self.environment,
                    bundleId: Self.bundleID,
                    appVersion: Bundle.main.object(
                        forInfoDictionaryKey: "CFBundleShortVersionString"
                    ) as? String
                )
            )
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private static var bundleID: String {
        Bundle.main.bundleIdentifier ?? "com.ivantomicic.gweilo"
    }

    private static var environment: String {
        #if DEBUG
        "development"
        #else
        "production"
        #endif
    }
}

final class NotificationAppDelegate:
    NSObject,
    UIApplicationDelegate,
    UNUserNotificationCenterDelegate
{
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions:
            [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task {
            await PushNotificationManager.shared
                .didRegisterForRemoteNotifications(deviceToken: deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushNotificationManager.shared
            .didFailToRegisterForRemoteNotifications(error: error)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        PushNotificationManager.shared.handleNotification(
            userInfo: response.notification.request.content.userInfo
        )
    }
}
