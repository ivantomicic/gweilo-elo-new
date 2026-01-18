# Email Architecture & Tooling Audit

**Date**: 2025-01-27  
**Purpose**: Architecture analysis for adding email support without coupling to business logic

---

## 1. Recommended Email-Sending Architecture

### 1.1 Where Email Logic Should Live

**Recommendation**: **Supabase Database Triggers + Edge Function** (preferred) OR **Supabase Database Trigger + Background Job Queue** (alternative)

#### Primary Approach: Database Trigger → Edge Function

```
Session Completion (API Route)
    ↓
Database: UPDATE sessions SET status='completed', completed_at=...
    ↓
PostgreSQL Trigger (AFTER UPDATE on sessions)
    ↓
Supabase Edge Function (via pg_net or webhook)
    ↓
Email Service API
```

**Why this approach:**
- ✅ **Zero coupling**: Session completion API route doesn't know about emails
- ✅ **Reliable**: Trigger fires atomically with DB transaction
- ✅ **Supabase-native**: Uses existing Supabase infrastructure
- ✅ **Event-driven**: Natural domain event pattern
- ✅ **Minimal refactor**: Only add trigger + edge function, existing code unchanged

**Location:**
- Trigger: PostgreSQL (via Supabase migrations)
- Email logic: Supabase Edge Function (`supabase/functions/send-session-email`)
- Email service: External API (Resend/SendGrid/etc)

#### Alternative: Background Job Queue

If you need more control or retry logic:
- **Supabase Edge Function** that enqueues jobs to **pg_cron** + **pg_net**
- Or external queue: **Inngest** (recommended for Supabase) or **Trigger.dev**
- Table: `email_jobs` with status (`pending`, `processing`, `sent`, `failed`)

**When to use:**
- Need complex retry backoff
- High volume (>100 emails/day)
- Need to inspect/manage queue via UI

**Tradeoff**: More infrastructure, but better observability

### 1.2 Email Trigger Modeling

**Recommendation**: **Database Triggers** (domain events)

**Implementation:**
```sql
-- Pseudocode
CREATE TRIGGER on_session_completed
AFTER UPDATE ON sessions
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
FOR EACH ROW
EXECUTE FUNCTION notify_session_completed();

-- Function calls Supabase Edge Function via pg_net or webhook
```

**Why triggers over hooks/API calls:**
- ✅ **Atomic**: Fires exactly when DB state changes
- ✅ **No race conditions**: Can't miss session completion
- ✅ **Idempotent-friendly**: Can check `email_sent_at` in trigger
- ✅ **Declarative**: Trigger IS the business rule

**Trigger points:**
1. **Primary**: `sessions.status` changes to `'completed'` (current: `/api/sessions/[sessionId]/rounds/[roundNumber]/submit` line 557-563)
2. **Secondary**: `sessions` updated via force-close (`/api/sessions/[sessionId]/force-close` line 104-110)

**Prevent duplicates:**
- Add `email_sent_at TIMESTAMP` column to `sessions` table
- Trigger checks: `IF NEW.email_sent_at IS NULL THEN ...`
- Edge function sets `email_sent_at` after successful send

### 1.3 Decoupling from Business Logic

**Current state:**
- Session completion in `/app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts` (lines 557-563)
- Force-close in `/app/api/sessions/[sessionId]/force-close/route.ts` (lines 104-110)

**Decoupling strategy:**
1. **API routes unchanged**: They only update `sessions.status = 'completed'`
2. **Database trigger handles email**: Trigger fires automatically on status change
3. **Edge function is isolated**: Lives in `supabase/functions/`, no import into main app
4. **Email logic never imported**: Main app code never imports email service

**Architecture diagram:**
```
┌─────────────────────────────────────┐
│  API Route (Existing)               │
│  - Updates sessions.status          │
│  - No email logic                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  PostgreSQL (sessions table)        │
│  - status: 'completed'              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Database Trigger                   │
│  - Watches status change            │
│  - Calls edge function              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Supabase Edge Function             │
│  - Fetches session data             │
│  - Formats email                    │
│  - Sends via email service          │
│  - Updates email_sent_at            │
└─────────────────────────────────────┘
```

