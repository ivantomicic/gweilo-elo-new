# Gweilo iOS App Roadmap

Last updated: 2026-07-24

This is the shared reference point for the Gweilo iOS app. Update it whenever
scope, architecture, progress, or external setup requirements change.

## Status legend

- ✅ Done
- 🚧 In progress
- ⬜ Planned
- ⏸️ Intentionally deferred
- 🔌 Requires an external account or credential

## Current status

The web application and Supabase database contain the product rules and data.
The native SwiftUI app exists in `ios/`, builds for both simulator and physical
iPhone SDKs, securely restores and refreshes Supabase logins, and reads live
Home, Sessions, Rankings, and session-detail data. An active round can now be
scored and submitted from iOS through the production atomic backend at
`www.gweilo.lol`. New sessions can also be configured, previewed, and created
natively. Session scheduling and Elo both remain server-owned and are never
calculated on-device.

The safe round-submission foundation is implemented and tested:

- ✅ Existing Elo calculation rules audited and covered by tests
- ✅ Dynamic K-factors retained
- ✅ Atomic score, rating, history, and snapshot database transaction
- ✅ Duplicate and concurrent round-submission protection
- ✅ Five-player deferred and combined-score Elo handling
- ✅ PostgreSQL commit and forced-rollback integration tests
- ✅ Supabase migrations applied and verified on the linked project
- ✅ Next.js round-submission implementation completed
- ✅ Updated Next.js backend committed and deployed
- ⬜ Perform one real-round iOS smoke test

## Agreed architecture

- The iOS app will be written in SwiftUI.
- The web app and iOS app will use the same Supabase project.
- The Next.js backend calculates Elo.
- Supabase validates and commits each complete round as one transaction.
- The iOS app sends scores to the same backend endpoint as the web app.
- The web app and iOS app use the same server-side schedule generator.
- Elo calculations will not be duplicated in Swift.
- Session schedule rules will not be duplicated in Swift.
- The iOS app will never contain the Supabase service-role key.
- The iOS app may contain the Supabase public URL and anonymous key.
- The existing web application remains available alongside the native app.

## Agreed design direction

- Target the current iOS 27 visual language using native SwiftUI APIs.
- Use Liquid Glass for navigation, controls, floating actions, and other
  functional layers where it improves hierarchy and interaction.
- Do not apply glass indiscriminately to every content surface.
- Use a deliberately dark-only appearance. Light mode is not part of the
  current product direction.
- Build the identity around a pitch-black canvas, electric violet brand
  accents, acid green live/winning/ready states, coral loss/error states, and
  bone-white primary type.
- Use a condensed, editorial sports type hierarchy for major headings and
  scores, while keeping body text native and highly legible.
- Use the code-native phantom mark as a recurring club character without
  turning every screen into mascot artwork.
- Treat the web app as the functional reference, not the visual ceiling.
- Preserve useful Gweilo brand identity while creating a stronger, original
  native design system for iOS.
- Prioritize large scores, clear player/team recognition, one-handed score
  entry, accessibility, and fast interaction during live sessions.
- Use subtle haptics and purposeful motion; avoid decorative animation that
  slows down repeated actions.
- Validate important screens on real devices in both appearances.
- Use a precision-sports visual system: content sits directly on the canvas,
  rows are separated by hairlines, one feature per screen receives strong
  visual emphasis, and glass is reserved for navigation and controls.
- Avoid excessive cards, capsules, gradients, and large corner radii.

## First release: core app

The first release should be capable of running an entire table-tennis session
from an iPhone.

### Foundation

- ✅ Create the Xcode project and SwiftUI app target
- ✅ Choose the minimum supported iOS version (iOS 18)
- ✅ Add environment configuration for development and production
- ✅ Add a native Supabase authentication and REST data client
- ✅ Create API, authentication, and session services
- ✅ Add shared request/response models for live read-only data
- ✅ Add secure authentication-session storage
- ✅ Add loading, empty, retry, and error states
- ✅ Add unit tests for services and important models
- ✅ Confirm clean simulator and physical-iPhone SDK builds

### Authentication

- ✅ Restore an existing Supabase login session
- ✅ Sign in and sign out
- ✅ Handle expired sessions and refresh tokens
- ⬜ Prepare Google sign-in
- ⬜ Handle authentication callbacks and deep links

