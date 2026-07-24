import Foundation

struct AppConfiguration: Sendable {
    let supabaseURL: URL
    let supabaseAnonKey: String
    let apiBaseURL: URL

    static func load(from bundle: Bundle = .main) -> AppConfiguration? {
        guard
            let rawURL = bundle.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: rawURL),
            let anonKey = bundle.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            !anonKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let rawAPIURL = bundle.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
            let apiBaseURL = URL(string: rawAPIURL)
        else {
            return nil
        }

        return AppConfiguration(
            supabaseURL: url,
            supabaseAnonKey: anonKey,
            apiBaseURL: apiBaseURL
        )
    }
}
