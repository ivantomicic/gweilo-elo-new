# Activity Tracking Implementation Guide

Complete step-by-step guide for implementing Supabase-only activity tracking.

---

## STEP 1: Run Database Migration

### 1.1 Open Supabase SQL Editor

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**

### 1.2 Run Migration SQL

Copy and paste this SQL:

```sql
-- Create analytics_events table for user activity tracking
-- All tracking data lives in Supabase (no third-party analytics)

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  page TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_event ON analytics_events(user_id, event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at_desc ON analytics_events(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy 1: All authenticated users can insert their own events
CREATE POLICY "Users can insert their own events"
  ON analytics_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);

-- Policy 2: Only admins can read all events
CREATE POLICY "Admins can read all events"
  ON analytics_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::text = 'admin'
    )
  );
```

### 1.3 Verify Migration

1. Click **Run** (or press Cmd/Ctrl + Enter)
2. Check for success message
3. Verify table exists: Go to **Table Editor** → Should see `analytics_events` table

**Column explanations:**
- `id`: Primary key (UUID, auto-generated)
- `user_id`: Links to `auth.users` (nullable for anonymous events, `ON DELETE SET NULL` = anonymize on user deletion for GDPR)
- `event_name`: Event type (`'user_logged_in'`, `'app_loaded'`, `'page_viewed'`)
- `page`: Page route (e.g., `'/dashboard'`, `'/player/123'`) - nullable for non-page events
- `created_at`: Timestamp (indexed DESC for newest-first queries)

---

## STEP 2: Verify Implementation Files

The following files have been created automatically:

### ✅ Frontend Tracking
- `lib/analytics/track-client.ts` - Client-side tracking helper
- `components/analytics/app-tracker.tsx` - App-level tracker component

### ✅ Backend Tracking
- `lib/analytics/track-server.ts` - Server-side tracking helper

### ✅ Admin Panel
- `app/admin/activity/page.tsx` - Admin activity log page

### ✅ Integration Points
- `app/layout.tsx` - AppTracker added
- `components/auth/auth-screen.tsx` - Login tracking added

---

## STEP 3: Test Tracking

### 3.1 Test App Loaded

1. **Clear browser sessionStorage** (DevTools → Application → Session Storage → Clear)
2. **Refresh page** (`/`)
3. **Check Supabase**:
   - Go to **Table Editor** → `analytics_events`
   - Should see 1 event: `event_name = 'app_loaded'`
   - `user_id` should be your user ID (if logged in) or NULL (if anonymous)

### 3.2 Test Page View

1. **Navigate to** `/dashboard`
2. **Check Supabase**:
   - Should see new event: `event_name = 'page_viewed'`, `page = '/dashboard'`

3. **Navigate to** `/player/[some-id]`
4. **Check Supabase**:
   - Should see: `event_name = 'page_viewed'`, `page = '/player/...'`

### 3.3 Test User Login

1. **Log out** (if logged in)
2. **Log in** with email/password
3. **Check Supabase**:
   - Should see new event: `event_name = 'user_logged_in'`
   - `user_id` should be your user ID
   - `page` should be NULL (server-side event)

### 3.4 Test Admin Panel

1. **Log in as admin** (user with `role = 'admin'`)
2. **Navigate to** `/admin/activity`
3. **Verify**:
   - Table shows all events
   - Can filter by user ID, event type, date range
   - Pagination works (if > 50 events)

### 3.5 Test Non-Admin Access

1. **Log in as regular user** (not admin)
2. **Try to access** `/admin/activity`
3. **Verify**:
   - Should redirect to home or show "Unauthorized"
   - RLS policy prevents reading events

---

## STEP 4: Verify RLS Policies

### 4.1 Test User Can Insert Own Events

1. **Log in as any user**
2. **Events should be inserted** (check `analytics_events` table)
3. **Verify** `user_id` matches logged-in user ID

### 4.2 Test Admin Can Read All Events

1. **Log in as admin**
2. **Go to** `/admin/activity`
3. **Verify** table shows all events from all users

### 4.3 Test Non-Admin Cannot Read Events

1. **Log in as regular user**
2. **Try to query** `analytics_events` table directly (Supabase SQL Editor)
3. **Run**:
   ```sql
   SELECT * FROM analytics_events LIMIT 10;
   ```
4. **Verify** returns 0 rows (RLS blocks access)

---

## STEP 5: Retention Strategy (Optional)

### 5.1 Manual Cleanup (Recommended for MVP)

For now, manually delete old events:

