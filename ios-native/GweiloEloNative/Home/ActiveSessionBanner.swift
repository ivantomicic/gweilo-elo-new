import SwiftUI

struct ActiveSessionBanner: View {
  @StateObject private var viewModel = ActiveSessionViewModel()

  var body: some View {
    Group {
      if viewModel.isLoading {
        BannerCardPlaceholder()
      } else if let session = viewModel.session {
        BannerCard(session: session)
      } else if let error = viewModel.errorMessage {
        BannerError(message: error)
      } else {
        BannerError(message: "No active session")
      }
    }
    .task {
      await viewModel.load()
    }
  }
}

private struct BannerCard: View {
  let session: ActiveSession

  var body: some View {
    HStack(spacing: 12) {
      Circle()
        .fill(Color.green)
        .frame(width: 8, height: 8)
        .overlay(
          Circle()
            .stroke(Color.green.opacity(0.4), lineWidth: 6)
            .opacity(0.6)
        )

      VStack(alignment: .leading, spacing: 4) {
        Text("Active session")
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        Text("\(session.player_count) players • started \(session.created_at.relativeTimeString())")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }

      Spacer()

      NavigationLink {
        SessionDetailView(sessionId: session.id)
      } label: {
        HStack(spacing: 6) {
          Text("Continue")
            .font(.subheadline.weight(.semibold))
          Image(systemName: "arrow.right")
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(AppColors.primary)
        .clipShape(Capsule())
      }
      .buttonStyle(.plain)
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct BannerCardPlaceholder: View {
  var body: some View {
    HStack(spacing: 12) {
      Circle()
        .fill(Color.gray.opacity(0.3))
        .frame(width: 8, height: 8)
      VStack(alignment: .leading, spacing: 4) {
        Text("Active session")
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white.opacity(0.6))
        Text("Loading…")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }
      Spacer()
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .redacted(reason: .placeholder)
  }
}

private struct BannerError: View {
  let message: String

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(.orange)
      Text(message)
        .font(.caption)
        .foregroundStyle(AppColors.muted)
      Spacer()
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

@MainActor
final class ActiveSessionViewModel: ObservableObject {
  @Published var session: ActiveSession?
  @Published var isLoading = false
  @Published var errorMessage: String?

  func load() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }

    do {
      let session = try await fetchActiveSession()
      self.session = session
      if #available(iOS 16.1, *) {
        await SessionLiveActivityManager.shared.sync(with: session)
      }
    } catch {
      self.session = nil
      errorMessage = error.localizedDescription
    }
  }

  private func fetchActiveSession() async throws -> ActiveSession? {
    let supabase = SupabaseService.shared.client
    let session = try await supabase.auth.refreshSession()

    let url = SupabaseService.shared.apiBaseURL?.appendingPathComponent("api/sessions/active")
    guard let url else { throw ActiveSessionError.missingApiBase }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue(session.accessToken, forHTTPHeaderField: "X-Supabase-Token")

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw ActiveSessionError.badResponse
    }
    if httpResponse.statusCode >= 300 {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw ActiveSessionError.serverError(status: httpResponse.statusCode, body: body)
    }

    let decoded = try JSONDecoder().decode(ActiveSessionResponse.self, from: data)
    return decoded.session
  }
}

enum ActiveSessionError: LocalizedError {
  case missingApiBase
  case badResponse
  case serverError(status: Int, body: String)

  var errorDescription: String? {
    switch self {
    case .missingApiBase:
      return "Missing API base URL"
    case .badResponse:
      return "Invalid response"
    case .serverError(let status, let body):
      let message = body.isEmpty ? "Failed to load active session" : body
      return "Active session error (\(status)). \(message)"
    }
  }
}

struct ActiveSession: Decodable, Identifiable {
  let id: UUID
  let player_count: Int
  let created_at: String

  var startedAtDate: Date {
    ISO8601DateFormatter().date(from: created_at) ?? Date()
  }
}

private struct ActiveSessionResponse: Decodable {
  let session: ActiveSession?
}

private extension String {
  func relativeTimeString() -> String {
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: self) else { return "just now" }
    let relative = RelativeDateTimeFormatter()
    relative.unitsStyle = .short
    return relative.localizedString(for: date, relativeTo: Date())
  }
}
