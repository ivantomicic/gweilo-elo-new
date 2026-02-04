import Foundation
import Supabase

enum APIClient {
  static func request(path: String, queryItems: [URLQueryItem] = []) async throws -> (URLRequest, TokenDebug) {
    guard let baseURL = SupabaseService.shared.apiBaseURL else {
      throw APIError.missingBaseURL
    }

    let supabase = SupabaseService.shared.client
    let session = try await refreshOrLoadSession(from: supabase)

    var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
    if !queryItems.isEmpty {
      components?.queryItems = queryItems
    }
    guard let url = components?.url else {
      throw APIError.badURL
    }

    var request = URLRequest(url: url)
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let debug = TokenDebug(from: session)
    return (request, debug)
  }

  static func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem] = []) async throws -> T {
    let (baseRequest, debug) = try await request(path: path, queryItems: queryItems)
    var request = baseRequest
    request.httpMethod = "GET"

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIError.badResponse
    }
    if httpResponse.statusCode >= 300 {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw APIError.serverError(
        status: httpResponse.statusCode,
        url: request.url,
        body: body,
        debug: debug
      )
    }
    return try JSONDecoder.api.decode(T.self, from: data)
  }
}

enum APIError: LocalizedError {
  case missingBaseURL
  case notAuthenticated
  case badURL
  case badResponse
  case serverError(status: Int, url: URL?, body: String, debug: TokenDebug)

  var errorDescription: String? {
    switch self {
    case .missingBaseURL:
      return "Missing API_BASE_URL in SupabaseConfig.plist"
    case .notAuthenticated:
      return "Not authenticated"
    case .badURL:
      return "Invalid API URL"
    case .badResponse:
      return "Invalid response"
    case .serverError(let status, let url, let body, let debug):
      let urlString = url?.absoluteString ?? "unknown"
      let bodyPreview = body.isEmpty ? "empty body" : body
      return """
      Request failed (\(status))
      \(urlString)
      userId=\(debug.userId ?? "unknown")
      tokenLength=\(debug.tokenLength)
      exp=\(debug.expString)
      iss=\(debug.iss ?? "unknown")
      aud=\(debug.aud ?? "unknown")
      \(bodyPreview)
      """
    }
  }
}

struct TokenDebug {
  let userId: String?
  let tokenLength: Int
  let exp: Date?
  let iss: String?
  let aud: String?

  var expString: String {
    guard let exp else { return "unknown" }
    return ISO8601DateFormatter().string(from: exp)
  }

  init(from session: Session) {
    self.userId = session.user.id.uuidString
    self.tokenLength = session.accessToken.count
    let payload = decodeJWT(session.accessToken)
    if let exp = payload?["exp"] as? Double {
      self.exp = Date(timeIntervalSince1970: exp)
    } else {
      self.exp = nil
    }
    self.iss = payload?["iss"] as? String
    self.aud = payload?["aud"] as? String
  }
}

private func refreshOrLoadSession(from supabase: SupabaseClient) async throws -> Session {
  // Try refresh first to avoid stale tokens
  do {
    return try await supabase.auth.refreshSession()
  } catch {
    return try await supabase.auth.session
  }
}

private func decodeJWT(_ token: String) -> [String: Any]? {
  let parts = token.split(separator: ".")
  guard parts.count >= 2 else { return nil }

  let payloadPart = String(parts[1])
  let padded = payloadPart
    .replacingOccurrences(of: "-", with: "+")
    .replacingOccurrences(of: "_", with: "/")
    .padding(toLength: ((payloadPart.count + 3) / 4) * 4, withPad: "=", startingAt: 0)

  guard let data = Data(base64Encoded: padded) else { return nil }
  guard let json = try? JSONSerialization.jsonObject(with: data, options: []),
        let dict = json as? [String: Any] else {
    return nil
  }
  return dict
}

extension JSONDecoder {
  static let api: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }()
}