### Home

- ✅ Active-session card (live Supabase data)
- ✅ Current ranking summary (live Supabase data)
- ✅ Recent session summary (live Supabase data)
- ✅ Quick action to start or resume a live session

### Sessions

- ✅ Read-only sessions list with live match counts
- ✅ Read-only session detail with participants, rounds, matches, scores, and status
- ✅ Start a new session
- ✅ Select players without assigning an order
- ✅ Start immediately; future-date scheduling is intentionally unsupported
- ✅ Review the server-generated schedule
- ✅ Randomize the schedule again before starting
- ✅ Prevent creation while any club session is active
- ✅ Make creation atomic and idempotent across concurrent web/iOS requests
- ✅ Hide session creation from regular members
- ✅ Cancel an accidental scoreless session
- ✅ Force-close an active session after results have been entered
- ✅ Display singles and doubles matches before creation
- ✅ Enter and validate live scores
- ✅ Submit a complete round through the shared production backend
- ✅ Prevent accidental double submission in the UI
- ✅ Display submission progress and recoverable failures
- ✅ Support five-player deferred/combined-rating behavior through the backend
- ✅ Support six-player dynamic scheduling behavior through the backend
- ✅ Display completed-session result, best form, and toughest result
- 🚧 Push-notification foundation, preferences, and device registration
- 🔌 Production APNs credentials and first physical-device delivery test

### Rankings and profiles

- ✅ Singles leaderboard (live Supabase data)
- ✅ Individual doubles leaderboard (live Supabase data)
- ✅ Doubles-team leaderboard (live Supabase data)
- ✅ Singles player profile
- ✅ Player singles Elo history and recent results
- ✅ Player head-to-head results against the signed-in user
- ✅ Doubles-team profile, record, sets, Elo history, and recent results
- ✅ Server-eligible singles Top 3
- ❌ Rivalries intentionally excluded

### General

- ✅ Native leaderboard eligibility rules
- ✅ Basic settings for score-entry haptics and submission confirmation
- ✅ Account and logout
- 🚧 Dynamic Type support
- ✅ VoiceOver labels for scores and controls
- ✅ Dark appearance verification for core session and scoring screens

## Later phases

These features are useful, but they should not delay the reliable session and
score-entry flow.

### Session administration

- ⏸️ Edit historical match results
- ⏸️ Recalculate Elo after an edit
- ⏸️ Delete sessions
- ⏸️ Import sessions from JSON

### Community and content

- ⏸️ Poll list and poll voting
- ⏸️ Poll creation and token-based answering
- ⏸️ No-show tracking
- ✅ Missions
- ⏸️ Video library
- ⏸️ Video upload and processing status
- 🚧 Push notifications (implementation ready; external APNs setup pending)

### Advanced and administrative

- ⏸️ Advanced Elo calculator
- ⏸️ GPT/AI statistics features
- ⏸️ Admin dashboard
- ⏸️ User management
- ⏸️ Video-processing administration
- ⏸️ Analytics and debug tools

### Platform extensions

- ⏸️ Home-screen widgets
- ⏸️ Live Activities
- ⏸️ iPad-specific layouts

## External connections

No private credentials should be committed to this repository.

### Required for development

- 🔌 Apple Developer team
- 🔌 Final app name and bundle identifier
- 🔌 APNs authentication key for push notifications
- ✅ Supabase project URL configured locally
- ✅ Supabase public anonymous key configured locally
- ✅ Production Next.js API base URL (`https://www.gweilo.lol`)

### Required for Google sign-in

- 🔌 Google Cloud iOS OAuth client ID
- 🔌 Registered iOS bundle identifier
- 🔌 Reversed client-ID URL scheme
- 🔌 Google provider enabled and configured in Supabase Auth
- 🔌 Allowed redirect/callback URLs

### Required only when those features are added

- 🔌 Sign in with Apple capability and configuration
- 🔌 Associated Domains configuration for universal links
- 🔌 App Store Connect app record
- 🔌 App icon, screenshots, description, support URL, and privacy information

## Decisions still to confirm

- ⬜ Final app name
- ⬜ Bundle identifier
- ⬜ Minimum iOS version
- ⬜ Google-only login or additional login methods
- ⬜ Whether Sign in with Apple is required for the first release
- ⬜ Whether the first release includes read-only polls and videos
- ⬜ Whether the first release is internal TestFlight or public App Store

