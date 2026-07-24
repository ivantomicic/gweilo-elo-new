# Gweilo Push Notifications

## What is implemented

Notifications are owned by the backend. Web actions and iOS actions use the
same Next.js endpoints, and those endpoints create the same notification
events.

Supported audiences:

- every user with a registered device;
- every participant in a session;
- one or more explicitly selected users.

Supported preference categories:

- sessions;
- rounds;
- results and Elo;
- polls;
- admin announcements.

Every user has a master switch and one switch per category. Missing preference
rows use enabled defaults, which means existing users do not need a backfill.
The explicit “Send test notification” action respects the master switch but
bypasses category switches so it can reliably verify device delivery.

The system stores:

- iOS APNs device registrations;
- user preferences;
- deduplicated notification events;
- one audited APNs delivery per device;
- APNs response IDs, failures, and invalid-token state.

APNs failures never roll back session creation, round submission, poll
creation, or session completion.

## External setup required

### 1. Apply the Supabase migration

Apply:

`supabase/migrations/20260726_create_push_notification_system.sql`

The migration creates the notification preference, device, event, and delivery
tables with Row Level Security.

### 2. Enable Push Notifications for the Apple App ID

In the Apple Developer portal, enable Push Notifications for:

`com.ivantomicic.gweilo`

The Xcode project already contains the `aps-environment` entitlement for Debug
and Release builds. Automatic signing still needs a provisioning profile whose
App ID has Push Notifications enabled.

### 3. Create APNs authentication keys

An Apple Account Holder or Admin should create two topic-specific APNs signing
keys for `com.ivantomicic.gweilo`:

- a Sandbox key for Xcode Debug builds;
- a Production key for TestFlight and App Store builds.

Download both `.p8` files and record each Key ID plus the Apple Developer Team
ID. Apple only allows each private key file to be downloaded once. Do not
commit the `.p8` files or paste them into iOS configuration.

### 4. Add production server variables

Configure these only on the Next.js deployment:

```text
APNS_TEAM_ID=...
APNS_BUNDLE_ID=com.ivantomicic.gweilo
APNS_DEVELOPMENT_KEY_ID=...
APNS_DEVELOPMENT_PRIVATE_KEY_BASE64=...
APNS_PRODUCTION_KEY_ID=...
APNS_PRODUCTION_PRIVATE_KEY_BASE64=...
```

On macOS, convert each private key to a single-line deployment value with:

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n'
```

The backend also accepts environment-specific `APNS_DEVELOPMENT_PRIVATE_KEY`
and `APNS_PRODUCTION_PRIVATE_KEY` values containing PEM text, but base64 is
less error-prone on hosted deployment platforms. Legacy team keys that support
both environments can still use `APNS_KEY_ID` and
`APNS_PRIVATE_KEY_BASE64` as shared fallback values.

### 5. Deploy the Next.js backend and install a fresh iOS build

After deployment:

1. Open Gweilo on a physical iPhone.
2. Sign in.
3. Open More → Settings → Notifications.
4. Enable iOS permission.
5. Use “Send test notification”.

The iOS simulator is useful for UI and simulated notification testing, but the
first end-to-end APNs verification should be performed on a signed physical
iPhone.

## Automatic events

The following backend actions are connected:

| Event | Audience | Preference |
| --- | --- | --- |
| Session started | Session participants | Sessions |
| Session cancelled | Former session participants | Sessions |
| Next round ready | Session participants | Rounds |
| Session completed | Session participants | Results and Elo |
| Poll created | All registered users | Polls |
| Manual admin message | All, current session, or selected users | Announcements |

Notification event deduplication keys prevent an idempotent session or round
request from sending the same event twice.

## Adding another notification

Add a typed helper to `lib/notifications/events.ts`, then call it from the
server-side action after the underlying database change succeeds:

```ts
return dispatchNotificationSafely({
  eventType: "example_event",
  category: "sessions",
  title: "Example",
  body: "Something changed.",
  audience: { type: "session", sessionId },
  data: { sessionId, route: "session" },
  dedupeKey: `example:${sessionId}`,
  createdBy: userId,
});
```

Always call notifications from backend code, not directly from a React or
SwiftUI screen. That preserves identical behavior for web, iOS, and future
automations.
