import Foundation
import Observation
import WidgetKit
import Security

protocol AuthSessionPersisting {
    func load() throws -> AuthSession?
    func save(_ session: AuthSession) throws
    func delete()
}

private struct AuthSessionVault: AuthSessionPersisting {
    private let service = Bundle.main.bundleIdentifier ?? "com.ivantomicic.gweilo"
    private let account = "supabase-session"

    func load() throws -> AuthSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw AuthenticationError.invalidResponse
        }
        return try JSONDecoder().decode(AuthSession.self, from: data)
    }

    func save(_ session: AuthSession) throws {
        let data = try JSONEncoder().encode(session)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            attributes as CFDictionary
        )
        if updateStatus == errSecItemNotFound {
            var insertion = query
            attributes.forEach { insertion[$0.key] = $0.value }
            guard SecItemAdd(insertion as CFDictionary, nil) == errSecSuccess else {
                throw AuthenticationError.invalidResponse
            }
        } else if updateStatus != errSecSuccess {
            throw AuthenticationError.invalidResponse
        }
    }

    func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}

@Observable
@MainActor
final class AuthStore {
    private(set) var session: AuthSession?
    private(set) var isSigningIn = false
    private(set) var isSigningInWithGoogle = false
    private(set) var isRestoringSession = true
    private(set) var errorMessage: String?

    let configuration: AppConfiguration?
    private let vault: any AuthSessionPersisting
    private let networkSession: URLSession
    @ObservationIgnored private var refreshTask: Task<AuthSession, Error>?
    @ObservationIgnored private var refreshGeneration = UUID()
    @ObservationIgnored private var retryRefreshAfter: Date?
    private var didRestoreSession = false

    init(configuration: AppConfiguration? = .load(), vault: (any AuthSessionPersisting)? = nil,
         networkSession: URLSession = AppNetwork.session) {
        self.configuration = configuration
        self.vault = vault ?? AuthSessionVault()
        self.networkSession = networkSession
    }

    func restoreSession() async {
        guard !didRestoreSession else { return }
        didRestoreSession = true
        defer { isRestoringSession = false }

        do {
            guard let storedSession = try vault.load() else { return }
            session = storedSession
            // Restore locally first. Requests validate/refresh credentials without
            // keeping the cached homepage behind a network-dependent splash screen.
        } catch {
            vault.delete()
            errorMessage = "Sačuvana prijava nije mogla da se vrati. Prijavi se ponovo."
        }
    }

