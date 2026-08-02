import AuthenticationServices
import SwiftUI

struct SignInView: View {
    let authStore: AuthStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var email = ""
    @State private var password = ""
    @State private var videoProgress = 0.0
    @State private var googleOAuthPresenter = GoogleOAuthPresenter()
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
    }

    private var canSubmit: Bool {
        email.contains("@") && !password.isEmpty && !authStore.isSigningIn
    }

    private var videoAspectRatio: CGFloat {
        1078.0 / 978.0
    }

    private var videoTopFadeProgress: Double {
        guard videoProgress > 0.3 else { return 0 }
        return min((videoProgress - 0.3) / 0.4, 1)
    }

    private var isEditing: Bool {
        focusedField != nil
    }

    var body: some View {
        GeometryReader { geometry in
            let videoHeight = geometry.size.width / videoAspectRatio
            let contentStart = videoHeight + 10
            let editingOffset = min(0, 56 - contentStart)

            ZStack(alignment: .top) {
                GweiloTheme.background
                    .ignoresSafeArea()

                OneShotBundleVideo(
                    resourceName: "GweiloLoginHero",
                    resourceExtension: "mov",
                    isPlaying: scenePhase == .active && !reduceMotion,
                    playbackRate: 1.50513,
                    onProgress: updateVideoProgress,
                    videoGravity: .resizeAspect
                )
                .frame(
                    width: geometry.size.width,
                    height: videoHeight
                )
                .overlay {
                    LinearGradient(
                        stops: [
                            .init(
                                color: GweiloTheme.background,
                                location: 0
                            ),
                            .init(
                                color: GweiloTheme.background.opacity(0.72),
                                location: 0.08
                            ),
                            .init(color: .clear, location: 0.2),
                            .init(color: .clear, location: 1)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .opacity(
                        reduceMotion ? 1 : videoTopFadeProgress
                    )
                }
                .blur(radius: isEditing ? 7 : 0)
                .opacity(isEditing ? 0.66 : 1)
                .overlay {
                    GweiloTheme.background
                        .opacity(isEditing ? 0.18 : 0)
                }
                .clipped()
                .padding(.top, 10)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .animation(
                    reduceMotion ? nil : .easeInOut(duration: 0.25),
                    value: isEditing
                )

                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea()
                    .allowsHitTesting(isEditing)
                    .onTapGesture(perform: dismissKeyboard)

                VStack(spacing: 30) {
                    header
                    form
                }
                .frame(maxWidth: 440)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity)
                .padding(.top, contentStart)
                .offset(y: isEditing ? editingOffset : 0)
                .animation(
                    reduceMotion
                        ? nil
                        : .spring(response: 0.32, dampingFraction: 0.9),
                    value: isEditing
                )
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .sensoryFeedback(.selection, trigger: focusedField) {
            previousField,
            currentField in
            currentField != nil && previousField != currentField
        }
    }

    private var header: some View {
        Text("Manje priče,\nviše ping-ponga.")
            .font(
                GweiloTheme.displayFont(
                    size: 38,
                    relativeTo: .largeTitle
                )
            )
            .textCase(.uppercase)
            .lineSpacing(-9)
            .minimumScaleFactor(0.9)
            .fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }

    private var form: some View {
        VStack(spacing: 10) {
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }
                .modifier(SignInFieldSurface(isFocused: focusedField == .email))

            SecureField("Lozinka", text: $password)
                .textContentType(.password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit(submit)
                .modifier(SignInFieldSurface(isFocused: focusedField == .password))

            if let errorMessage = authStore.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(GweiloTheme.coral)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("Greška pri prijavi: \(errorMessage)")
            }

            Button(action: submit) {
                HStack(spacing: 10) {
                    if authStore.isSigningIn && !authStore.isSigningInWithGoogle {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(
                        authStore.isSigningIn && !authStore.isSigningInWithGoogle
                            ? "Prijavljivanje…"
                            : "Uloguj se"
                    )
                }
            }
            .buttonStyle(
                GweiloPrimaryButtonStyle(
                    keepsColorWhenDisabled: true,
                    height: 50
                )
            )
            .disabled(!canSubmit)

            HStack(spacing: 12) {
                Rectangle()
                    .fill(GweiloTheme.hairline)
                    .frame(height: 1)
                Text("ILI")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(GweiloTheme.muted)
                Rectangle()
                    .fill(GweiloTheme.hairline)
                    .frame(height: 1)
            }

            Button(action: signInWithGoogle) {
                HStack(spacing: 10) {
                    if authStore.isSigningInWithGoogle {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("G")
                            .font(.headline.weight(.black))
                    }
                    Text(
                        authStore.isSigningInWithGoogle
                            ? "Povezivanje…"
                            : "Koristi Google"
                    )
                }
            }
            .buttonStyle(GoogleSignInButtonStyle())
            .disabled(authStore.isSigningIn || authStore.configuration == nil)

            if authStore.configuration == nil {
                Label(
                    "Dodaj SUPABASE_URL i SUPABASE_ANON_KEY u Build Settings podešavanja targeta.",
                    systemImage: "wrench.and.screwdriver"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
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

    private func signInWithGoogle() {
        guard !authStore.isSigningIn else { return }
        focusedField = nil
        Task {
            await authStore.signInWithGoogle { authorizationURL in
                try await googleOAuthPresenter.authenticate(
                    using: authorizationURL
                )
            }
        }
    }

    private func updateVideoProgress(_ progress: Double) {
        guard abs(progress - videoProgress) >= 0.002 else { return }
        videoProgress = progress
    }

    private func dismissKeyboard() {
        focusedField = nil
    }
}

@MainActor
private final class GoogleOAuthPresenter: NSObject,
    ASWebAuthenticationPresentationContextProviding
{
    private var webAuthenticationSession: ASWebAuthenticationSession?

    func authenticate(using authorizationURL: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: "gweilo"
            ) { [weak self] callbackURL, error in
                Task { @MainActor in
                    self?.webAuthenticationSession = nil

                    if let authenticationError = error as? ASWebAuthenticationSessionError,
                       authenticationError.code == .canceledLogin {
                        continuation.resume(throwing: AuthenticationError.cancelled)
                    } else if let error {
                        continuation.resume(throwing: error)
                    } else if let callbackURL {
                        continuation.resume(returning: callbackURL)
                    } else {
                        continuation.resume(throwing: AuthenticationError.invalidResponse)
                    }
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            webAuthenticationSession = session

            guard session.start() else {
                webAuthenticationSession = nil
                continuation.resume(throwing: AuthenticationError.invalidResponse)
                return
            }
        }
    }

    func presentationAnchor(
        for session: ASWebAuthenticationSession
    ) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
            ?? ASPresentationAnchor()
    }
}

private struct GoogleSignInButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(isEnabled ? Color.white : GweiloTheme.muted)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(GweiloTheme.raisedSurface, in: .capsule)
            .overlay {
                Capsule()
                    .stroke(GweiloTheme.hairline, lineWidth: 1.2)
            }
            .scaleEffect(configuration.isPressed ? 0.965 : 1)
            .opacity(configuration.isPressed ? 0.82 : 1)
            .animation(
                .smooth(duration: 0.12),
                value: configuration.isPressed
            )
            .sensoryFeedback(
                .impact(weight: .light, intensity: 0.65),
                trigger: configuration.isPressed
            ) { wasPressed, isPressed in
                !wasPressed && isPressed
            }
    }
}

private struct SignInFieldSurface: ViewModifier {
    let isFocused: Bool

    func body(content: Content) -> some View {
        content
            .multilineTextAlignment(.center)
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .contentShape(Capsule())
            .background(GweiloTheme.surface, in: .capsule)
            .overlay {
                Capsule()
                    .stroke(
                        isFocused ? GweiloTheme.accent : GweiloTheme.hairline,
                        lineWidth: 1.2
                    )
            }
            .animation(.easeOut(duration: 0.16), value: isFocused)
    }
}
