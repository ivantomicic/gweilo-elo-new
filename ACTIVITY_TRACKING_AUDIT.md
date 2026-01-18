# User Activity Tracking Architecture & Tooling Audit

**Date**: 2025-01-27  
**Purpose**: Architecture analysis for adding user activity tracking (product analytics) without coupling to business logic

---

## Executive Summary

**Primary Recommendation**: **PostHog (Self-hosted)** with **Supabase events table** as backup/audit trail

**Alternative**: PostHog Cloud (generous free tier) with custom events table for GDPR compliance

**Architecture**: Hybrid approach — frontend UI events + backend API events via middleware/triggers, decoupled from core logic

---

## 1. What Should Be Tracked

### 1.1 Product Analytics Events (User Actions for Product Insights)

**High-Value Events:**

#### Authentication & Onboarding
- `user_registered` (email/password or OAuth provider)
- `user_logged_in` (method: email/google)
- `user_logged_out`
- `auth_error` (failed login attempts, type: invalid_credentials/email_not_confirmed/etc)

**Purpose**: Understand registration flow completion, login methods, auth friction

#### Session Management (Critical Flow)
- `session_started` (player_count, round_count, created_by)
- `session_completed` (session_id, duration_minutes, match_count, round_count)
- `session_force_closed` (by_admin_user_id, session_id)
- `session_imported_json` (session_id, imported_at)
- `session_viewed` (session_id, is_active)

**Purpose**: Track core feature usage, session completion rates, drop-off points

#### Match & Round Actions
- `round_submitted` (session_id, round_number, match_count)
- `match_result_entered` (session_id, match_id, match_type: singles/doubles)
- `match_edited` (session_id, match_id, edit_type: score/video/other)
- `match_video_added` (session_id, match_id)

**Purpose**: Understand workflow efficiency, edit frequency, video usage

#### Navigation & Discovery
- `page_viewed` (page: dashboard/statistics/player/sessions/start-session, player_id if applicable)
- `player_profile_viewed` (player_id, is_self: boolean)
- `statistics_viewed` (view_type: singles/doubles_player/doubles_team)
- `session_list_viewed` (filter: active/all)

**Purpose**: Feature discovery, navigation patterns, engagement depth

#### Settings & Configuration
- `settings_viewed`
- `settings_updated` (setting_type: name/avatar/email_preferences)

**Purpose**: Rarely used, but useful for understanding customizability needs

#### Admin Actions (Separate Category)
- `admin_user_viewed` (admin_user_id)
- `admin_user_role_changed` (target_user_id, new_role, admin_user_id)
- `admin_session_force_closed` (session_id, admin_user_id)

**Purpose**: Admin audit trail, security monitoring

### 1.2 What NOT to Track (Noise & Sensitive Data)

**Do NOT track:**
- ❌ **Password-related data** (password resets, password strength)
- ❌ **PII in metadata** (full names beyond display_name, addresses)
- ❌ **IP addresses** (unless required for security, prefer hashed/geo)
- ❌ **Every keystroke/click** (focus on actions, not raw interaction data)
- ❌ **Technical errors** (use separate error tracking: Sentry)
- ❌ **Internal API health** (use monitoring: Supabase logs, Vercel analytics)
- ❌ **Session page scroll positions** (not actionable)
- ❌ **Loading state durations** (use performance monitoring instead)

**Reasons:**
- Privacy compliance (GDPR)
- Signal-to-noise ratio (tracking everything = tracking nothing)
- Maintenance burden (more events = more processing/storage)

### 1.3 Difference: Product Analytics vs Audit/Compliance Events

**Product Analytics Events:**
- **Purpose**: Understand user behavior, feature usage, flows
- **Retention**: 1-2 years (enough for trends)
- **Aggregation**: OK to sample or aggregate over time
- **Format**: High-level actions (`session_started`, `match_entered`)
- **Storage**: Analytics platform (PostHog) + optional backup table
- **Access**: Product team, aggregated views

