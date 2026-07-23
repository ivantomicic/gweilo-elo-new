# Gweilo iOS App Roadmap

Last updated: 2026-07-23

This is the shared reference point for the Gweilo iOS app. Update it whenever
scope, architecture, progress, or external setup requirements change.

## Status legend

- ✅ Done
- 🚧 In progress
- ⬜ Planned
- ⏸️ Intentionally deferred
- 🔌 Requires an external account or credential

## Current status

The web application and Supabase database already contain the product rules and
data. The iOS app has not been created yet.

The safe round-submission foundation is implemented and tested:

- ✅ Existing Elo calculation rules audited and covered by tests
- ✅ Dynamic K-factors retained
- ✅ Atomic score, rating, history, and snapshot database transaction
- ✅ Duplicate and concurrent round-submission protection
- ✅ Five-player deferred and combined-score Elo handling
- ✅ PostgreSQL commit and forced-rollback integration tests
- ✅ Supabase migrations applied and verified on the linked project
- ✅ Next.js round-submission implementation completed locally
- ⬜ Perform one real-round web smoke test
- ⬜ Commit and deploy the updated Next.js backend

## Agreed architecture

- The iOS app will be written in SwiftUI.
- The web app and iOS app will use the same Supabase project.
- The Next.js backend calculates Elo.
- Supabase validates and commits each complete round as one transaction.
- The iOS app sends scores to the same backend endpoint as the web app.
- Elo calculations will not be duplicated in Swift.
- The iOS app will never contain the Supabase service-role key.
- The iOS app may contain the Supabase public URL and anonymous key.
- The existing web application remains available alongside the native app.

## First release: core app

The first release should be capable of running an entire table-tennis session
from an iPhone.

### Foundation

- ⬜ Create the Xcode project and SwiftUI app target
- ⬜ Choose the minimum supported iOS version
- ⬜ Add environment configuration for development and production
- ⬜ Add the Supabase Swift client
- ⬜ Create API, authentication, and session services
- ⬜ Add shared request/response models
- ⬜ Add secure authentication-session storage
- ⬜ Add loading, empty, retry, and error states
- ⬜ Add unit tests for services and important models
- ⬜ Confirm clean simulator build

### Authentication

- ⬜ Restore an existing Supabase login session
- ⬜ Sign in and sign out
- ⬜ Handle expired sessions and refresh tokens
- ⬜ Prepare Google sign-in
- ⬜ Handle authentication callbacks and deep links

### Home

- ⬜ Active-session card
- ⬜ Current ranking summary
- ⬜ Recent sessions or results
- ⬜ Quick action to start or resume a session

### Sessions

- ⬜ Sessions list
- ⬜ Session detail and status
- ⬜ Start a new session
- ⬜ Select players
- ⬜ Review generated schedule
- ⬜ Display singles and doubles matches
- ⬜ Enter and validate scores
- ⬜ Submit a complete round through the shared backend
- ⬜ Prevent accidental double submission in the UI
- ⬜ Display submission progress and recoverable failures
- ⬜ Support five-player session behavior
- ⬜ Support six-player dynamic scheduling behavior
- ⬜ Display completed-session summary

### Rankings and profiles

- ⬜ Singles leaderboard
- ⬜ Individual doubles leaderboard
- ⬜ Doubles-team leaderboard
- ⬜ Player profile
- ⬜ Player Elo history
- ⬜ Player head-to-head results
- ⬜ Team profile and history
- ⬜ Top-three statistics
- ⬜ Rivalries

### General

- ⬜ Rules
- ⬜ Basic settings
- ⬜ Account and logout
- ⬜ Dynamic Type support
- ⬜ VoiceOver labels for scores and controls
- ⬜ Light and dark appearance verification

## Later phases

These features are useful, but they should not delay the reliable session and
score-entry flow.

### Session administration

- ⏸️ Edit historical match results
- ⏸️ Recalculate Elo after an edit
- ⏸️ Force-close sessions
- ⏸️ Delete sessions
- ⏸️ Import sessions from JSON

### Community and content

- ⏸️ Poll list and poll voting
- ⏸️ Poll creation and token-based answering
- ⏸️ No-show tracking
- ⏸️ Missions
- ⏸️ Video library
- ⏸️ Video upload and processing status
- ⏸️ Push notifications

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
- ⏸️ Apple Watch app
- ⏸️ iPad-specific layouts

## External connections

No private credentials should be committed to this repository.

### Required for development

- 🔌 Apple Developer team
- 🔌 Final app name and bundle identifier
- 🔌 Supabase project URL
- 🔌 Supabase public anonymous key
- 🔌 Deployed Next.js API base URL

### Required for Google sign-in

- 🔌 Google Cloud iOS OAuth client ID
- 🔌 Registered iOS bundle identifier
- 🔌 Reversed client-ID URL scheme
- 🔌 Google provider enabled and configured in Supabase Auth
- 🔌 Allowed redirect/callback URLs

### Required only when those features are added

- 🔌 Sign in with Apple capability and configuration
- 🔌 APNs key or certificate for push notifications
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

- ⬜ A user can authenticate
- ⬜ A user can create or resume a session
- ⬜ A user can enter and submit every round
- ⬜ Duplicate taps or concurrent clients cannot apply Elo twice
- ⬜ Rankings and session summaries reflect submitted results
- ⬜ Authentication and network failures have clear recovery paths
- ⬜ Unit tests pass
- ⬜ The app builds without warnings that affect correctness
- ⬜ A real session has been completed using the iOS app
- ⬜ No private backend credentials are present in the app bundle
- ⬜ The build is uploaded to TestFlight

## Next actions

1. Run the real-round smoke test through the web app.
2. Commit and deploy the completed atomic backend changes.
3. Confirm the app name, bundle identifier, and minimum iOS version.
4. Create the SwiftUI project and implement authentication.
5. Implement the session list, session detail, and round-submission flow.
6. Add rankings and player/team profiles.
7. Configure Google OAuth and prepare the first TestFlight build.

## Change log

- 2026-07-23: Created the roadmap and recorded the initial scope, architecture,
  backend status, external integrations, and first-release definition of done.
