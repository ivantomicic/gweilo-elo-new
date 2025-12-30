# Match Edit & Elo Replay System - Audit Report

## 1. Current Database Schema

### 1.1 Match Results & Status

**Table: `session_matches`**
- **Columns:**
  - `id` (UUID, PK)
  - `session_id` (UUID, FK → sessions)
  - `round_number` (INTEGER) - Determines match order across rounds
  - `match_type` (TEXT: 'singles' | 'doubles')
  - `match_order` (INTEGER) - Order within a round (0-indexed)
  - `player_ids` (JSONB) - Array of player UUIDs
  - `team_1_id` (UUID, nullable, FK → double_teams)
  - `team_2_id` (UUID, nullable, FK → double_teams)
  - `status` (TEXT: 'pending' | 'completed') - Added in `supabase-add-match-status-and-scores.sql`
  - `team1_score` (INTEGER, nullable) - Added in `supabase-add-match-status-and-scores.sql`
  - `team2_score` (INTEGER, nullable) - Added in `supabase-add-match-status-and-scores.sql`
  - `video_url` (TEXT, nullable) - Added in `supabase-add-youtube-url-to-matches.sql`
  - `created_at` (TIMESTAMPTZ)
- **Unique Constraint:** `(session_id, round_number, match_order)`
- **Match Ordering:** `ORDER BY round_number ASC, match_order ASC` (deterministic)

### 1.2 Elo Rating Tables

**Table: `player_ratings`** (Singles)
- `player_id` (UUID, PK, FK → auth.users)
- `elo` (INTEGER, default 1500)
- `matches_played` (INTEGER)
- `wins`, `losses`, `draws` (INTEGER)
- `sets_won`, `sets_lost` (INTEGER)
- `updated_at` (TIMESTAMPTZ)

**Table: `player_double_ratings`** (Individual Doubles)
- `player_id` (UUID, PK, FK → auth.users)
- `elo` (INTEGER, default 1500)
- `matches_played` (INTEGER)
- `wins`, `losses`, `draws` (INTEGER)
- `sets_won`, `sets_lost` (INTEGER)
- `updated_at` (TIMESTAMPTZ)

**Table: `double_team_ratings`** (Team Doubles)
- `team_id` (UUID, PK, FK → double_teams)
- `elo` (INTEGER, default 1500)
- `matches_played` (INTEGER)
- `wins`, `losses`, `draws` (INTEGER)
- `sets_won`, `sets_lost` (INTEGER)
- `updated_at` (TIMESTAMPTZ)

### 1.3 Elo History

**Table: `match_elo_history`**
- `id` (UUID, PK)
- `match_id` (UUID, FK → session_matches, **UNIQUE**)
- **Singles fields:**
  - `player1_id`, `player2_id` (UUID, FK → auth.users)
  - `player1_elo_before`, `player1_elo_after`, `player1_elo_delta` (INTEGER)
  - `player2_elo_before`, `player2_elo_after`, `player2_elo_delta` (INTEGER)
- **Doubles fields:**
  - `team1_id`, `team2_id` (UUID, FK → double_teams)
  - `team1_elo_before`, `team1_elo_after`, `team1_elo_delta` (INTEGER)
  - `team2_elo_before`, `team2_elo_after`, `team2_elo_delta` (INTEGER)
- `created_at` (TIMESTAMPTZ)
- **Critical:** `UNIQUE(match_id)` constraint prevents duplicate processing

### 1.4 Session Status

**Table: `sessions`**
- `id` (UUID, PK)
- `player_count` (INTEGER)
- `created_by` (UUID, FK → auth.users)
- `status` (TEXT: 'active' | 'completed') - Added in `supabase-add-session-status.sql`
- `completed_at` (TIMESTAMPTZ, nullable) - Added in `supabase-add-session-status.sql`
- `created_at` (TIMESTAMPTZ)

## 2. Duplicate Match Submission Prevention

### Current Mechanisms

1. **Database-level:** `match_elo_history` has `UNIQUE(match_id)` constraint
   - Prevents duplicate Elo history records
   - Location: `supabase-create-match-elo-history.sql:43`

2. **Application-level:** Match status check
   - Matches must be `status = 'pending'` before processing
   - Location: `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts:163-170`
   - If any match is already `'completed'`, submission is rejected with 409 Conflict