---

## 2. Email Service Provider Recommendations

### 2.1 Comparison Matrix

| Provider | Ease of Management | Template Handling | Deliverability | Cost (10k/month) | Developer Experience |
|----------|-------------------|-------------------|----------------|------------------|---------------------|
| **Resend** | ⭐⭐⭐⭐⭐ | Code-based (React Email) | Excellent | $20/mo | ⭐⭐⭐⭐⭐ |
| **Postmark** | ⭐⭐⭐⭐ | Code + Admin UI | Excellent | $15/mo | ⭐⭐⭐⭐ |
| **SendGrid** | ⭐⭐⭐ | UI templates | Good | $19.95/mo | ⭐⭐⭐ |
| **Amazon SES** | ⭐⭐ | Code-based | Excellent | $1/mo | ⭐⭐ |
| **Mailgun** | ⭐⭐⭐ | UI + Code | Good | $35/mo | ⭐⭐⭐ |

### 2.2 Primary Recommendation: **Resend**

**Why Resend:**
- ✅ **Best DX**: TypeScript-first, React Email integration
- ✅ **Simple API**: Clean, modern REST API
- ✅ **Excellent deliverability**: Built on top-tier infra
- ✅ **Generous free tier**: 3,000 emails/month free
- ✅ **Perfect for Next.js**: Native React Email support
- ✅ **Good pricing**: $20/mo for 10k emails
- ✅ **Template management**: Code-based (git-friendly)

**Code example (what it would look like):**
```typescript
// In edge function
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Sessions <sessions@yourdomain.com>',
  to: player.email,
  subject: 'Session Complete - Your Results',
  react: SessionResultsEmail({ session, playerStats }),
});
```

**Limitations:**
- No built-in template UI (code-based only)
- Newer service (less mature than SendGrid)

### 2.3 Fallback Recommendation: **Postmark**

**Why Postmark as fallback:**
- ✅ **Excellent deliverability**: Top-tier reputation
- ✅ **Template server**: Can host templates server-side
- ✅ **Great for transactional**: Purpose-built for app emails
- ✅ **Good docs**: Clear, straightforward
- ✅ **Reasonable pricing**: $15/mo for 10k emails

**When to choose Postmark over Resend:**
- Need template editing via UI (non-developers)
- Prioritize deliverability above all else
- Already using Postmark for other projects

### 2.4 Not Recommended (for this use case)

**Amazon SES:**
- ❌ Low-level API (more boilerplate)
- ❌ Requires SES setup (domain verification, warm-up)
- ❌ No template UI
- ✅ Only if cost is primary concern (<$1/mo for 10k emails)

**SendGrid:**
- ❌ More complex API
- ❌ UI templates lock you into their system
- ❌ Can be overkill for transactional emails
- ✅ Good if you need marketing email features later

---

## 3. Template & Content Strategy

### 3.1 Template Management Approach

**Recommendation**: **Code-based templates with React Email** (Resend) or **Server-side templates** (Postmark)

#### Option A: React Email (Resend)

**Structure:**
```
supabase/functions/
  send-session-email/
    templates/
      SessionCompleteEmail.tsx
      SessionReminderEmail.tsx
    index.ts
```

**Benefits:**
- ✅ **Version controlled**: Templates in git
- ✅ **Type-safe**: TypeScript props
- ✅ **Component-based**: Reusable email components
- ✅ **Preview mode**: Local dev server for testing
- ✅ **No vendor lock-in**: React Email works with any provider