**Audit/Compliance Events:**
- **Purpose**: Who did what when (legal, security, debugging)
- **Retention**: Indefinite (or per compliance requirements)
- **Aggregation**: Must preserve raw events, no sampling
- **Format**: Detailed actions with full context (`admin_role_changed`, `session_force_closed`)
- **Storage**: Database table (Supabase) with immutable logs
- **Access**: Admins only, raw event queries

**Overlap:**
- Some events are both (e.g., `admin_session_force_closed`)
- Store in both: PostHog (analytics) + `audit_log` table (compliance)
- Keep them separate for different retention/access patterns

---

## 2. Tracking Architecture

### 2.1 Where Tracking Logic Should Live

**Recommendation**: **Hybrid approach** — frontend for UI events, backend middleware/triggers for API events

#### Frontend Tracking (UI Events)

**Location**: Client components (page-level or key interaction handlers)

**Events:**
- `page_viewed`
- `session_viewed`
- `player_profile_viewed`
- `statistics_viewed`
- `settings_viewed`
- Button clicks on critical actions (when needed)

**Implementation pattern:**
```typescript
// lib/analytics/track.ts (wrapper around PostHog)
import posthog from 'posthog-js';

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    posthog.capture(eventName, properties);
  }
}

// Usage in components:
// trackEvent('page_viewed', { page: 'dashboard' });
```

**Why frontend for UI events:**
- ✅ Captures actual user interactions (even if API fails)
- ✅ Low latency (non-blocking)
- ✅ Easy to add to client components
- ⚠️ Can be blocked by ad blockers (mitigate with backend backup)

#### Backend Tracking (API Events)

**Location**: **API route middleware** (Next.js middleware or route-level wrapper)

**Events:**
- `session_started` (POST /api/sessions)
- `session_completed` (POST /api/sessions/[sessionId]/rounds/[roundNumber]/submit)
- `round_submitted`
- `match_result_entered`
- `match_edited`
- `admin_*` events

**Implementation pattern:**

**Option A: API Route Wrapper (Recommended for MVP)**
```typescript
// lib/analytics/track-server.ts
import { PostHog } from 'posthog-node';
import { createAdminClient } from '@/lib/supabase/admin';

export async function trackServerEvent(
  eventName: string,
  properties: Record<string, any>,
  userId?: string
) {
  // Send to PostHog
  await posthog.capture({ distinctId: userId || 'anonymous', event: eventName, properties });
  
  // Also log to Supabase events table (for backup/audit)
  if (userId) {
    await adminClient.from('analytics_events').insert({
      user_id: userId,
      event_name: eventName,
      properties,
      created_at: new Date().toISOString()
    });
  }
}

// Usage in API routes:
// await trackServerEvent('session_started', { session_id, player_count }, user.id);
```

**Option B: Database Triggers (For critical events only)**

Use triggers for events that MUST be captured (even if API route fails):

```sql
-- Track session completion via trigger
CREATE TRIGGER track_session_completed
AFTER UPDATE ON sessions
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
FOR EACH ROW
EXECUTE FUNCTION log_analytics_event('session_completed');
```

**When to use triggers:**
- ✅ Critical business events (session completion, Elo updates)
- ✅ Events that happen in database transactions
- ⚠️ More complex to maintain, harder to test
- ⚠️ Only use for events that MUST be tracked

**Recommendation**: Use triggers sparingly (session completion only), use middleware/wrapper for most API events.

### 2.2 Decoupling from Business Logic

**Principle**: Tracking should be **invisible to core business logic**

#### Current State (No Tracking)

API routes are clean:
```typescript
// app/api/sessions/route.ts
export async function POST(request: NextRequest) {
  // ... validation ...
  const { data: session } = await supabase.from('sessions').insert(sessionData);
  return NextResponse.json({ sessionId: session.id });
}
```

#### With Tracking (Still Clean)

**Pattern 1: Middleware/Wrapper (Recommended)**
```typescript
// app/api/sessions/route.ts
export async function POST(request: NextRequest) {
  // ... existing code ...
  const { data: session } = await supabase.from('sessions').insert(sessionData);
  
  // Tracking (non-blocking, fails silently)
  trackServerEvent('session_started', { session_id: session.id, player_count }, user.id)
    .catch(err => console.error('Tracking failed:', err));
  
  return NextResponse.json({ sessionId: session.id });
}
```

