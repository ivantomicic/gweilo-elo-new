import Foundation
import Supabase

final class SupabaseService {
  static let shared = SupabaseService()
  let client: SupabaseClient
  let apiBaseURL: URL?

  private init() {
    let config = SupabaseConfigLoader.load()
    client = SupabaseClient(supabaseURL: config.url, supabaseKey: config.key)
    apiBaseURL = config.apiBaseURL
  }
}

private enum SupabaseConfigLoader {
  static func load() -> (url: URL, key: String, apiBaseURL: URL?) {
    guard let url = Bundle.main.url(forResource: "SupabaseConfig", withExtension: "plist") else {
      fatalError("Missing SupabaseConfig.plist in app bundle.")
    }

    guard let data = try? Data(contentsOf: url),
          let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
          let urlString = plist["SUPABASE_URL"] as? String,
          let key = plist["SUPABASE_ANON_KEY"] as? String,
          let supabaseURL = URL(string: urlString) else {
      fatalError("Invalid SupabaseConfig.plist values.")
    }

    let apiBaseURLString = plist["API_BASE_URL"] as? String
    let apiBaseURL = apiBaseURLString.flatMap(URL.init(string:))

    return (supabaseURL, key, apiBaseURL)
  }
}
