import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct AccountSettingsView: View {
    let authStore: AuthStore
    let initialProfile: AccountProfile?
    let refreshAppData: () async -> Void

    @State private var displayName: String
    @State private var avatarURL: URL?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var email = ""
    @State private var emailCurrentPassword = ""
    @State private var passwordCurrentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isLoadingProfile = false
    @State private var isSaving = false
    @State private var message: String?
    @State private var errorMessage: String?

    init(
        authStore: AuthStore,
        initialProfile: AccountProfile? = nil,
        refreshAppData: @escaping () async -> Void = {}
    ) {
        self.authStore = authStore
        self.initialProfile = initialProfile
        self.refreshAppData = refreshAppData
        _displayName = State(initialValue: initialProfile?.displayName ?? "")
        _avatarURL = State(initialValue: initialProfile?.avatarURL)
        _email = State(initialValue: authStore.session?.user.email ?? "")
    }

    private var userID: UUID? { authStore.session?.user.id }
    private var accessToken: String? { authStore.session?.accessToken }

    var body: some View {
        ZStack {
            ArenaBackground()

            List {
                profileSection
                emailSection
                passwordSection

                if let message {
                    Section {
                        Label(message, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(GweiloTheme.lime)
                    }
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(GweiloTheme.coral)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .disabled(isSaving || isLoadingProfile)
        }
        .navigationTitle("Nalog")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadProfile() }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task { await saveAvatar(item) }
        }
    }

    private var profileSection: some View {
        Section {
            HStack(spacing: 16) {
                ProfileAvatar(url: avatarURL, name: displayName)

                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Promeni fotografiju", systemImage: "camera")
                }
            }

            TextField("Ime za prikaz", text: $displayName)
                .textContentType(.name)
                .textInputAutocapitalization(.words)

            Button("Sačuvaj profil") {
                Task { await saveProfile() }
            }
            .disabled(displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } header: {
            Text("PROFIL")
        } footer: {
            Text("Tvoje ime i fotografiju vide ostali Gweilo članovi.")
        }
    }

    private var emailSection: some View {
        Section {
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)

            SecureField("Trenutna lozinka", text: $emailCurrentPassword)
                .textContentType(.password)

            Button("Promeni email") {
                Task { await saveEmail() }
            }
            .disabled(!canChangeEmail)
        } header: {
            Text("EMAIL")
        } footer: {
            Text("Poslaćemo link za potvrdu na novu email adresu. Radi zaštite ove izmene potrebna je trenutna lozinka.")
        }
    }

    private var passwordSection: some View {
        Section {
            SecureField("Trenutna lozinka", text: $passwordCurrentPassword)
                .textContentType(.password)

            SecureField("Nova lozinka", text: $newPassword)
                .textContentType(.newPassword)

            SecureField("Potvrdi novu lozinku", text: $confirmPassword)
                .textContentType(.newPassword)

            Button("Postavi novu lozinku") {
                Task { await savePassword() }
            }
            .disabled(!canChangePassword)
        } header: {
            Text("LOZINKA")
        } footer: {
            Text("Koristi najmanje 6 znakova. Pre postavljanja nove lozinke potrebna je trenutna lozinka.")
        }
    }

    private var canChangeEmail: Bool {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalizedEmail.contains("@") &&
            normalizedEmail != authStore.session?.user.email &&
            !emailCurrentPassword.isEmpty
    }

    private var canChangePassword: Bool {
        !passwordCurrentPassword.isEmpty &&
            newPassword.count >= 6 &&
            newPassword == confirmPassword
    }

    @MainActor
    private func loadProfile() async {
        guard let userID, let accessToken, let configuration = authStore.configuration else {
            return
        }
        isLoadingProfile = true
        defer { isLoadingProfile = false }

        do {
            let profile = try await AccountSettingsClient(configuration: configuration)
                .profile(userID: userID, accessToken: accessToken)
            if let profile {
                displayName = profile.displayName
                avatarURL = profile.avatarURL
            }
        } catch {
            errorMessage = "Profil naloga nije mogao da se učita."
        }
    }

    @MainActor
    private func saveProfile() async {
        guard let userID, let accessToken, let configuration = authStore.configuration else {
            return
        }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        await performSave {
            let user = try await AccountSettingsClient(configuration: configuration)
                .updateDisplayName(name, accessToken: accessToken, userID: userID)
            try authStore.updateAuthenticatedUser(user)
            await refreshAppData()
            message = "Profil je ažuriran."
        }
    }

    @MainActor
    private func saveAvatar(_ item: PhotosPickerItem) async {
        guard let userID, let accessToken, let configuration = authStore.configuration else {
            return
        }

        await performSave {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw AuthenticationError.rejected("Fotografija nije mogla da se učita.")
            }
            let mimeType = item.supportedContentTypes.first?.preferredMIMEType ?? "image/jpeg"
            let url = try await AccountSettingsClient(configuration: configuration)
                .uploadAvatar(data, mimeType: mimeType, accessToken: accessToken, userID: userID)
            avatarURL = url
            selectedPhoto = nil
            await refreshAppData()
            message = "Profilna fotografija je ažurirana."
        }
    }

    @MainActor
    private func saveEmail() async {
        guard let configuration = authStore.configuration else { return }
        let newEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        await performSave {
            let freshSession = try await authStore.reauthenticate(
                currentPassword: emailCurrentPassword
            )
            let user = try await SupabaseAuthClient(configuration: configuration)
                .updateUser(accessToken: freshSession.accessToken, email: newEmail)
            try authStore.updateAuthenticatedUser(user)
            emailCurrentPassword = ""
            message = "Email za potvrdu poslat je na \(newEmail)."
        }
    }

    @MainActor
    private func savePassword() async {
        guard let configuration = authStore.configuration else { return }
        guard newPassword == confirmPassword else {
            errorMessage = "Nove lozinke se ne podudaraju."
            return
        }

        await performSave {
            let freshSession = try await authStore.reauthenticate(
                currentPassword: passwordCurrentPassword
            )
            let user = try await SupabaseAuthClient(configuration: configuration)
                .updateUser(accessToken: freshSession.accessToken, password: newPassword)
            try authStore.updateAuthenticatedUser(user)
            passwordCurrentPassword = ""
            newPassword = ""
            confirmPassword = ""
            message = "Lozinka je ažurirana."
        }
    }

    @MainActor
    private func performSave(_ operation: () async throws -> Void) async {
        isSaving = true
        message = nil
        errorMessage = nil
        defer { isSaving = false }

        do {
            try await operation()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ProfileAvatar: View {
    let url: URL?
    let name: String

    var body: some View {
        CachedRemoteImage(
            url: DiceBearAvatar.resolvedURL(customURL: url, seed: name),
            pointSize: 64
        ) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Text(name.first.map(String.init) ?? "?")
                .font(.title2.weight(.bold))
                .foregroundStyle(GweiloTheme.bone)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(GweiloTheme.accent)
        }
        .frame(width: 64, height: 64)
        .clipShape(.circle)
        .overlay(Circle().stroke(GweiloTheme.hairline, lineWidth: 1))
        .accessibilityLabel("Profilna fotografija")
    }
}
