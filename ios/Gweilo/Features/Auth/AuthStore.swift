import Foundation
import Observation

@Observable
@MainActor
final class AuthStore {
    private(set) var session: AuthSession?
    private(set) var isSigningIn = false
    private(set) var errorMessage: String?

    let configuration: AppConfiguration?

    init(configuration: AppConfiguration? = .load()) {
        self.configuration = configuration
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
            session = try await SupabaseAuthClient(configuration: configuration)
                .signIn(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        session = nil
        errorMessage = nil
    }
}
