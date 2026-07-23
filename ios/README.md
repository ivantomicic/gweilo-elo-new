# Gweilo iOS

This first SwiftUI slice is intentionally powered by demo data. It exists to
verify the native design direction, Xcode signing, simulator/device builds, and
the score-entry interaction before Supabase authentication and live APIs are
connected.

## Open the project

```bash
cd ios
xcodegen generate
open Gweilo.xcodeproj
```

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

## Current demo

- Adaptive light and dark appearances
- Native Liquid Glass on supported iOS versions
- Home dashboard with an active-session card
- Product-aligned session history for 3-, 4-, 5-, and 6-player examples
- Singles, doubles-player, and doubles-team ranking examples
- Six-player Round 5 with one doubles and one singles match
- Complete-round score entry with haptics
- Submission confirmation and success state
- Accessibility labels and adjustable score controls
- Unit tests for score-state behavior
