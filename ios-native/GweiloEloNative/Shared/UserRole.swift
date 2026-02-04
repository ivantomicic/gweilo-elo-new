import Foundation
import Supabase

enum UserRole: String {
  case admin
  case mod
  case user
}

enum RoleService {
  static func currentRole() -> UserRole {
    let supabase = SupabaseService.shared.client
    guard let token = supabase.auth.currentSession?.accessToken else { return .user }

    guard let payload = decodeJWT(token) else { return .user }

    let roleValue =
      (payload["user_metadata"] as? [String: Any])?["role"] as? String ??
      (payload["app_metadata"] as? [String: Any])?["role"] as? String

    guard let roleValue else { return .user }

    if roleValue == "admin" { return .admin }
    if roleValue == "mod" { return .mod }
    return .user
  }

  static func isAdmin() -> Bool {
    currentRole() == .admin
  }

  static func isModOrAdmin() -> Bool {
    let role = currentRole()
    return role == .admin || role == .mod
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