## Definition of done for the first TestFlight build

- ✅ A user can authenticate
- ✅ A user can create or resume a session natively
- ✅ A user can enter and submit every round
- ✅ Duplicate taps or concurrent clients cannot apply Elo twice
- ✅ Rankings and session summaries refresh after submitted results
- ✅ Authentication and network failures have clear recovery paths
- ✅ Unit tests pass
- ✅ The app builds without warnings that affect correctness
- ⬜ A real session has been completed using the iOS app
- ✅ No private backend credentials are present in the app bundle
- ⬜ The build is uploaded to TestFlight

## Next actions

1. Complete one real active round from the iPhone and confirm the web app,
   session history, and rankings show the same committed result.
2. Create one real session from the iPhone and verify its schedule against the
   web app before using it for live play.
3. Choose the Apple Developer team, confirm the final bundle identifier, and
   prepare signing/TestFlight.
4. Configure Google OAuth only if it is required for the first TestFlight.
5. Continue UI polish and add the remaining first-release settings work.

## Change log

- 2026-07-31: Added native rivalry missions. The home screen now loads the
  signed-in player’s current server-generated missions without blocking the
  rest of the dashboard, refreshes them after scoring and pull-to-refresh, and
  presents their live Elo or rivalry metric. Added an administrator screen for
  reviewing every player’s selected missions and manually regenerating the
  shared server snapshots. No new schema or duplicated on-device selection
  logic was required.
- 2026-07-23: Created the roadmap and recorded the initial scope, architecture,
  backend status, external integrations, and first-release definition of done.
- 2026-07-23: Confirmed that the updated Next.js backend was committed,
  deployed, and working.
- 2026-07-23: Created the SwiftUI project in `ios/`, targeting iOS 18. Added
  adaptive styling, native Liquid Glass on iOS 26+, a demo home
  dashboard, interactive doubles score entry, haptics, accessibility support,
  and score-state tests. The physical-iPhone SDK build passes.
- 2026-07-23: Reworked the visual direction after reviewing the first device
  prototype. Replaced the bubbly card system with a flatter precision-sports
  language, redesigned Home and Score Entry, and populated Sessions and
  Rankings with realistic demo content.
- 2026-07-24: Adopted the dark-only Phantom Rally identity: near-black
  surfaces, electric violet branding, acid green live/winning actions,
  condensed sports typography, a code-native phantom mark, and revised
  hierarchy across authentication, Home, Sessions, session detail, score
  entry, Rankings, and player profiles. Corrected the club location to Novi
  Sad and retained Liquid Glass only for native navigation and controls.
- 2026-07-24: Added authenticated singles head-to-head comparisons to player
  profiles and enabled doubles-team ranking navigation to native team profiles
  with member identities, record, sets, Elo history, and recent opponents.
  Reused the same chart and recent-results components across both profile types.
- 2026-07-24: Added fully native session creation. The iOS app now supports
  immediate player-count setup, four-player format selection, unordered live
  player selection, randomized server-generated schedule review,
  duplicate-tap-safe creation, and automatic live-data
  refresh. Extracted the web scheduler into a shared backend module, added an
  authenticated preview endpoint, kept six-player Round 5 fairness server-side,
  and covered every 2–6 player format with tests.
- 2026-07-24: Hardened session setup across web and iOS. Session creation now
  runs as one database transaction, uses idempotency keys, and enforces one
  club-wide active session even when devices submit concurrently. Removed
  future-date scheduling and selection-order team assignment, restricted setup
  to moderators/admins, and added native cancellation for scoreless accidental
  sessions plus force-close after play begins. Added PostgreSQL race, rollback,
  replay, and cancellation integration tests.
- 2026-07-24: Completed the post-creation handoff so Home and Sessions
  automatically open the newly created live session after the creation sheet
  dismisses. Replaced the web-only Rules link with a native leaderboard
  eligibility screen covering singles, doubles-player, doubles-team, inactivity,
  and automatic-return rules.
- 2026-07-24: Added persisted native settings for score-entry haptics and
  round-submission confirmation. Wired both preferences into live scoring while
  preserving server-side duplicate protection.
