# Gweilo iOS

This is the native SwiftUI companion to the Gweilo web app. It uses the same
Supabase project for authentication and live data, and the same production
Next.js backend for protected round submission and Elo updates.

## Open the project

```bash
cd ios
./scripts/sync-supabase-config.sh
xcodegen generate
open Gweilo.xcodeproj
```

The sync script copies only the public Supabase URL and anonymous client key
from the web app's `.env.local` into an ignored local Xcode configuration. It
never copies the service-role key.

## Install on an iPhone

1. Connect the iPhone to the Mac with USB, or enable wireless device connection
   in Xcode.
2. Open `Gweilo.xcodeproj`.
3. Select the **Gweilo** project, then the **Gweilo** app target.
4. Open **Signing & Capabilities**.
5. Choose your Apple Development team.
6. If Xcode reports that the bundle identifier is unavailable, change
   `com.ivantomicic.gweilo` to a unique identifier.
7. Select your iPhone in the run-destination picker.
8. Press **Run**.

With a free Apple account, device builds may expire after seven days. A paid
Apple Developer account is required for TestFlight and App Store distribution.

## Current build

- Live sign-in with the same Supabase email/password account as the web app
- Secure Keychain login persistence, token refresh, and visible sign-out
- Live active-session and latest-session summaries
- Live session history and completed match counts
- Live session details with players, rounds, pairings, scores, and resting players
- Native immediate session creation with unordered player selection, randomized
  server-generated schedule review, and one-tap reshuffling
- Club-wide active-session protection, idempotent creation retries, and
  cancel/force-close controls for moderators and admins
- Automatic navigation into a newly created live session
- Native leaderboard eligibility rules
- Persisted score-entry haptics and round-confirmation settings
- Server-eligible singles Top 3 podium with player-profile navigation
- Live singles, doubles-player, and doubles-team rankings
- Native singles player profiles with live Elo charts and recent opponents
- Smooth, pinch-zoomable green/amber/red Elo charts with result and score details
- Singles head-to-head comparisons against the signed-in player
- Native doubles-team profiles with record, sets, Elo chart, and recent opponents
- Pull-to-refresh, loading, empty, and network-error states
- Deliberately dark-only purple, acid-green, and near-black appearance
- Native Liquid Glass on supported iOS versions
- Live score entry for every match in the active round
- Confirmed whole-round submission to `https://www.gweilo.lol`
- Server-owned atomic Elo updates and duplicate-submission protection
- Submission progress, haptics, clear failures, and post-submit refresh
- Accessibility labels and adjustable/numeric score controls
- Unit and database concurrency tests for score drafts, request shape,
  authentication expiry, atomic creation, and duplicate protection

The app bundle contains only Supabase's public URL/key and the public production
API address. The Supabase service-role key and other private web credentials are
never copied into the iOS configuration.

## Current boundary

Sessions can be created, resumed, and fully scored natively. The Next.js
backend owns schedule generation and Elo rules, while Supabase remains the
shared source of truth for both the web and iOS apps.