**Pattern 2: Database Trigger (Zero Coupling)**

For critical events, use triggers:
```sql
-- Trigger fires automatically, no code changes needed
CREATE TRIGGER track_session_completed ...
```

**Pattern 3: Event Emitter (Future-Proofing)**

For future extensibility (email, notifications, tracking):
```typescript
// lib/events/emitter.ts
export const eventEmitter = new EventEmitter();

eventEmitter.emit('session.completed', { sessionId, userId });

// Listeners (tracking, email, etc.) are separate modules
// lib/analytics/listener.ts
eventEmitter.on('session.completed', (data) => trackEvent('session_completed', data));
```

**Decoupling rules:**
1. ✅ **Tracking calls are non-blocking** (fire-and-forget, catch errors)
2. ✅ **Business logic doesn't depend on tracking** (no `if (tracking.success)`)
3. ✅ **Tracking failures don't break user flows** (wrap in try-catch)
4. ✅ **Tracking is opt-out-able** (feature flag, environment variable)

---

## 3. Event Model & Schema

### 3.1 Recommended Event Shape

**PostHog Event (Standard format):**
```typescript
{
  distinct_id: string,        // user.id or 'anonymous'
  event: string,              // 'session_started', 'page_viewed'
  properties: {
    // Context
    $current_url?: string,
    $os?: string,
    $browser?: string,
    
    // Custom properties
    session_id?: string,
    player_count?: number,
    page?: string,
    // ... domain-specific properties
  },
  timestamp?: string,         // ISO 8601 (defaults to now)
}
```

**Supabase Events Table (Backup/Audit):**
```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes for common queries
  INDEX idx_analytics_events_user_id (user_id),
  INDEX idx_analytics_events_event_name (event_name),
  INDEX idx_analytics_events_created_at (created_at)
);

-- For GDPR: anonymize user_id on delete (already handled by ON DELETE SET NULL)
```

**Audit Log Table (Compliance):**
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,           -- 'admin_role_changed', 'session_force_closed'
  entity_type TEXT,               -- 'user', 'session', 'match'
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_audit_log_user_id (user_id),
  INDEX idx_audit_log_action (action),
  INDEX idx_audit_log_created_at (created_at)
);
```

### 3.2 Event Naming Conventions

**Format**: `snake_case` (consistent with codebase)

**Patterns:**
- **Actions**: `<entity>_<action>` (e.g., `session_started`, `match_edited`)
- **Views**: `<entity>_viewed` (e.g., `page_viewed`, `player_profile_viewed`)
- **Admin**: `admin_<action>` (e.g., `admin_user_role_changed`)

**Examples:**
- ✅ `session_started`
- ✅ `round_submitted`
- ✅ `player_profile_viewed`
- ✅ `admin_session_force_closed`
- ❌ `SessionStarted` (PascalCase)
- ❌ `session-started` (kebab-case)
- ❌ `start_session` (verb-noun)

**Property naming**: `snake_case` (match event names)

### 3.3 Versioning Events

**Strategy**: **Extend properties, don't break events**

**Guidelines:**
1. **Event names are immutable** (once tracked, don't rename)
2. **Properties are additive** (add new properties, don't remove required ones)
3. **Breaking changes**: Create new event (`session_started_v2`) instead of modifying old one
4. **Documentation**: Keep event catalog in code comments or docs

**Example:**
```typescript
// v1 (existing)
trackEvent('session_started', { session_id, player_count });

// v2 (add optional property, backward compatible)
trackEvent('session_started', { 
  session_id, 
  player_count,
  created_via: 'schedule' // new optional property
});

// Breaking change (create new event)
trackEvent('session_started_v2', { session_id, player_count, mode: 'tournament' });
```

### 3.4 Anonymous vs Authenticated Users

**Strategy**: **Capture anonymous events, link on login**

**PostHog handles this automatically:**
- Pre-login: `distinct_id = 'anonymous_<session_id>'`
- Post-login: `distinct_id = user.id`
- PostHog merges anonymous + authenticated events for same user

**Implementation:**
```typescript
// lib/analytics/track.ts
import posthog from 'posthog-js';

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    const userId = posthog.get_distinct_id(); // Gets 'anonymous_...' or user.id
    posthog.capture(eventName, properties);
  }
}

