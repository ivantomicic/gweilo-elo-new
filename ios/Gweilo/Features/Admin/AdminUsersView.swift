import Observation
import SwiftUI

@Observable
@MainActor
final class AdminUsersModel {
    private(set) var users: [AdminUser] = []
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var errorMessage: String?

    @ObservationIgnored
    private let client: AdminUsersClient

    init(client: AdminUsersClient) {
        self.client = client
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            users = try await client.users().sorted {
                $0.name.localizedStandardCompare($1.name) == .orderedAscending
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func save(userID: UUID, update: AdminUserUpdate) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            replace(try await client.update(userID: userID, with: update))
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func removeAccess(for userID: UUID) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            _ = try await client.removeAccess(for: userID)
            users.removeAll { $0.id == userID }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func clearError() {
        errorMessage = nil
    }

    private func replace(_ user: AdminUser) {
        guard let index = users.firstIndex(where: { $0.id == user.id }) else {
            users.append(user)
            return
        }
        users[index] = user
    }
}

struct AdminUsersView: View {
    let currentUserID: UUID
    @State private var model: AdminUsersModel
    @State private var searchText = ""

    init(
        configuration: AppConfiguration,
        accessToken: String,
        currentUserID: UUID
    ) {
        self.currentUserID = currentUserID
        _model = State(
            initialValue: AdminUsersModel(
                client: AdminUsersClient(
                    configuration: configuration,
                    accessToken: accessToken
                )
            )
        )
    }

    private var visibleUsers: [AdminUser] {
        let query = searchText.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !query.isEmpty else { return model.users }
        return model.users.filter {
            $0.name.localizedStandardContains(query)
                || $0.email.localizedStandardContains(query)
                || $0.role.displayName.localizedStandardContains(query)
        }
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            if model.isLoading && model.users.isEmpty {
                GweiloFullScreenLoadingView(
                    "Učitavam korisnike…",
                    size: 172
                )
            } else {
                List {
                    if let errorMessage = model.errorMessage {
                        Section {
                            Label(
                                errorMessage,
                                systemImage: "exclamationmark.triangle.fill"
                            )
                            .foregroundStyle(GweiloTheme.coral)
                        }
                    }

                    Section {
                        ForEach(visibleUsers) { user in
                            NavigationLink {
                                AdminUserEditView(
                                    userID: user.id,
                                    currentUserID: currentUserID,
                                    model: model
                                )
                            } label: {
                                AdminUserRow(user: user)
                            }
                        }
                    } header: {
                        Text("\(visibleUsers.count) KORISNIKA")
                    }
                }
                .scrollContentBackground(.hidden)
                .overlay {
                    if visibleUsers.isEmpty {
                        ContentUnavailableView.search(text: searchText)
                    }
                }
                .refreshable {
                    await model.load()
                }
            }
        }
        .navigationTitle("Upravljanje korisnicima")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Ime, email ili uloga")
        .task {
            if model.users.isEmpty {
                await model.load()
            }
        }
    }
}

private struct AdminUserRow: View {
    let user: AdminUser

