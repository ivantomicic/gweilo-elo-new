# Activity Tracking Implementation Guide

Follow these steps in order.

---

## STEP 1: PostHog Cloud Setup

### 1.1 Create PostHog Account

1. Go to https://posthog.com/signup
2. Sign up with email (or GitHub)
3. **IMPORTANT**: Choose **EU region** when asked (for GDPR compliance)
4. Confirm email

### 1.2 Get API Keys

1. After login, go to **Settings** → **Project** → **Project Variables**
2. Copy your **Project API Key** (starts with `phc_...`)
3. Copy your **Host URL**:
   - If EU region: `https://eu.posthog.com`
   - If US region: `https://app.posthog.com`

### 1.3 Configure Privacy Settings

1. Go to **Settings** → **Project** → **Data Capture**
2. **Disable**:
   - ✅ "Record user sessions" (session replay)
   - ✅ "Capture IP address" (set to "Do not capture IP")
3. **Save**

---

## STEP 2: Environment Variables

Add these to your `.env.local` file:

```bash
# PostHog Analytics
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_key_here
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com

# Supabase (should already exist)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Replace**:
- `phc_your_project_key_here` → Your PostHog Project API Key
- `https://eu.posthog.com` → Your PostHog Host URL (EU region)

---

## STEP 3: Install Dependencies

Run:

```bash
npm install posthog-js posthog-node
```

---

## STEP 4: Create Database Migration

Run this SQL in Supabase SQL Editor:

```sql
-- Create analytics_events table for backup/GDPR compliance
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);

-- RLS: Users can only read their own events (optional, for user privacy)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own events"
  ON analytics_events
  FOR SELECT
  USING (auth.uid() = user_id);
```

**Why each column:**
- `id`: Primary key (UUID)
- `user_id`: Links to auth.users (ON DELETE SET NULL = anonymize on user deletion for GDPR)
- `event_name`: Event type (e.g., 'session_started', 'page_viewed')
- `properties`: JSON metadata (session_id, page, etc.)
- `created_at`: Timestamp (indexed for time-based queries)

---

## STEP 5: Run Implementation Scripts

The implementation files are already created. Now:

1. **Install dependencies** (see Step 3)
2. **Add environment variables** (see Step 2)
3. **Run database migration** (see Step 4)
4. **Restart dev server**: `npm run dev`

---

## STEP 6: Verification Checklist

After implementation, verify:

### ✅ PostHog Setup
- [ ] Events appear in PostHog dashboard: **Activity** → **Live Events**
- [ ] Test event: Navigate to a page, should see `page_viewed` event

### ✅ Backend Tracking
- [ ] Create a session → Check PostHog for `session_started` event
- [ ] Check Supabase `analytics_events` table → Should see same event
- [ ] API route still works if PostHog fails (tracking doesn't block request)

### ✅ User Identification
- [ ] Log in → PostHog should merge anonymous + authenticated events
- [ ] Check PostHog **Persons** → Should see your user ID (UUID, not email)

### ✅ Privacy Settings
- [ ] PostHog Settings → Data Capture → IP capture disabled
- [ ] PostHog Settings → Data Capture → Session replay disabled
- [ ] Events in PostHog → Properties should NOT contain email addresses

### ✅ GDPR Compliance
- [ ] Supabase `analytics_events.user_id` → ON DELETE SET NULL (anonymizes on user deletion)
- [ ] Test: Delete a test user → `analytics_events.user_id` becomes NULL

---

## STEP 7: Testing Events

### Test Frontend Events

1. **Page view**: Navigate to `/dashboard` → Should see `page_viewed` in PostHog
2. **Player profile**: Navigate to `/player/[id]` → Should see `player_profile_viewed`
3. **Session view**: Navigate to `/session/[id]` → Should see `session_viewed`

### Test Backend Events

1. **Start session**: Create a new session → Should see `session_started` in PostHog + Supabase
2. **Complete session**: Submit final round → Should see `session_completed` in PostHog + Supabase

### Test Admin Events

1. **Force close**: Force close a session (if admin) → Should see `admin_session_force_closed`

---

## Troubleshooting

### Events not appearing in PostHog?

1. Check browser console for errors
2. Verify `NEXT_PUBLIC_POSTHOG_KEY` is set correctly
3. Check PostHog dashboard → Activity → Live Events (wait ~10 seconds)

### Events not writing to Supabase?

1. Check Supabase logs for errors
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set (for admin client)
3. Check `analytics_events` table permissions (RLS)

### Tracking breaks API routes?

1. Tracking is fire-and-forget (wrapped in try-catch)
2. Check API route logs → Should see errors logged, not thrown
3. API response should succeed even if tracking fails

---

**Next**: The implementation files are already created. Follow Steps 1-4 above, then restart your dev server.