// On login, identify user (PostHog merges events)
export function identifyUser(userId: string, properties?: { email?: string, name?: string }) {
  if (typeof window !== 'undefined') {
    posthog.identify(userId, properties);
  }
}

// Usage in auth flow:
// identifyUser(user.id, { email: user.email, name: user.display_name });
```

**Supabase events table:**
- Authenticated: `user_id = user.id`
- Anonymous: `user_id = NULL` (can't track anonymous in DB without session token)

**Recommendation**: PostHog handles anonymous → authenticated merging well. Supabase table is primarily for authenticated events and audit logs.

---

## 4. Tooling & Services Comparison

### 4.1 PostHog (Self-Hosted) ⭐ **PRIMARY RECOMMENDATION**

**Pros:**
- ✅ **Free** (self-hosted on your infrastructure)
- ✅ **Open-source** (no vendor lock-in, full control)
- ✅ **EU-friendly** (host in EU region, GDPR compliant)
- ✅ **Privacy-focused** (can anonymize IP, disable session recording)
- ✅ **Feature-rich** (funnels, retention, feature flags, session replay)
- ✅ **Supabase-friendly** (PostgreSQL backend, can integrate with Supabase)

**Cons:**
- ⚠️ **Self-hosting required** (infrastructure maintenance)
- ⚠️ **Setup complexity** (Docker deployment, initial config)
- ⚠️ **Scaling** (needs monitoring if event volume grows)

**Free tier**: N/A (self-hosted = free forever)

**Ease of setup**: Medium (Docker compose, ~30 min setup)

**Privacy**: Full control (GDPR-compliant by default if hosted in EU)

**Recommendation**: Use if you're comfortable with self-hosting. Best long-term option.

---

### 4.2 PostHog (Cloud) ⭐ **ALTERNATIVE RECOMMENDATION**

**Pros:**
- ✅ **Generous free tier** (1M events/month free)
- ✅ **Easy setup** (5 min, just API key)
- ✅ **No infrastructure** (managed service)
- ✅ **Feature-rich** (same features as self-hosted)
- ✅ **EU region available** (GDPR-friendly)

**Cons:**
- ⚠️ **Vendor lock-in** (data lives in PostHog)
- ⚠️ **Paid after 1M events** ($0.000225 per event, ~$225/month for 1M events)
- ⚠️ **Less control** (privacy settings, data retention)

**Free tier**: 1M events/month (should be plenty for MVP)

**Ease of setup**: Easy (npm install, add API key)

**Privacy**: EU region available, but data leaves your infrastructure

**Recommendation**: Start here if you want quick setup. Can migrate to self-hosted later.

---

### 4.3 Plausible Analytics

**Pros:**
- ✅ **Privacy-first** (no cookies, no personal data)
- ✅ **Simple UI** (focused on essential metrics)
- ✅ **Open-source** (can self-host)
- ✅ **GDPR-friendly** (EU-hosted, no PII)

**Cons:**
- ❌ **Not event-based** (page views only, no custom events without Pro plan)
- ❌ **Limited for product analytics** (designed for marketing, not product insights)
- ❌ **Custom events are paid** (€9/month for custom events)

**Free tier**: None (paid only, €9/month for basic)

**Ease of setup**: Easy (script tag)

**Privacy**: Excellent (no PII, privacy-focused)

**Recommendation**: ❌ Not suitable for product analytics. Use for marketing/page views only.

---

### 4.4 Mixpanel

**Pros:**
- ✅ **Powerful product analytics** (funnels, cohorts, retention)
- ✅ **Free tier** (20M events/month free)
- ✅ **Easy setup** (SDK, good docs)

**Cons:**
- ⚠️ **Expensive after free tier** ($25/month for 100M events)
- ⚠️ **US-hosted by default** (GDPR requires EU region, extra cost)
- ⚠️ **Privacy concerns** (collects more data than PostHog by default)

**Free tier**: 20M events/month (very generous)

**Ease of setup**: Easy (npm install, API key)

**Privacy**: Good (but defaults to US region, need EU for GDPR)

**Recommendation**: Solid alternative to PostHog Cloud if you need more advanced analytics.

---

### 4.5 Simple Custom Events Table (Supabase)

**Pros:**
- ✅ **Full control** (your database, your rules)
- ✅ **Free** (Supabase free tier: 500MB database)
- ✅ **GDPR-friendly** (data in your Supabase instance)
- ✅ **No vendor lock-in** (SQL queries, export easily)
- ✅ **Integrates with Supabase** (RLS policies, triggers)

**Cons:**
- ❌ **No built-in analytics UI** (need to build dashboards yourself)
- ❌ **No funnels/retention** (need to write SQL)
- ❌ **Limited visualization** (need to build or use BI tools)

**Free tier**: Supabase free tier (500MB DB, should handle ~1M events)

**Ease of setup**: Easy (create table, insert events)

**Privacy**: Full control

**Recommendation**: Use as **backup/audit trail**, not primary analytics platform. Can build dashboards later.

---

### 4.6 Supabase Native Logging

**Note**: Supabase provides database logs (Postgres logs) but these are:
- ❌ **Not user-friendly** (raw SQL logs)
- ❌ **Not event-structured** (hard to query for analytics)
- ❌ **Performance-focused** (slow queries, errors, not user actions)

**Recommendation**: ❌ Use for database debugging, not product analytics.

---

### 4.7 Tooling Recommendation Summary

| Tool | Free Tier | Setup | Privacy | Best For |
|------|-----------|-------|---------|----------|
| **PostHog Self-hosted** ⭐ | Unlimited | Medium | Excellent | Long-term, full control |
| **PostHog Cloud** ⭐ | 1M events/mo | Easy | Good (EU) | Quick start, managed |
| **Plausible** | Paid only | Easy | Excellent | Marketing only |
| **Mixpanel** | 20M events/mo | Easy | Good (EU paid) | Advanced analytics |
| **Custom Table** | Supabase free | Easy | Excellent | Backup/audit |

**Final Recommendation:**
1. **Start with PostHog Cloud** (1M events/month free, easy setup)
2. **Backup to Supabase events table** (for audit/GDPR compliance)
3. **Migrate to PostHog Self-hosted** (if you outgrow free tier or want full control)

---

## 5. Data Flow Examples

### 5.1 Example: User Completes a Session

**Flow:**
```
User submits final round scores
    ↓