**Example:**
```typescript
// SessionCompleteEmail.tsx
export function SessionCompleteEmail({ session, playerStats }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Section>
            <Heading>Session Complete!</Heading>
            <Text>Your Elo: {playerStats.elo_before} → {playerStats.elo_after}</Text>
            {/* ... */}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

#### Option B: Server-side Templates (Postmark)

**Structure:**
- Templates stored in Postmark dashboard
- Edge function calls Postmark API with template alias + data

**Benefits:**
- ✅ **Non-developer editable**: Marketers can edit templates
- ✅ **A/B testing**: Built into Postmark

**Tradeoff:** Templates live outside codebase (harder to version)

### 3.2 Handling Multiple Email Types

**Pattern: Email Type Registry**

```typescript
// supabase/functions/send-email/index.ts
type EmailType = 'session_complete' | 'session_reminder' | 'admin_alert';

const emailHandlers = {
  session_complete: {
    template: SessionCompleteEmail,
    subject: (data) => `Session Complete - ${data.sessionId}`,
  },
  session_reminder: {
    template: SessionReminderEmail,
    subject: (data) => `Reminder: Session Tomorrow`,
  },
  admin_alert: {
    template: AdminAlertEmail,
    subject: (data) => `Admin Alert: ${data.message}`,
  },
};

// Edge function receives: { type: 'session_complete', data: {...} }
const handler = emailHandlers[type];
await resend.emails.send({
  to: recipient,
  subject: handler.subject(data),
  react: handler.template(data),
});
```

**Triggering different types:**
- **Session complete**: Database trigger (current task)
- **Reminders**: Future cron job or scheduled edge function
- **Admin alerts**: Direct API call from admin routes

### 3.3 Structured Data Flow

**Data flow:**
```
Database Trigger
  ↓
Edge Function receives: { sessionId: "uuid" }
  ↓
Edge Function fetches:
  - Session data (sessions table)
  - Session players (session_players + auth.users)
  - Player stats (session_rating_snapshots + aggregations)
  - Match results (session_matches)
  ↓
Edge Function formats data:
  {
    session: { id, created_at, completed_at, player_count },
    players: [
      {
        email: string,
        display_name: string,
        stats: { elo_before, elo_after, wins, losses, ... }
      }
    ]
  }
  ↓
Edge Function sends one email per player
```

**Data source:**
- Reuse `/api/sessions/[sessionId]/summary` logic (or extract shared function)
- OR query directly in edge function (recommended for isolation)

**Key data needed:**
- From `sessions`: `id`, `created_at`, `completed_at`, `player_count`
- From `session_players` + `auth.users`: `player_id` → `email`, `display_name`
- From `session_rating_snapshots`: `elo_before` (previous session snapshot)
- From `player_ratings`: `elo_after` (current rating)
- From `session_matches`: Match results (optional, for detailed email)

---

## 4. Trigger & Data Flow

### 4.1 What Should Trigger Email

**Primary trigger: Session completion status change**

**Current code locations:**
1. `/app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts` (lines 557-563)
   - When last round submitted, sets `status = 'completed'`

2. `/app/api/sessions/[sessionId]/force-close/route.ts` (lines 104-110)
   - Admin force-closes session, sets `status = 'completed'`

**Implementation:**
```sql
-- Migration: Add email tracking column
ALTER TABLE sessions ADD COLUMN email_sent_at TIMESTAMP;