    func signIn(email: String, password: String) async {
        guard let configuration else {
            errorMessage = "Supabase nije podešen za ovu verziju aplikacije."
            return
        }

        isSigningIn = true
        errorMessage = nil
        let generation = beginAuthenticationChange()
        defer { isSigningIn = false }

        do {
            let authenticatedSession = try await SupabaseAuthClient(configuration: configuration, session: networkSession)
                .signIn(email: email, password: password)
            guard generation == refreshGeneration else { return }
            try vault.save(authenticatedSession)
            session = authenticatedSession
        } catch {
            guard generation == refreshGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func signInWithGoogle(
        authenticate: @MainActor (URL) async throws -> URL
    ) async {
        guard let configuration else {
            errorMessage = "Supabase nije podešen za ovu verziju aplikacije."
            return
        }

        isSigningIn = true
        isSigningInWithGoogle = true
        errorMessage = nil
        let generation = beginAuthenticationChange()
        defer {
            isSigningIn = false
            isSigningInWithGoogle = false
        }

        do {
            let client = SupabaseAuthClient(configuration: configuration, session: networkSession)
            let authorizationURL = try client.googleAuthorizationURL()
            let callbackURL = try await authenticate(authorizationURL)
            let authenticatedSession = try await client.session(
                fromOAuthCallback: callbackURL
            )
            guard generation == refreshGeneration else { return }
            try vault.save(authenticatedSession)
            session = authenticatedSession
        } catch AuthenticationError.cancelled {
            // Closing the browser is an intentional action, not a sign-in error.
        } catch {
            guard generation == refreshGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func refreshIfNeeded(force: Bool = false) async {
        do {
            _ = try await validSession(force: force)
        } catch { /* The shared refresh owner publishes the error once. */ }
    }

    func requestExecutor(for userID: UUID) -> AuthenticatedRequestExecutor {
        AuthenticatedRequestExecutor(token: { [weak self] rejectedToken in
            guard let self, self.session?.user.id == userID else {
                throw AuthenticationError.sessionExpired
            }
            let force = rejectedToken != nil && self.session?.accessToken == rejectedToken
            let valid = try await self.validSession(force: force)
            guard self.session?.user.id == userID else { throw CancellationError() }
            return valid.accessToken
        }, isCurrentUser: { [weak self] in self?.session?.user.id == userID })
    }

    private func validSession(force: Bool) async throws -> AuthSession {
        guard let current = session, let configuration else {
            throw AuthenticationError.sessionExpired
        }
        if let refreshTask { return try await refreshTask.value }
        guard force || current.needsRefresh() else { return current }
        if let retryRefreshAfter, retryRefreshAfter > .now { throw URLError(.cannotConnectToHost) }
        let generation = refreshGeneration
        let task = Task { [self] in
            do {
                let refreshed = try await SupabaseAuthClient(configuration: configuration, session: networkSession)
                    .refreshSession(refreshToken: current.refreshToken)
                try Task.checkCancellation()
                guard generation == refreshGeneration, session?.user.id == current.user.id else {
                    throw CancellationError()
                }
                try vault.save(refreshed)
                session = refreshed
                retryRefreshAfter = nil
                errorMessage = nil
                return refreshed
            } catch {
                guard generation == refreshGeneration, !Task.isCancelled else { throw CancellationError() }
                if case AuthenticationError.sessionExpired = error {
                    signOut()
                    errorMessage = "Sesija je istekla. Prijavi se ponovo."
                } else {
                    retryRefreshAfter = .now.addingTimeInterval(5)
                    errorMessage = "Prijava nije mogla da se osveži. Pokušaćemo ponovo."
                }
                throw error
            }
        }
        refreshTask = task
        defer { if generation == refreshGeneration { refreshTask = nil } }
        return try await task.value
    }

    static func refreshDelay(for session: AuthSession, now: Date = .now) -> TimeInterval? {
        session.expiresAt.map { max(0, TimeInterval($0) - 90 - now.timeIntervalSince1970) }
    }

    func refreshBeforeExpiry() async {
        while !Task.isCancelled, let current = session,
              let delay = Self.refreshDelay(for: current) {
            do {
                if delay > 0 { try await Task.sleep(for: .seconds(delay)) }
                try Task.checkCancellation()
                await refreshIfNeeded()
                // Retry temporary failures and avoid spinning on malformed expiry values.
                try await Task.sleep(for: .seconds(5))
            } catch { return }
        }
    }

    func signOut() {
        _ = beginAuthenticationChange()
        vault.delete()
        GweiloWidgetSnapshotStore().clear()
        IPhoneWatchSyncService.shared.send(.empty)
        WidgetCenter.shared.reloadTimelines(
            ofKind: GweiloWidgetSnapshot.widgetKind
        )
        session = nil
        errorMessage = nil
    }

    private func beginAuthenticationChange() -> UUID {
        refreshGeneration = UUID()
        refreshTask?.cancel()
        refreshTask = nil
        retryRefreshAfter = nil
        return refreshGeneration
    }

    func reauthenticate(currentPassword: String) async throws -> AuthSession {
        guard
            let configuration,
            let email = session?.user.email,
            !currentPassword.isEmpty
        else {
            throw AuthenticationError.rejected("Unesi trenutnu lozinku.")
        }

        let generation = beginAuthenticationChange()
        let refreshedSession = try await SupabaseAuthClient(configuration: configuration, session: networkSession)
            .signIn(email: email, password: currentPassword)
        guard generation == refreshGeneration else { throw CancellationError() }
        try vault.save(refreshedSession)
        session = refreshedSession
        return refreshedSession
    }

    func updateAuthenticatedUser(_ user: AuthenticatedUser) throws {
        guard let currentSession = session else {
            throw AuthenticationError.rejected("Prijavi se ponovo.")
        }
        let updatedSession = AuthSession(
            accessToken: currentSession.accessToken,
            refreshToken: currentSession.refreshToken,
            expiresIn: currentSession.expiresIn,
            expiresAt: currentSession.expiresAt,
            user: user
        )
        try vault.save(updatedSession)
        session = updatedSession
    }
}