```sql
-- Delete events older than 90 days
DELETE FROM analytics_events
WHERE created_at < NOW() - INTERVAL '90 days';
```

### 5.2 Automated Cleanup (Future)

Create a Supabase Edge Function or use `pg_cron`:

```sql
-- Example: pg_cron job (if enabled)
SELECT cron.schedule(
  'delete-old-analytics',
  '0 0 * * *', -- Daily at midnight
  $$
  DELETE FROM analytics_events
  WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);
```

**Recommendation**: Start with manual cleanup, add automation later if needed.

---

## STEP 6: Verification Checklist

Use this checklist to verify everything works:

### ✅ Database
- [ ] `analytics_events` table exists in Supabase
- [ ] Table has columns: `id`, `user_id`, `event_name`, `page`, `created_at`
- [ ] Indexes exist (check `idx_analytics_events_*`)
- [ ] RLS is enabled on table
- [ ] RLS policies exist: "Users can insert their own events" and "Admins can read all events"

### ✅ Frontend Tracking
- [ ] `app_loaded` event fires once per session (check sessionStorage)
- [ ] `page_viewed` event fires on route change (check Supabase table)
- [ ] Events are inserted into `analytics_events` table
- [ ] Tracking doesn't break UI (failures are silent)

### ✅ Backend Tracking
- [ ] `user_logged_in` event fires on successful login
- [ ] Event is inserted into `analytics_events` table
- [ ] Login still works if tracking fails (non-blocking)

### ✅ Admin Panel
- [ ] `/admin/activity` page exists
- [ ] Page shows table with events
- [ ] Default sort: newest first
- [ ] Pagination works (if > 50 events)
- [ ] Filters work:
  - [ ] Filter by user ID
  - [ ] Filter by event type
  - [ ] Filter by date range
- [ ] Non-admins cannot access `/admin/activity` (redirected or blocked)

### ✅ Privacy & GDPR
- [ ] `user_id` is NULL for anonymous events
- [ ] `ON DELETE SET NULL` works (delete a test user, check events are anonymized)
- [ ] No email addresses stored in `analytics_events` table
- [ ] Only admins can read events (RLS enforced)

### ✅ Performance
- [ ] Tracking doesn't block page loads (fire-and-forget)
- [ ] API routes still work if tracking fails (non-blocking)
- [ ] Table queries are fast (< 500ms) with indexes

---

## Troubleshooting

### Events Not Appearing in Table?

1. **Check RLS policies**: Ensure user is authenticated (for inserts)
2. **Check browser console**: Look for errors in `trackEvent` calls
3. **Check Supabase logs**: Go to **Logs** → **Postgres Logs** for errors
4. **Verify table exists**: Check **Table Editor** → `analytics_events`

### Admin Panel Not Showing Events?

1. **Check user role**: Ensure user has `role = 'admin'` in `auth.users.raw_user_meta_data`
2. **Check RLS policy**: Run this to verify admin policy:
   ```sql
   -- Check if you're admin
   SELECT (raw_user_meta_data->>'role')::text as role
   FROM auth.users
   WHERE id = auth.uid();
   ```
3. **Check browser console**: Look for errors in admin page

### Tracking Breaking Auth Flow?

1. **Tracking is non-blocking**: Check `auth-screen.tsx` - `trackEvent` is wrapped in `catch`
2. **Check logs**: Should see errors logged, not thrown
3. **Verify**: Login still works even if Supabase insert fails

### Table Growing Too Large?

1. **Run cleanup SQL** (see Step 5.1)
2. **Consider pagination**: Admin panel already paginates (50 per page)
3. **Consider archiving**: Move old events to archive table if needed

---

## Next Steps

After verification:

1. **Monitor table size**: Check `analytics_events` row count periodically
2. **Set up retention**: Implement automated cleanup (Step 5.2) if needed
3. **Add more events**: Extend tracking as needed (e.g., `session_started`, `match_completed`)
4. **Customize admin panel**: Add charts, export, etc. if needed

---

## File Structure Summary

```
app/
  admin/
    activity/
      page.tsx          # Admin activity log page
  layout.tsx            # AppTracker added

components/
  analytics/
    app-tracker.tsx     # App-level tracking (app_loaded, page_viewed)
  auth/
    auth-screen.tsx     # Login tracking added

lib/
  analytics/
    track-client.ts     # Client-side tracking helper
    track-server.ts     # Server-side tracking helper (unused for now)

supabase/
  migrations/
    20250127_create_analytics_events.sql  # Database migration
```

---

**Implementation complete!** Follow the checklist above to verify everything works.