-- Migration: Create trigger function
CREATE OR REPLACE FUNCTION notify_session_completed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if status changed to 'completed' and email not sent
  IF NEW.status = 'completed' 
     AND OLD.status != 'completed'
     AND NEW.email_sent_at IS NULL
  THEN
    -- Call edge function via pg_net or http extension
    PERFORM net.http_post(
      url := 'https://[project].supabase.co/functions/v1/send-session-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('session_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migration: Create trigger
CREATE TRIGGER on_session_completed
AFTER UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION notify_session_completed();
```

### 4.2 Ensuring Emails Send Once (No Duplicates)

**Strategy: Idempotent trigger + edge function**

1. **Trigger check**: `IF NEW.email_sent_at IS NULL THEN ...`
   - Prevents trigger from firing if email already sent

2. **Edge function check**: On receipt, verify `email_sent_at IS NULL`
   - Race condition protection if multiple triggers fire

3. **Atomic update**: Set `email_sent_at` in same transaction as email send
   ```typescript
   // In edge function
   const { error } = await adminClient
     .from('sessions')
     .update({ email_sent_at: new Date().toISOString() })
     .eq('id', sessionId)
     .is('email_sent_at', null); // Only update if NULL
   
   if (error) {
     // Another function already sent email (race condition)
     return { success: false, reason: 'already_sent' };
   }
   
   // Now send emails...
   ```

4. **Database constraint** (optional): `UNIQUE(session_id, email_type)` in `email_log` table
   - Extra safety net if logging all email sends

### 4.3 Retryable Failures

**Retry strategy: Manual retry endpoint** (recommended for MVP)

**Implementation:**
- Failed sends log to `email_log` table with `status = 'failed'`
- Admin can trigger retry via `/api/admin/emails/[sessionId]/retry`

**Why manual first:**
- ✅ Simpler than queue infrastructure
- ✅ Email failures are rare (Resend/Postmark reliable)
- ✅ Can add automatic retry later if needed

**Future: Automatic retries**
- Use `pg_cron` to check `email_log` for `status = 'failed'` and retry
- Or move to job queue (Inngest/Trigger.dev) with built-in retries

### 4.4 Future Event Reuse

**Pattern: Event-driven email system**

**Event table** (optional, for future):
```sql
CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'session_completed', 'reminder_sent', etc.
  entity_type TEXT NOT NULL, -- 'session', 'player', etc.
  entity_id UUID NOT NULL,
  triggered_at TIMESTAMP DEFAULT NOW(),
  email_sent_at TIMESTAMP,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  metadata JSONB
);
```

**For now:** Start simple (trigger → edge function → email)

**Later:** Add event table if you need:
- Audit trail of all email events
- Retry failed emails
- Manual email re-sending
- Email analytics

---

## 5. Future-Proofing

### 5.1 User Email Preferences

**Schema addition:**
```sql
ALTER TABLE auth.users 
ADD COLUMN email_preferences JSONB DEFAULT '{
  "session_complete": true,
  "session_reminder": true,
  "weekly_summary": true
}'::jsonb;
```

**Implementation:**
- Edge function checks `user.email_preferences.session_complete` before sending
- Settings page UI: Toggle email preferences
- Default: All emails enabled

**Location:** `app/settings/page.tsx` (add email preferences section)

### 5.2 Email Localization

**Current i18n:** `lib/i18n/` with `sr.ts` (Serbian)

**Email localization:**
- Store `user.locale` in `user_metadata` (if not already)
- Edge function reads locale, selects translation file
- React Email templates use `t()` function (same as app)

**Example:**
```typescript
// In edge function
const locale = user.user_metadata?.locale || 'sr';
const t = await import(`@/lib/i18n/${locale}`).then(m => m.t);

// In template
<Text>{t('emails.session_complete.subject')}</Text>
```

**Template structure:**
```
lib/i18n/
  sr.ts
    emails: {
      session_complete: {
        subject: 'Sesija završena',
        body: '...'
      }
    }
