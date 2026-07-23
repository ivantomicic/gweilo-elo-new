import SwiftUI

struct SignInView: View {
    let authStore: AuthStore

    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
    }

    private var canSubmit: Bool {
        email.contains("@") && !password.isEmpty && !authStore.isSigningIn
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    header
                    form
                }
                .frame(maxWidth: 520)
                .padding(.horizontal, 24)
                .padding(.vertical, 48)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("GWEILO")
                .font(.caption.weight(.bold))
                .tracking(1.8)
                .foregroundStyle(GweiloTheme.accent)

            Text("Ready to play?")
                .font(.largeTitle.weight(.bold))

            Text("Sign in with the same account you use on the web.")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 18) {
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }

            Divider()

            SecureField("Password", text: $password)
                .textContentType(.password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit(submit)

            Divider()

            if let errorMessage = authStore.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(GweiloTheme.coral)
                    .accessibilityLabel("Sign-in error: \(errorMessage)")
            }

            Button(action: submit) {
                HStack {
                    if authStore.isSigningIn {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(authStore.isSigningIn ? "Signing in…" : "Sign in")
                    Spacer()
                    Image(systemName: "arrow.right")
                }
                .font(.headline)
                .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canSubmit)

            if authStore.configuration == nil {
                Label(
                    "Add SUPABASE_URL and SUPABASE_ANON_KEY in the target Build Settings.",
                    systemImage: "wrench.and.screwdriver"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
        .textFieldStyle(.plain)
    }

    private func submit() {
        guard canSubmit else { return }
        focusedField = nil
        Task {
            await authStore.signIn(email: email, password: password)
        }
    }
}
