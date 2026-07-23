# Gweilo iOS

This SwiftUI slice has live Supabase email/password authentication plus
read-only Home, Sessions, and Rankings screens backed by the same Supabase
project as the web app. Score entry remains a local prototype until it is
connected to the atomic round-submission backend.

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
- Live active-session and latest-session summaries
- Live session history and completed match counts
- Live session details with players, rounds, pairings, scores, and resting players
- Live singles, doubles-player, and doubles-team rankings
- Pull-to-refresh, loading, empty, and network-error states
- Adaptive light and dark appearances
- Native Liquid Glass on supported iOS versions
- Prototype six-player Round 5 score entry with haptics
- Accessibility labels and adjustable score controls
- Unit tests for score-state behavior