POST /api/sessions/[sessionId]/rounds/[roundNumber]/submit
    ↓
API route: Updates session.status = 'completed' (database)
    ↓
[TRACKING POINT 1: API Route]
trackServerEvent('session_completed', {
  session_id,
  duration_minutes,
  match_count,
  round_count
}, user.id)
    ↓
[TRACKING POINT 2: Database Trigger (optional)]
CREATE TRIGGER on_session_completed
AFTER UPDATE ON sessions
WHEN (NEW.status = 'completed')
→ Logs to audit_log table
    ↓
PostHog: Receives event (analytics)
Supabase events table: Receives event (backup)
    ↓
User redirects to session summary page
    ↓
[TRACKING POINT 3: Frontend]
trackEvent('session_viewed', { session_id, is_active: false })
```

**Where events are captured:**
- **Backend**: `session_completed` (API route + optional trigger)
- **Frontend**: `session_viewed` (page load)

**Decoupling**: Tracking is fire-and-forget, doesn't affect session completion logic.

---

### 5.2 Example: User Views Player Profile

**Flow:**
```
User navigates to /player/[id]
    ↓
Page component mounts
    ↓
[TRACKING POINT: Frontend]
trackEvent('player_profile_viewed', {
  player_id,
  is_self: currentUserId === playerId
})
    ↓
PostHog: Receives event
```

**Where event is captured:**
- **Frontend only** (no backend API call for this action)

**Why frontend**: Page views don't always trigger API calls (could be client-side routing).

---

### 5.3 Example: Admin Force-Closes a Session

**Flow:**
```
Admin clicks "Force Close" button
    ↓
