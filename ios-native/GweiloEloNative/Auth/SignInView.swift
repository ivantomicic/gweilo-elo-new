import SwiftUI

struct SignInView: View {
  @ObservedObject var auth: AuthViewModel
  @State private var email = ""
  @State private var password = ""
  @State private var isSignUp = false

  var body: some View {
    ZStack {
      AppColors.background.ignoresSafeArea()

      ScrollView {
        VStack(spacing: 24) {
          Spacer(minLength: 24)

          ZStack {
            Circle()
              .fill(AppColors.glow.opacity(0.25))
              .blur(radius: 40)
              .frame(width: 220, height: 220)

            Image("Logo")
              .resizable()
              .scaledToFit()
              .frame(maxWidth: 240)
              .shadow(color: AppColors.glow.opacity(0.35), radius: 18, x: 0, y: 0)
          }
          .padding(.top, 8)

          VStack(spacing: 12) {
            Text("Welcome to GweiloElo")
              .font(.title2.weight(.bold))
              .foregroundStyle(.white)

            Text("Track sessions, polls, and rankings in one place.")
              .font(.subheadline)
              .foregroundStyle(AppColors.muted)
              .multilineTextAlignment(.center)
          }
          .padding(.horizontal, 24)

          VStack(spacing: 14) {
            TextField("Email", text: $email)
              .textInputAutocapitalization(.never)
              .keyboardType(.emailAddress)
              .autocorrectionDisabled()
              .authField()

            SecureField("Password", text: $password)
              .authField()
          }
          .padding(.horizontal, 24)

          Picker("Mode", selection: $isSignUp) {
            Text("Sign In").tag(false)
            Text("Sign Up").tag(true)
          }
          .pickerStyle(.segmented)
          .padding(.horizontal, 24)

          Button(isSignUp ? "Create Account" : "Sign In") {
            Task {
              if isSignUp {
                await auth.signUp(email: email, password: password)
              } else {
                await auth.signIn(email: email, password: password)
              }
            }
          }
          .frame(maxWidth: .infinity, minHeight: 52)
          .background(AppColors.primary)
          .foregroundStyle(Color.white)
          .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
          .shadow(color: AppColors.primary.opacity(0.35), radius: 16, x: 0, y: 8)
          .padding(.horizontal, 24)
          .disabled(email.isEmpty || password.isEmpty)

          if let errorMessage = auth.errorMessage {
            Text(errorMessage)
              .foregroundStyle(Color.red)
              .font(.footnote)
              .padding(.horizontal, 24)
          }

          Spacer(minLength: 16)
        }
      }
    }
  }
}