3. **Round-level submission:** All matches in a round are processed together
   - Prevents partial round submissions
   - Location: `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`

## 3. Elo Update Functions

### Location: `lib/elo/updates.ts`

**Functions:**
- `updateSinglesRatings(player1Id, player2Id, player1Score, player2Score)`
  - Updates `player_ratings` for both players
  - Uses `upsert_player_rating` RPC function
  - Calculates Elo delta using `calculateEloDelta()` from `lib/elo/calculation.ts`

- `updateDoublesRatings(team1PlayerIds, team2PlayerIds, team1Score, team2Score)`
  - Updates `double_team_ratings` for both teams
  - Updates `player_double_ratings` for all 4 players (same delta as team)
  - Uses `upsert_double_team_rating` and `upsert_player_double_rating` RPC functions

**Current Behavior:**
- Functions directly update ratings (no return value)
- No check if match was already processed
- No transaction safety (each function is independent)

## 4. Match Ordering for Replay

**Deterministic Order:**
```sql
ORDER BY round_number ASC, match_order ASC
```

**Implementation:**
- `round_number`: Integer, determines order across rounds
- `match_order`: Integer (0-indexed), determines order within a round
- Used in: `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts:153`

**For Replay:**
- All matches in a session must be fetched and sorted by this order
- Replay starts from the edited match and continues sequentially

## 5. Tables That Must Be Reset During Replay

When editing a match at position N, all matches from N onward must be recalculated:

### 5.1 Rating Tables (Must Restore from Snapshot)
- `player_ratings` - Restore Elo, matches_played, wins, losses, draws, sets_won, sets_lost
- `player_double_ratings` - Restore Elo, matches_played, wins, losses, draws, sets_won, sets_lost
- `double_team_ratings` - Restore Elo, matches_played, wins, losses, draws, sets_won, sets_lost

### 5.2 History Table (Must Delete)
- `match_elo_history` - Delete all records for matches from position N onward
  - Use: `DELETE FROM match_elo_history WHERE match_id IN (SELECT id FROM session_matches WHERE ...)`

### 5.3 Match Table (Must Reset Status)
- `session_matches` - Reset `status = 'pending'` and clear scores for matches from position N onward
  - Set `team1_score = NULL`, `team2_score = NULL`, `status = 'pending'`

## 6. Current API Endpoints

### `/api/sessions/[sessionId]/rounds/[roundNumber]/submit` (POST)
- **Purpose:** Submit all matches in a round
- **Flow:**
  1. Validates all matches are pending
  2. Processes matches sequentially
  3. Updates Elo ratings
  4. Inserts Elo history
  5. Updates match scores and status
- **Location:** `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`

### `/api/sessions/[sessionId]/matches/[matchId]/result` (POST)
- **Purpose:** Legacy per-match submission (may be deprecated)
- **Location:** `app/api/sessions/[sessionId]/matches/[matchId]/result/route.ts`

## 7. Missing Features for Edit & Replay

### Required Additions:

1. **`session_matches` table:**
   - ❌ `is_edited` (boolean)
   - ❌ `edited_at` (timestamptz)
   - ❌ `edited_by` (uuid, FK → auth.users)
   - ❌ `edit_reason` (text)

2. **`sessions` table:**
   - ❌ `recalc_status` (text: 'idle' | 'running' | 'failed' | 'done')
   - ❌ `recalc_started_at` (timestamptz)
   - ❌ `recalc_finished_at` (timestamptz)
   - ❌ `recalc_token` (uuid)

3. **New table: `session_rating_snapshots`**
   - ❌ Store initial Elo state when session starts
   - Required for deterministic replay

4. **New API endpoint:**
   - ❌ `POST /api/sessions/[sessionId]/matches/[matchId]/edit`
   - Must handle lock acquisition, reset, and replay

5. **UI components:**
   - ❌ Edit match drawer
   - ❌ Progress notifications (Sonner)
   - ❌ Disable edits during recalculation

## 8. Critical Constraints

1. **Sequential Processing:** Matches MUST be processed in order (`round_number`, `match_order`)
2. **No Parallel Recalculation:** Lock mechanism prevents concurrent edits
3. **Idempotency:** Second request during recalculation must return 409
4. **Transaction Safety:** If replay fails, must leave `recalc_status = 'failed'`
5. **Baseline Restoration:** Elo state must be restored from `session_rating_snapshots` before replay

