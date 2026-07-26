# Gweilo Live Activities

Gweilo shows an active session on the Lock Screen and, on supported iPhones,
in the Dynamic Island. The same activity is driven by the shared backend, so
starting a session or saving a round on either the web app or iOS updates the
same Live Activity.

## What is implemented

- A Widget Extension with Lock Screen, expanded Dynamic Island, compact, and
  minimal presentations.
- Remote push-to-start registration for every signed-in iPhone.
- A per-activity update token registry.
- Server-side APNs start, update, and end delivery.
- Automatic lifecycle hooks:
  - session created: start;
  - round saved: update;
  - session completed or force-closed: end;
  - session cancelled: end and dismiss.
- A local iOS fallback that starts or refreshes the activity when a session
  detail screen is opened.
- A per-user `Live Activities` preference.
- Delivery audit rows for diagnosing APNs failures.

## One-time setup

### 1. Apply the Supabase migration

Run this migration against the production project before deploying the web
backend:

`supabase/migrations/20260726_create_live_activity_system.sql`

Using the CLI:

```sh
supabase db push
```

Alternatively, paste the complete migration into the Supabase SQL Editor and
run it there.

### 2. Deploy the web backend

Deploy the current Next.js code after the migration. The existing APNs
credentials are reused; no second `.p8` file is required specifically for
Live Activities.

The production environment must still contain:

```text
APNS_TEAM_ID
APNS_BUNDLE_ID=com.ivantomicic.gweilo
APNS_PRODUCTION_KEY_ID
APNS_PRODUCTION_PRIVATE_KEY_BASE64
```

The existing sandbox variables are used by Debug builds:

```text
APNS_DEVELOPMENT_KEY_ID
APNS_DEVELOPMENT_PRIVATE_KEY_BASE64
```

### 3. Let Xcode provision the extension

Open `ios/Gweilo.xcodeproj`, select the `GweiloLiveActivity` target, then open
Signing & Capabilities:

- enable `Automatically manage signing`;
- select the paid team `5JKSYD4AUC`;
- keep the bundle identifier
  `com.ivantomicic.gweilo.LiveActivity`.

If Apple has not registered that identifier yet, Xcode creates it and its
provisioning profile. The main `Gweilo` target must keep Push Notifications
enabled.

### 4. Install and prime the app

Use a physical iPhone running iOS 18 or newer:

1. Build and install the new app.
2. Open it and sign in once.
3. Keep notifications enabled.
4. In iOS Settings, open **Apps → Gweilo → Live Activities** and enable it.
5. In Gweilo notification settings, leave **Live Activities** enabled.

Opening the app once is essential: the phone generates a push-to-start token
and uploads it to the backend.

## End-to-end test

1. Lock the iPhone or leave Gweilo in the background.
2. Start a **new** session on production, from either web or iOS, and include
   the signed-in player.
3. The activity should appear on the Lock Screen and Dynamic Island.
4. Save a round from the web app. The round, matches, latest result, and
   progress should update without opening iOS.
5. Finish the final round. The activity shows its final state and is dismissed
   after the configured grace period.

An activity that was already active before the migration and new app build
does not have a remote start event. Open that session in iOS to activate the
local fallback, or create a fresh test session.

## Diagnostics

Check whether the phone registered its tokens:

```sql
select user_id, token_type, session_id, environment, enabled, last_seen_at
from public.live_activity_tokens
order by last_seen_at desc;
```

Check APNs delivery:

```sql
select event, status, apns_status, failure_reason, created_at
from public.live_activity_deliveries
order by created_at desc
limit 50;
```

Typical results:

- no token rows: open the newly built iOS app, sign in, and check the Live
  Activities system setting;
- `BadDeviceToken`: Debug/Production environment mismatch;
- `DeviceTokenNotForTopic`: confirm `APNS_BUNDLE_ID` is
  `com.ivantomicic.gweilo`;
- delivery is `sent`, but nothing appears: confirm the user is a player in
  that session and Live Activities are allowed in iOS Settings.
