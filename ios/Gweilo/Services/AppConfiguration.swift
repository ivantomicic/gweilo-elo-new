import Foundation

struct AppConfiguration: Sendable {
    let supabaseURL: URL
    let supabaseAnonKey: String

    static func load(from bundle: Bundle = .main) -> AppConfiguration? {
        guard
            let rawURL = bundle.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: rawURL),
            let anonKey = bundle.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            !anonKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return nil
        }

        return AppConfiguration(
            supabaseURL: url,
            supabaseAnonKey: anonKey
        )
    }
}
