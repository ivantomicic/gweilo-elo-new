import Foundation
import Supabase

@MainActor
final class AuthViewModel: ObservableObject {
  @Published var session: Session?
  @Published var isLoading = true
  @Published var errorMessage: String?

  private let supabase: SupabaseClient
  private var authListener: Task<Void, Never>?

  init(supabase: SupabaseClient = SupabaseService.shared.client) {
    self.supabase = supabase
    self.session = supabase.auth.currentSession
    startAuthListener()
    Task { await loadSession() }
  }

  deinit {
    authListener?.cancel()
  }

  func loadSession() async {
    isLoading = true
    defer { isLoading = false }

    do {
      session = try await supabase.auth.session
    } catch {
      session = nil
    }
  }

  func signIn(email: String, password: String) async {
    await withLoading { [weak self] in
      do {
        _ = try await self?.supabase.auth.signIn(email: email, password: password)
      } catch {
        self?.errorMessage = error.localizedDescription
      }
    }
  }

  func signUp(email: String, password: String) async {
    await withLoading { [weak self] in
      do {
        _ = try await self?.supabase.auth.signUp(email: email, password: password)
      } catch {
        self?.errorMessage = error.localizedDescription
      }
    }
  }

  func signOut() async {
    await withLoading { [weak self] in
      do {
        try await self?.supabase.auth.signOut()
      } catch {
        self?.errorMessage = error.localizedDescription
      }
    }
  }

  private func startAuthListener() {
    authListener = Task { [weak self] in
      guard let self else { return }
      for await (_, session) in await supabase.auth.authStateChanges {
        self.session = session
      }
    }
  }

  private func withLoading(_ work: @escaping () async -> Void) async {
    errorMessage = nil
    isLoading = true
    await work()
    isLoading = false
  }
}