    var body: some View {
        HStack(spacing: 12) {
            AdminUserAvatar(user: user, size: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(user.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(user.email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                Text(user.role.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(roleColor)

                Text(
                    user.sessionsPerWeek.map { "\($0)× nedeljno" }
                        ?? "Nije podešeno"
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var roleColor: Color {
        switch user.role {
        case .admin: GweiloTheme.lime
        case .mod: GweiloTheme.accent
        case .guest: .secondary
        case .user: .primary
        }
    }
}

private struct AdminUserEditView: View {
    let userID: UUID
    let currentUserID: UUID
    let model: AdminUsersModel

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var role = AdminUserRole.user
    @State private var sessionsPerWeek: Int?
    @State private var showsRemoveAccessConfirmation = false
    @State private var didLoadUser = false

    private var user: AdminUser? {
        model.users.first { $0.id == userID }
    }

    private var hasChanges: Bool {
        guard let user else { return false }
        return name.trimmingCharacters(in: .whitespacesAndNewlines) != user.name
            || email.trimmingCharacters(in: .whitespacesAndNewlines) != user.email
            || role != user.role
            || sessionsPerWeek != user.sessionsPerWeek
    }

    private var canSave: Bool {
        hasChanges
            && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && email.trimmingCharacters(in: .whitespacesAndNewlines).contains("@")
            && !model.isSaving
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            if let user {
                Form {
                    Section {
                        HStack(spacing: 16) {
                            AdminUserAvatar(user: user, size: 64)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(user.name)
                                    .font(.headline)
                                Text(user.email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Section {
                        TextField("Ime za prikaz", text: $name)
                            .textContentType(.name)
                            .textInputAutocapitalization(.words)

                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                    } header: {
                        Text("PROFIL")
                    } footer: {
                        Text(
                            "Promena email adrese šalje poruku za potvrdu na novu adresu."
                        )
                    }

                    Section {
                        Picker("Uloga", selection: $role) {
                            ForEach(AdminUserRole.allCases) { role in
                                Text(role.displayName).tag(role)
                            }
                        }

                        Picker(
                            "Termina nedeljno",
                            selection: $sessionsPerWeek
                        ) {
                            Text("Nije podešeno").tag(Int?.none)
                            ForEach(1...4, id: \.self) { count in
                                Text("\(count)×").tag(Int?.some(count))
                            }
                        }
                    } header: {
                        Text("PRISTUP")
                    } footer: {
                        Text(
                            "Nedeljni cilj koristi se za računanje prisustva i nedolazaka."
                        )
                    }

                    Section {
                        Button("Ukloni pristup platformi", role: .destructive) {
                            showsRemoveAccessConfirmation = true
                        }
                        .disabled(userID == currentUserID || model.isSaving)
                    } footer: {
                        Text(
                            userID == currentUserID
                                ? "Ne možeš ukloniti sopstveni pristup."
                                : "Korisnik više neće moći da se prijavi. Istorijski rezultati neće biti obrisani."
                        )
                    }

                    if let errorMessage = model.errorMessage {
                        Section {
                            Label(
                                errorMessage,
                                systemImage: "exclamationmark.triangle.fill"
                            )
                            .foregroundStyle(GweiloTheme.coral)
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            } else {
                ContentUnavailableView(
                    "Korisnik nije dostupan",
                    systemImage: "person.slash",
                    description: Text(
                        "Ovaj korisnik je možda uklonjen sa liste."
                    )
                )
            }
        }
        .navigationTitle("Izmeni korisnika")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(model.isSaving ? "Čuvam…" : "Sačuvaj") {
                    Task { await save() }
                }
                .disabled(!canSave)
            }
        }
        .disabled(model.isSaving)
        .overlay {
            if model.isSaving {
                ProgressView()
                    .controlSize(.large)
            }
        }
        .task {
            guard !didLoadUser, let user else { return }
            didLoadUser = true
            name = user.name
            email = user.email
            role = user.role
            sessionsPerWeek = user.sessionsPerWeek
            model.clearError()
        }
        .confirmationDialog(
            "Ukloniti pristup za \(user?.name ?? "ovog korisnika")?",
            isPresented: $showsRemoveAccessConfirmation,
            titleVisibility: .visible
        ) {
            Button("Ukloni pristup", role: .destructive) {
                Task {
                    if await model.removeAccess(for: userID) {
                        dismiss()
                    }
                }
            }
            Button("Otkaži", role: .cancel) {}
        } message: {
            Text(
                "Korisnik više neće moći da se prijavi. Istorijski podaci o mečevima ostaju sačuvani."
            )
        }
    }

    private func save() async {
        let update = AdminUserUpdate(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            role: role,
            sessionsPerWeek: sessionsPerWeek
        )
        if await model.save(userID: userID, update: update) {
            dismiss()
        }
    }
}

private struct AdminUserAvatar: View {
    let user: AdminUser
    let size: CGFloat

    var body: some View {
        AsyncImage(
            url: DiceBearAvatar.resolvedURL(
                customURL: user.avatar,
                seed: user.name
            ),
            transaction: Transaction(animation: nil)
        ) { phase in
            if let image = phase.image {
                image
                    .resizable()
                    .scaledToFill()
            } else {
                Text(user.initials.isEmpty ? "?" : user.initials)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(GweiloTheme.bone)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(GweiloTheme.accent)
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .overlay(Circle().stroke(GweiloTheme.hairline, lineWidth: 1))
        .accessibilityHidden(true)
    }
}
