# GweiloEloNative (SwiftUI)

This folder contains a starter native SwiftUI app that uses Supabase for auth and data access.

## Quick Start

1. Create a local Supabase config file:
   - Copy `GweiloEloNative/SupabaseConfig.plist.example` to `GweiloEloNative/SupabaseConfig.plist`.
   - Fill in your Supabase URL and anon key.
   - Optional: set `API_BASE_URL` if you want to start sessions from the native app.

2. Generate the Xcode project (recommended):
   - Install XcodeGen if needed.
   - Run `xcodegen` from `ios-native/`.

3. Open the project in Xcode and run on a simulator or device.

## Notes

- This is a baseline SwiftUI shell with email/password auth and a placeholder home screen.
- Supabase schema integration can be added next (polls, sessions, stats, etc.).