```

### 5.3 Admin-Only Emails

**Pattern: Email type + role filter**

**Implementation:**
- Edge function receives `email_type` (e.g., `'admin_alert'`)
- Query `auth.users` where `user_metadata.role = 'admin'`
- Send to all admins

**Use cases:**
- Session import errors
- System alerts
- Weekly admin summary

**Trigger:** Direct API call from admin routes (not database trigger)

### 5.4 Re-sending Past Emails

**Implementation: Manual retry endpoint**

**Endpoint:** `POST /api/admin/emails/[sessionId]/resend`

**Logic:**
1. Fetch session data (same as initial send)
2. Check `sessions.email_sent_at` exists (email was sent before)
3. Re-fetch current player stats (may have changed)
4. Send email with current data
5. Update `email_sent_at` to current timestamp

**Alternative: Event log approach**
- If `email_events` table exists, query by `session_id`
- Re-play event with current data

---

## 6. Implementation Constraints

### 6.1 Minimal Refactor Required

**What changes:**
- ✅ Add `email_sent_at` column to `sessions` (migration)
- ✅ Add database trigger (migration)
- ✅ Create edge function (new file)
- ✅ Add email service env var

**What doesn't change:**
- ❌ No changes to session completion API routes
- ❌ No changes to existing business logic
- ❌ No imports of email logic in main app

**Refactor scope:** ~2-3 files, ~200 lines of code

### 6.2 Testing Strategy

**Unit tests:**
- Edge function: Mock email service, test template rendering
- Trigger: Test SQL function logic

**Integration tests:**
- Create test session, verify trigger fires
- Verify email sent (check `email_sent_at` updated)

**Manual testing:**
- Resend preview mode (React Email dev server)
- Send test email to your address

### 6.3 Vendor Lock-in Avoidance

**Abstraction layer:**
```typescript
// lib/email/client.ts (future abstraction)
interface EmailClient {
  send(params: EmailParams): Promise<void>;
}

// Implementations: ResendClient, PostmarkClient
// Edge function uses interface, not concrete class
```

**For now:** Start with Resend directly (avoid premature abstraction)

**Later:** If switching providers, only edge function changes

---

## 7. Open Questions & Assumptions

### 7.1 Open Questions

1. **Email domain:** Do you own a domain for sending emails? (Required for Resend/Postmark)
   - If not, need to set up DNS (SPF, DKIM, DMARC)
   - Resend provides DNS setup guide

2. **Email volume:** Expected emails per session?
   - Assumption: 4-6 players per session = 4-6 emails per completion
   - If 10 sessions/day = 40-60 emails/day = ~1,200-1,800/month (within free tier)

3. **Email content priority:** What data must be in email?
   - Assumption: Elo change, wins/losses, session date
   - Need: Match-by-match results? Full session summary table?

4. **From address:** What should "From" name/email be?
   - Suggestion: `"Gweilo Elo <sessions@yourdomain.com>"`

5. **Edge function runtime:** Supabase Edge Functions use Deno
   - Need to verify Resend/Postmark SDKs work with Deno
   - Alternative: Use fetch() to email service API directly

### 7.2 Assumptions

1. **User emails exist:** All players have valid emails in `auth.users.email`
   - If not, need to handle missing emails gracefully

2. **Supabase project:** You have Supabase Edge Functions enabled
   - If not, need to enable in Supabase dashboard

3. **Email service:** Willing to use external service (not self-hosted)
   - Resend/Postmark are SaaS (not self-hosted like Mailgun on-prem)

4. **Email timing:** Emails should send immediately on session completion
   - If delay acceptable, can use cron + queue instead

5. **Language:** Primary language is Serbian (based on `sr.ts`)
   - Email templates should support Serbian first

---

## 8. Recommendations Summary

### Primary Recommendation

**Architecture:**
- Database trigger on `sessions.status` change → Supabase Edge Function → Resend API

**Email Service:**
- **Primary:** Resend (React Email templates, excellent DX)
- **Fallback:** Postmark (if need UI templates or better deliverability)

**Template Strategy:**
- Code-based React Email templates (git versioned, type-safe)

**Trigger:**
- PostgreSQL AFTER UPDATE trigger (atomic, reliable)

**Data Flow:**
- Trigger passes `session_id` → Edge function fetches data → Sends email per player

### Implementation Order

1. **Phase 1 (MVP):**
   - Add `email_sent_at` column
   - Create database trigger
   - Create edge function with Resend
   - Test with one session

2. **Phase 2 (Polish):**
   - Add email preferences to user settings
   - Add localization (Serbian)
   - Add manual retry endpoint

3. **Phase 3 (Future):**
   - Add event log table
   - Add automatic retries
   - Add admin email types

### Next Steps

1. Confirm email domain availability
2. Choose Resend or Postmark
3. Set up email service account + API key
4. Create Supabase Edge Function project structure
5. Implement trigger + edge function
6. Test with real session completion

---

**End of Audit**
