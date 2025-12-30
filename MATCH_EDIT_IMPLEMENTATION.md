# Match Edit & Elo Replay Implementation Summary

## Overview

This implementation adds the ability to edit match results on the session results page (`/sessions/[id]`), with automatic Elo recalculation for all subsequent matches.

## Database Migrations

### 1. `supabase-add-match-edit-fields.sql`
Adds edit tracking fields to `session_matches`:
- `is_edited` (boolean)
- `edited_at` (timestamptz)
- `edited_by` (uuid, FK → auth.users)
- `edit_reason` (text)

### 2. `supabase-create-session-rating-snapshots.sql`
Creates `session_rating_snapshots` table to store initial Elo state:
- Stores Elo ratings and stats for all entities (players, teams) at session start
- Used to restore baseline before replaying matches
- **Important:** Snapshots must be created when a session starts (before first match)

### 3. `supabase-add-session-recalc-lock.sql`
Adds recalculation lock fields to `sessions`:
- `recalc_status` (text: 'idle' | 'running' | 'failed' | 'done')
- `recalc_started_at` (timestamptz)
- `recalc_finished_at` (timestamptz)
- `recalc_token` (uuid) - prevents race conditions

## API Endpoint

### `POST /api/sessions/[sessionId]/matches/[matchId]/edit`

**Flow:**
1. Authenticates and authorizes user (must own session)
2. Acquires lock atomically (returns 409 if already running)
3. Updates edited match with new scores and edit metadata
4. Deletes Elo history for all matches from edited match onward
5. Restores Elo state from `session_rating_snapshots`
6. Resets match statuses to 'pending' for matches to be replayed
7. Replays all matches sequentially (strict order: `round_number`, `match_order`)
8. Updates Elo ratings and creates history records
9. Releases lock (sets `recalc_status = 'done'` or `'failed'`)

**Request Body:**
```json
{
  "team1Score": number,
  "team2Score": number,
  "reason": string (optional)
}
```

**Response:**
- `200 OK`: Success
- `409 Conflict`: Recalculation already in progress
- `401/403`: Unauthorized
- `500`: Internal error

## UI Components

### `EditMatchDrawer` (`app/session/[id]/_components/edit-match-drawer.tsx`)
- Drawer component for editing match results
- Shows team/player info, score inputs, optional reason field
- Displays warning about Elo recalculation

### Session Page Integration
- Edit button appears on completed matches (top-right corner)
- Button disabled when `recalc_status === 'running'`
- Sonner toast notifications:
  - Loading: "Recalculating session..."
  - Success: "Session recalculated successfully"
  - Error: "Failed to edit match" / "Recalculation failed"
- Auto-reloads page after successful recalculation

## Critical Implementation Details

### Match Ordering
Matches are ordered deterministically:
```sql
ORDER BY round_number ASC, match_order ASC
```

### Sequential Processing
- Matches MUST be processed one at a time (no `Promise.all`)
- Each match updates Elo before the next match reads current state
- Ensures correct Elo calculations

### Lock Mechanism
- Atomic check-and-set prevents concurrent recalculations
- Uses `recalc_token` for additional safety
- Second request during recalculation returns 409 Conflict

### Elo Restoration
- All rating tables restored from snapshots:
  - `player_ratings` (singles)
  - `player_double_ratings` (individual doubles)
  - `double_team_ratings` (team doubles)
- Snapshots must exist before editing (created at session start)

## Missing Feature: Snapshot Creation

**Important:** The `session_rating_snapshots` table is created, but snapshots are not automatically created when sessions start. This must be added to the session creation flow.

**Required:** Add snapshot creation to `/api/sessions` POST endpoint:
1. After session is created
2. Before first match is processed
3. Capture current Elo state for all session players/teams

## Testing Checklist

- [ ] Edit middle match → verify all following matches recalc
- [ ] Verify no duplicate Elo history entries
- [ ] Verify lock prevents parallel edits (try two simultaneous requests)
- [ ] Verify Elo calculations are correct after edit
- [ ] Verify match statuses are reset correctly
- [ ] Verify UI shows progress notifications
- [ ] Verify edit button disabled during recalculation
- [ ] Verify page reloads after successful recalculation

## Migration Order

Run SQL migrations in this order:
1. `supabase-add-match-edit-fields.sql`
2. `supabase-create-session-rating-snapshots.sql`
3. `supabase-add-session-recalc-lock.sql`

## Future Improvements

1. **Snapshot Creation:** Automate snapshot creation at session start
2. **Progress Updates:** Add WebSocket/SSE for real-time progress (Round X / Y)
3. **Batch Edits:** Allow editing multiple matches at once
4. **Undo:** Add ability to revert edits
5. **Audit Log:** Track all edit history with timestamps

