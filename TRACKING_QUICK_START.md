# Activity Tracking - Quick Start

**Supabase-only tracking (no third-party tools)**

---

## ✅ What's Implemented

1. **Database**: `analytics_events` table with RLS policies
2. **Frontend tracking**: `app_loaded`, `page_viewed`
3. **Login tracking**: `user_logged_in` (on successful login)
4. **Admin panel**: `/admin/activity` with filters and pagination

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Run Database Migration

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy SQL from: `supabase/migrations/20250127_create_analytics_events.sql`
3. Paste and **Run**

**Verify**: Table `analytics_events` exists in **Table Editor**

### Step 2: Restart Dev Server

```bash
npm run dev
```

### Step 3: Test Tracking

1. **Clear sessionStorage** (DevTools → Application → Session Storage)
2. **Refresh page** → Should see `app_loaded` event in `analytics_events` table
3. **Navigate to** `/dashboard` → Should see `page_viewed` event
4. **Log in** → Should see `user_logged_in` event
5. **Go to** `/admin/activity` (as admin) → Should see all events in table

---

## 📋 Files Created

```
lib/analytics/
  track-client.ts        # Client tracking helper
  track-server.ts        # Server tracking helper (future use)

components/analytics/
  app-tracker.tsx        # Auto-tracks app_loaded + page_viewed

app/admin/activity/
  page.tsx               # Admin activity log page

supabase/migrations/
  20250127_create_analytics_events.sql  # Database migration
```

---

## 🔍 Verification Checklist

- [ ] Database migration ran successfully
- [ ] `analytics_events` table exists
- [ ] `app_loaded` event fires on page load (once per session)
- [ ] `page_viewed` event fires on route change
- [ ] `user_logged_in` event fires on login
- [ ] Admin can access `/admin/activity`
- [ ] Non-admin cannot access `/admin/activity`
- [ ] Filters work (user ID, event type, date range)
- [ ] Pagination works

---

## 📖 Full Documentation

See `ACTIVITY_TRACKING_IMPLEMENTATION.md` for detailed steps and troubleshooting.

---

**Done!** Events are now tracked in Supabase only (no third-party tools).