- 2026-07-24: Replaced the Home ranking excerpt with a native Top 3 podium.
  Eligibility now comes from the authenticated server endpoint, so the iOS app
  applies both the 15-match minimum and 28-day activity rule. Kept each podium
  place linked to the existing reusable player profile.
- 2026-07-24: Fixed player and doubles-team Elo charts and head-to-head loading.
  UUIDs are now canonicalized before API requests and backend comparisons, so
  history rows always use the selected player's or team's Elo rather than the
  opponent's value. Replaced the overshooting Catmull-Rom chart curve with
  monotone interpolation and added request/response regression tests.
- 2026-07-24: Made Elo history interactive. Every line segment now uses the
  shared Forma threshold: green above +5, red below −5, and amber between them.
  Holding and dragging across a chart selects the nearest match and reveals its
  opponent, date, Elo delta, and resulting rating.
- 2026-07-24: Added pinch-to-zoom Elo history. Charts retain native horizontal
  scrolling while zoomed, keep the inspected match in focus during a pinch,
  expose the visible match count and a Show All reset, and preserve match
  scrubbing and accessible interaction guidance.
- 2026-07-24: Smoothed the colored Elo chart with monotone sampled curves that
  cannot visually overshoot recorded ratings. Expanded player and doubles-team
  history responses with perspective-correct scores and win/loss/draw outcomes;
  recent-result rows and chart scrubbing now show the actual result, score, and
  Elo movement instead of presenting only the rating delta.
- 2026-07-24: Added five-minute in-memory caching for player and doubles-team
  profiles, Elo histories, and head-to-head comparisons. Cached content appears
  immediately, stale content remains visible while refreshing, pull-to-refresh
  bypasses the cache, and successful round submissions invalidate it. Improved
  recent-result fallback presentation for older API responses, and added a
  moving rankings underline, selection haptics, and directional page transitions.
- 2026-07-23: Aligned the native prototype with the existing product model.
  Removed the rounded typography and invented league/upcoming-session concepts.
  Sessions now use the real date/status/player/match-count/best-worst fields;
  Rankings use singles, doubles-player, and doubles-team Elo with the real
  eligibility thresholds; score entry now represents a complete six-player
  Round 5 containing one doubles and one singles match submitted atomically.
- 2026-07-23: Added the first live iOS boundary: build-time Supabase
  configuration, native email/password sign-in, real token exchange, and an
  authenticated app root with loading and error handling.
- 2026-07-23: Replaced demo content on Home, Sessions, and Rankings with
  authenticated Supabase REST data. Added live active/latest session summaries,
  session match aggregation, all three ranking modes, pull-to-refresh, and
  loading, empty, and error states. Verified the deployed schema and physical
  iPhone SDK build.
- 2026-07-23: Added live session-detail navigation and a native detail screen
  showing Supabase participants, team assignments, every round, singles and
  doubles pairings, completed scores, pending matches, resting players, and the
  current active round.
- 2026-07-23: Redesigned session detail into a flatter precision-scoreboard
  layout. Added real profile avatars, a focused current-round stage, compact
  player roster, collapsible round history, clearer winners and scores, and
  light/dark simulator visual QA.
- 2026-07-23: Carried the flatter session language back into Home and Sessions.
  Removed the oversized gradient active-session card, added direct navigation
  from live/latest Home summaries, and converted the decorative refresh glyph
  into a real native glass control with loading and accessibility behavior.
- 2026-07-23: Added Keychain-backed login persistence, refresh-token exchange,
  proactive token rotation for long sessions, visible account/logout controls,
  and production API configuration for `www.gweilo.lol`.
- 2026-07-23: Replaced the demo scorecard with live active-round score entry.
  The app now validates an explicit score for every side, confirms the whole
  round, blocks duplicate taps, submits the exact match IDs to the protected
  atomic backend, surfaces recoverable failures, and refreshes sessions and
  rankings after success. Added request-shape and score-draft tests.
- 2026-07-23: Added completed-session form highlights, retry actions throughout
  the live-data screens, a web fallback for new-session creation and rules,
  simulator QA in light/dark appearances, and clean simulator test coverage.
- 2026-07-23: Made eligible singles rankings navigable. Added native player
  profiles with live record totals, an authenticated Swift Charts Elo trend,
  recent opponent/delta rows, retry behavior, request tests, and light/dark
  simulator QA.