POST /api/sessions/[sessionId]/force-close
    ↓
API route: Updates session.status = 'completed'
    ↓
[TRACKING POINT: API Route]
trackServerEvent('admin_session_force_closed', {
  session_id,
  admin_user_id: user.id
}, user.id)
    ↓
[Also log to audit_log table for compliance]
INSERT INTO audit_log (user_id, action, entity_type, entity_id)
VALUES (user.id, 'admin_session_force_closed', 'session', session_id)
    ↓
PostHog: Receives event (analytics)
audit_log: Receives event (compliance)
```

**Where events are captured:**
- **Backend**: `admin_session_force_closed` (API route + audit_log)

**Why both PostHog + audit_log**: Analytics (PostHog) + compliance (audit_log) serve different purposes.

---

## 6. Privacy & GDPR Considerations

### 6.1 What Personal Data Should / Should Not Be Sent

**✅ OK to Send (Anonymous/Aggregated):**
- User IDs (hashed or UUID, not email)
- Session IDs (UUIDs, not personally identifiable)
- Page names (e.g., `'dashboard'`, not full URLs with query params)
- Action types (e.g., `'session_started'`, not raw user input)
- Counts/numbers (player_count, match_count)

**⚠️ Be Careful With:**
- Display names (can be PII if unique, use only if necessary)
- Timestamps (OK, but be aware of timezone)
- IP addresses (hash or exclude, PostHog can anonymize)

**❌ Do NOT Send:**
- Email addresses (unless explicit consent, better to use user_id)
- Passwords (obviously)
- Full names beyond display_name
- Phone numbers
- Physical addresses
- Raw user input (search queries, form data)

**Recommendation:**
```typescript
// ✅ Good
trackEvent('session_started', { 
  session_id: 'uuid',
  player_count: 4,
  created_by: user.id // UUID, not email
});

// ❌ Bad
trackEvent('session_started', { 
  session_id: 'uuid',
  player_count: 4,
  created_by_email: user.email // ❌ Don't send email
});
```

### 6.2 How to Handle Deletion Requests

**Strategy**: **Delete user events on user deletion**

**Implementation:**

**PostHog:**
```typescript
// On user deletion (Supabase trigger or API route)
import { PostHog } from 'posthog-node';

await posthog.deletePerson(userId);
```

**Supabase events table:**
```sql
-- Option 1: Cascade delete (via foreign key)
ALTER TABLE analytics_events 
ADD CONSTRAINT fk_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Option 2: Anonymize (set user_id = NULL)
UPDATE analytics_events 
SET user_id = NULL 
WHERE user_id = <deleted_user_id>;
```

**Audit log:**
- **Keep events** (compliance requirement)
- **Anonymize user_id**: `ON DELETE SET NULL` (keeps audit trail, removes PII)

**Recommendation:**
- PostHog: Delete person (removes all events)
- `analytics_events`: Cascade delete or anonymize (your choice)
- `audit_log`: Keep but anonymize user_id (compliance)

### 6.3 EU-Friendly Defaults

**Recommendation: Use PostHog EU region**

**PostHog Cloud:**
- Set `api_host = 'https://eu.posthog.com'` (EU region)
- Data stored in EU, GDPR-compliant

**PostHog Self-hosted:**
- Deploy in EU region (e.g., EU Supabase region, EU VPS)
- Full control over data location

**Supabase:**
- Use EU region if available (check Supabase dashboard)
- Database location = event storage location

**Other settings:**
- Disable IP collection in PostHog (if not needed)
- Disable session recording (privacy-sensitive, opt-in only)
- Use cookie-less tracking (PostHog supports this)

---

## 7. Future-Proofing

### 7.1 How to Later Add Funnels

**PostHog: Built-in Funnels**

PostHog has native funnel analysis:
- Define steps: `session_started` → `round_submitted` → `session_completed`
- View conversion rates, drop-off points
- No code changes needed (uses existing events)

**Custom Table: SQL Funnels**

If using custom table, write SQL:
```sql
-- Example: Session completion funnel
WITH funnel AS (
  SELECT
    user_id,
    COUNT(DISTINCT CASE WHEN event_name = 'session_started' THEN session_id END) as started,
    COUNT(DISTINCT CASE WHEN event_name = 'round_submitted' THEN session_id END) as submitted,
    COUNT(DISTINCT CASE WHEN event_name = 'session_completed' THEN session_id END) as completed
  FROM analytics_events
  WHERE event_name IN ('session_started', 'round_submitted', 'session_completed')
  GROUP BY user_id
)
SELECT 
  COUNT(*) as users,
  SUM(started) as started_sessions,
  SUM(submitted) as submitted_rounds,
  SUM(completed) as completed_sessions
