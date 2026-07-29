import Foundation
import Observation
import Security

private struct AuthSessionVault {
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
    private let vault = AuthSessionVault()
    private var didRestoreSession = false

    init(configuration: AppConfiguration? = .load()) {
        self.configuration = configuration
    }

    func restoreSession() async {
        guard !didRestoreSession else { return }
        didRestoreSession = true
        defer { isRestoringSession = false }

        do {
            guard let storedSession = try vault.load() else { return }
            session = storedSession
            await refreshIfNeeded()
        } catch {
            vault.delete()
            errorMessage = "Your saved login could not be restored. Please sign in again."
        }
    }

    func signIn(email: String, password: String) async {
        guard let configuration else {
            errorMessage = "Supabase is not configured for this build."
            return
        }

        isSigningIn = true
        errorMessage = nil
        defer { isSigningIn = false }

        do {
            let authenticatedSession = try await SupabaseAuthClient(configuration: configuration)
                .signIn(email: email, password: password)
            try vault.save(authenticatedSession)
            session = authenticatedSession
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signInWithGoogle(
        authenticate: @MainActor (URL) async throws -> URL
    ) async {
        guard let configuration else {
            errorMessage = "Supabase is not configured for this build."
            return
        }

        isSigningIn = true
        isSigningInWithGoogle = true
        errorMessage = nil
        defer {
            isSigningIn = false
            isSigningInWithGoogle = false
        }

        do {
            let client = SupabaseAuthClient(configuration: configuration)
            let authorizationURL = try client.googleAuthorizationURL()
            let callbackURL = try await authenticate(authorizationURL)
            let authenticatedSession = try await client.session(
                fromOAuthCallback: callbackURL
            )
            try vault.save(authenticatedSession)
            session = authenticatedSession
        } catch AuthenticationError.cancelled {
            // Closing the browser is an intentional action, not a sign-in error.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshIfNeeded(force: Bool = false) async {
        guard
            let configuration,
            let currentSession = session,
            force || currentSession.needsRefresh()
        else {
            return
        }

        do {
            let refreshedSession = try await SupabaseAuthClient(configuration: configuration)
                .refreshSession(refreshToken: currentSession.refreshToken)
            try vault.save(refreshedSession)
            session = refreshedSession
            errorMessage = nil
        } catch let error as AuthenticationError {
            if case .rejected = error {
                signOut()
                errorMessage = "Your session expired. Please sign in again."
            } else {
                errorMessage = error.localizedDescription
            }
        } catch {
            // Keep the saved session through temporary connectivity failures.
            errorMessage = "Could not refresh your login. We will try again."
        }
    }

    func refreshBeforeExpiry() async {
        guard
            let currentSession = session,
            let expiresAt = currentSession.expiresAt
        else {
            return
        }

        let refreshAt = TimeInterval(expiresAt) - 90
        let delay = max(0, refreshAt - Date.now.timeIntervalSince1970)
        if delay > 0 {
            try? await Task.sleep(
                for: .seconds(Int64(delay.rounded(.down)))
            )
        }
        guard
            !Task.isCancelled,
            session?.accessToken == currentSession.accessToken
        else {
            return
        }
        await refreshIfNeeded()
    }

    func signOut() {
        vault.delete()
        session = nil
        errorMessage = nil
    }

    func reauthenticate(currentPassword: String) async throws -> AuthSession {
        guard
            let configuration,
            let email = session?.user.email,
            !currentPassword.isEmpty
        else {
            throw AuthenticationError.rejected("Enter your current password.")
        }

        let refreshedSession = try await SupabaseAuthClient(configuration: configuration)
            .signIn(email: email, password: currentPassword)
        try vault.save(refreshedSession)
        session = refreshedSession
        return refreshedSession
    }

    func updateAuthenticatedUser(_ user: AuthenticatedUser) throws {
        guard let currentSession = session else {
            throw AuthenticationError.rejected("Please sign in again.")
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
