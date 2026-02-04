import SwiftUI
import Supabase
import PhotosUI

struct SettingsView: View {
  @StateObject private var viewModel = SettingsViewModel()
  @State private var displayName = ""
  @State private var email = ""
  @State private var newPassword = ""
  @State private var confirmPassword = ""
  @State private var avatarItem: PhotosPickerItem?
  @State private var isSaving = false
  @State private var errorMessage: String?
  @State private var successMessage: String?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 20) {
          profileCard
          accountCard
          signOutCard
        }
        .padding(.horizontal)
        .padding(.bottom, 24)
      }
      .background(AppColors.background)
      .navigationTitle("Settings")
      .task {
        await viewModel.load()
        displayName = viewModel.displayName
        email = viewModel.email
      }
      .onChange(of: avatarItem) { newValue in
        guard let newValue else { return }
        Task { await uploadAvatar(item: newValue) }
      }
    }
  }

  private var profileCard: some View {
    VStack(spacing: 16) {
      HStack(spacing: 16) {
        AvatarView(url: viewModel.avatarURL, fallback: displayName.isEmpty ? "User" : displayName)
          .frame(width: 72, height: 72)

        VStack(alignment: .leading, spacing: 6) {
          Text(displayName.isEmpty ? "User" : displayName)
            .font(.title3.weight(.bold))
            .foregroundStyle(.white)
          Text(email)
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }

        Spacer()
      }

      PhotosPicker(selection: $avatarItem, matching: .images) {
        Text("Change Avatar")
          .font(.subheadline.weight(.semibold))
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(.bordered)

      TextField("Display name", text: $displayName)
        .textInputAutocapitalization(.words)
        .autocorrectionDisabled()
        .authField()

      Button("Save Profile") {
        Haptics.tap()
        Task { await saveProfile() }
      }
      .buttonStyle(.borderedProminent)
      .disabled(displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private var accountCard: some View {
    VStack(spacing: 14) {
      TextField("Email", text: $email)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .authField()

      Button("Update Email") {
        Haptics.tap()
        Task { await updateEmail() }
      }
      .buttonStyle(.bordered)
      .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)

      SecureField("New password", text: $newPassword)
        .authField()

      SecureField("Confirm password", text: $confirmPassword)
        .authField()

      Button("Update Password") {
        Haptics.tap()
        Task { await updatePassword() }
      }
      .buttonStyle(.bordered)
      .disabled(newPassword.isEmpty || confirmPassword.isEmpty || isSaving)

      if let errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(.red)
      }
      if let successMessage {
        Text(successMessage)
          .font(.caption)
          .foregroundStyle(.green)
      }
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private var signOutCard: some View {
    VStack(spacing: 8) {
      Button("Sign Out") {
        Haptics.tap()
        Task { await viewModel.signOut() }
      }
      .buttonStyle(.bordered)
    }
    .frame(maxWidth: .infinity)
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private func saveProfile() async {
    errorMessage = nil
    successMessage = nil
    isSaving = true
    defer { isSaving = false }

    do {
      try await viewModel.updateDisplayName(displayName)
      successMessage = "Profile updated"
    } catch {
      errorMessage = "Failed to update profile"
    }
  }

  private func updateEmail() async {
    errorMessage = nil
    successMessage = nil
    isSaving = true
    defer { isSaving = false }

    do {
      try await viewModel.updateEmail(email)
      successMessage = "Email update requested"
    } catch {
      errorMessage = "Failed to update email"
    }
  }

  private func updatePassword() async {
    errorMessage = nil
    successMessage = nil

    guard newPassword == confirmPassword else {
      errorMessage = "Passwords do not match"
      return
    }

    guard newPassword.count >= 6 else {
      errorMessage = "Password must be at least 6 characters"
      return
    }

    isSaving = true
    defer { isSaving = false }

    do {
      try await viewModel.updatePassword(newPassword)
      newPassword = ""
      confirmPassword = ""
      successMessage = "Password updated"
    } catch {
      errorMessage = "Failed to update password"
    }
  }

  private func uploadAvatar(item: PhotosPickerItem) async {
    errorMessage = nil
    successMessage = nil
    isSaving = true
    defer { isSaving = false }

    do {
      guard let data = try await item.loadTransferable(type: Data.self) else {
        errorMessage = "Failed to load image"
        return
      }

      try await viewModel.uploadAvatar(data: data)
      successMessage = "Avatar updated"
    } catch {
      errorMessage = "Failed to upload avatar"
    }
  }
}

@MainActor
final class SettingsViewModel: ObservableObject {
  @Published var displayName: String = ""
  @Published var email: String = ""
  @Published var avatarURL: URL?

  func load() async {
    let supabase = SupabaseService.shared.client
    guard let user = supabase.auth.currentSession?.user else { return }

    email = user.email ?? ""

    do {
      let profiles: [ProfileRow] = try await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email")
        .eq("id", value: user.id.uuidString)
        .limit(1)
        .execute()
        .value

      if let profile = profiles.first {
        displayName = profile.display_name ?? "User"
        avatarURL = profile.avatar_url.flatMap(URL.init(string:))
        if let profileEmail = profile.email, !profileEmail.isEmpty {
          email = profileEmail
        }
      }
    } catch {
      // Ignore and keep auth data
    }
  }

  func updateDisplayName(_ name: String) async throws {
    let supabase = SupabaseService.shared.client
    guard let user = supabase.auth.currentSession?.user else { return }

    _ = try await supabase
      .from("profiles")
      .update(["display_name": name])
      .eq("id", value: user.id.uuidString)
      .execute()

    displayName = name
  }

  func updateEmail(_ email: String) async throws {
    let supabase = SupabaseService.shared.client
    _ = try await supabase.auth.update(user: UserAttributes(email: email))
  }

  func updatePassword(_ password: String) async throws {
    let supabase = SupabaseService.shared.client
    _ = try await supabase.auth.update(user: UserAttributes(password: password))
  }

  func uploadAvatar(data: Data) async throws {
    let supabase = SupabaseService.shared.client
    guard let user = supabase.auth.currentSession?.user else { return }

    let fileName = "\(user.id.uuidString)-\(Int(Date().timeIntervalSince1970)).jpg"

    _ = try await supabase.storage
      .from("avatars")
      .upload(
        fileName,
        data: data,
        options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: true)
      )

    let publicURL = try supabase.storage
      .from("avatars")
      .getPublicURL(path: fileName)

    _ = try await supabase
      .from("profiles")
      .update(["avatar_url": publicURL.absoluteString])
      .eq("id", value: user.id.uuidString)
      .execute()

    avatarURL = publicURL
  }

  func signOut() async {
    let supabase = SupabaseService.shared.client
    try? await supabase.auth.signOut()
  }
}

private struct ProfileRow: Decodable {
  let id: UUID
  let display_name: String?
  let avatar_url: String?
  let email: String?
}