FROM funnel;
```

**Recommendation**: Use PostHog for funnels (built-in UI). Custom table is backup.

---

### 7.2 How to Add Retention Tracking

**PostHog: Built-in Retention**

PostHog tracks user retention automatically:
- Weekly/Monthly retention cohorts
- No code changes needed

**Custom Table: SQL Retention**

```sql
-- Example: Weekly retention
WITH first_session AS (
  SELECT user_id, DATE_TRUNC('week', MIN(created_at)) as first_week
  FROM analytics_events
  WHERE event_name = 'session_started'
  GROUP BY user_id
),
weekly_activity AS (
  SELECT 
    user_id,
    DATE_TRUNC('week', created_at) as activity_week
  FROM analytics_events
  WHERE event_name IN ('session_started', 'session_completed')
  GROUP BY user_id, DATE_TRUNC('week', created_at)
)
SELECT 
  f.first_week,
  COUNT(DISTINCT f.user_id) as cohort_size,
  COUNT(DISTINCT CASE WHEN w.activity_week = f.first_week THEN w.user_id END) as week_0,
  COUNT(DISTINCT CASE WHEN w.activity_week = f.first_week + INTERVAL '1 week' THEN w.user_id END) as week_1,
  -- ... continue for more weeks
FROM first_session f
LEFT JOIN weekly_activity w ON f.user_id = w.user_id
GROUP BY f.first_week;
```

**Recommendation**: Use PostHog (built-in). Custom table for advanced SQL queries.

---

### 7.3 How to Add Feature Flags

**PostHog: Built-in Feature Flags**

PostHog includes feature flags:
```typescript
import posthog from 'posthog-js';

const showNewFeature = posthog.isFeatureEnabled('new-feature');
if (showNewFeature) {
  // Show new UI
}
```

**Integration with tracking:**
- Feature flag usage is automatically tracked
- Can analyze: "Who used feature X? Did it increase engagement?"

**Alternative: Custom Feature Flags**

If not using PostHog:
- Use Supabase Edge Config or environment variables
- Track feature usage manually: `trackEvent('feature_used', { feature: 'new-feature' })`

**Recommendation**: Use PostHog feature flags (free tier includes flags).

---

### 7.4 How to Add Admin Dashboards

**PostHog: Built-in Dashboards**

PostHog has dashboard UI:
- Pre-built charts (event volume, user counts)
- Custom charts (SQL queries, funnels)
- Shareable dashboards

**Custom Table: Build Your Own**

Use Supabase dashboard or BI tools:
- **Supabase Dashboard**: View `analytics_events` table
- **Metabase** (open-source): Connect to Supabase, build dashboards
- **Grafana** (if self-hosting): Connect to Postgres, visualize events

**Recommendation**: Start with PostHog dashboards (built-in). Build custom dashboards later if needed.

---

### 7.5 How to Avoid Vendor Lock-In

**Strategy: Dual-Write Pattern**

Write events to both PostHog (analytics) and Supabase table (backup):

```typescript
// lib/analytics/track.ts
export async function trackEvent(eventName: string, properties?: Record<string, any>) {
  const userId = getCurrentUserId();
  
  // Primary: PostHog
  posthog.capture(eventName, properties);
  
  // Backup: Supabase (non-blocking)
  if (userId) {
    supabase.from('analytics_events').insert({
      user_id: userId,
      event_name: eventName,
      properties
    }).catch(err => console.error('Backup tracking failed:', err));
  }
}
```

**Benefits:**
- ✅ **Can migrate away** from PostHog (data in Supabase)
- ✅ **Can query directly** (SQL on Supabase table)
- ✅ **GDPR compliance** (your data, your control)

**Export/Import:**
- PostHog: Export events via API (JSON/CSV)
- Supabase: Export via SQL dump or Supabase CLI

**Recommendation**: Always dual-write critical events (session_started, session_completed) to Supabase table. PostHog for analytics UI, Supabase for backup/export.

---

## 8. Assumptions & Open Questions

### 8.1 Assumptions

1. **Event volume**: Assumed < 1M events/month (PostHog free tier is sufficient)
2. **User base**: Assumed < 1000 active users (Supabase free tier sufficient)
3. **Privacy requirement**: Assumed GDPR compliance needed (EU region, user deletion)
4. **Team size**: Assumed small team (no dedicated analytics engineer, need simple setup)
5. **Budget**: Assumed free/low-cost preferred (PostHog free tier or self-hosted)

### 8.2 Open Questions

1. **Self-hosting preference**: Are you comfortable self-hosting PostHog, or prefer managed service?
   - **If self-hosting**: Recommend PostHog self-hosted
   - **If managed**: Recommend PostHog Cloud (migrate to self-hosted if needed)

2. **Event volume expectations**: How many events/month do you expect?
   - **< 1M/month**: PostHog Cloud free tier
   - **> 1M/month**: PostHog self-hosted or Mixpanel

3. **Audit log requirements**: Do you need detailed audit logs for compliance?
   - **If yes**: Use `audit_log` table + triggers
   - **If no**: PostHog + `analytics_events` backup is sufficient

4. **Admin dashboard priority**: Do you need admin dashboards immediately, or later?
   - **Immediate**: PostHog built-in dashboards
   - **Later**: Can build custom dashboards with Supabase/Metabase

5. **Feature flags**: Do you plan to use feature flags soon?
   - **If yes**: PostHog includes feature flags (recommended)
   - **If no**: Can add later

---

## 9. Implementation Priority

### Phase 1: MVP (Week 1)
- ✅ Set up PostHog Cloud (free tier)
- ✅ Add frontend tracking (`page_viewed`, `player_profile_viewed`)
- ✅ Add backend tracking (`session_started`, `session_completed`)
- ✅ Create Supabase `analytics_events` table (backup)

### Phase 2: Core Events (Week 2)
- ✅ Track all session/match events (`round_submitted`, `match_edited`)
- ✅ Track navigation events (`statistics_viewed`, `session_list_viewed`)
- ✅ Set up PostHog dashboard (view event volume)

### Phase 3: Admin & Compliance (Week 3)
- ✅ Create `audit_log` table (admin actions)
- ✅ Track admin events (`admin_session_force_closed`, `admin_user_role_changed`)
- ✅ Set up user deletion handling (GDPR)

### Phase 4: Advanced (Later)
- ⏳ Build funnels (session completion funnel)
- ⏳ Retention tracking (weekly/monthly cohorts)
- ⏳ Custom dashboards (if needed)
- ⏳ Feature flags (if needed)

---

## 10. Summary & Next Steps

### Summary

**Recommended Architecture:**
- **Primary**: PostHog Cloud (1M events/month free) or PostHog Self-hosted (unlimited, more setup)
- **Backup**: Supabase `analytics_events` table (dual-write critical events)
- **Compliance**: Supabase `audit_log` table (admin actions)
- **Tracking**: Hybrid (frontend UI events + backend API events)

**Decoupling:**
- Tracking calls are fire-and-forget (non-blocking)
- Business logic unchanged (tracking added as side effect)
- Failures don't break user flows

### Next Steps

1. **Choose tooling**: PostHog Cloud (quick) vs Self-hosted (long-term)
2. **Review event list**: Confirm events to track (section 1.1)
3. **Decide on triggers**: Use database triggers for critical events, or API middleware only?
4. **Privacy review**: Confirm GDPR requirements (EU region, deletion handling)
5. **Implementation plan**: I'll create implementation plan after you review this audit

---

**End of Audit**
