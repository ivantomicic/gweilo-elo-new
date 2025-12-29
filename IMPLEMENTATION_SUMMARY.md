# Round Submission Implementation Summary

## Audit Summary

### Current Schema State

-   ✅ `session_matches` table exists with: `id`, `session_id`, `round_number`, `match_type`, `match_order`, `player_ids`, `team_1_id`, `team_2_id`, `created_at`
-   ❌ Missing: `status` column (pending/completed)
-   ❌ Missing: `team1_score` and `team2_score` columns
-   ❌ Missing: UPDATE RLS policy
-   ❌ Missing: `match_elo_history` table for audit trail

### Current Logic State

-   ✅ Elo calculation functions exist (`lib/elo/updates.ts`)
-   ❌ No duplicate prevention for match processing
-   ❌ No score storage
-   ❌ No round-level submission (only per-match endpoint exists)
-   ❌ No transaction safety

## Schema Changes

### 1. Add Match Status and Scores (`supabase-add-match-status-and-scores.sql`)

-   Adds `status` column (pending/completed) with CHECK constraint
-   Adds `team1_score` and `team2_score` columns (nullable)
-   Adds index on `(session_id, status)` for efficient filtering
-   Adds UPDATE RLS policy for session owners

### 2. Create Elo History Table (`supabase-create-match-elo-history.sql`)

-   Creates `match_elo_history` table for audit trail
-   Stores Elo deltas per match (singles: player1/player2, doubles: team1/team2)
-   UNIQUE constraint on `match_id` prevents duplicate processing
-   Indexes for performance
-   RLS policy for read access

## API Implementation

### New Endpoint: `/api/sessions/[sessionId]/rounds/[roundNumber]/submit`

**Functionality:**

1. Validates all matches have scores
2. Ensures all matches are still pending (prevents duplicate submission)
3. Updates Elo ratings for each match
4. Stores Elo history records
5. Updates match scores and status to "completed"
6. Returns success/error

**Transaction Safety:**

-   Uses admin client for batch operations
-   Processes matches sequentially within the same request
-   Elo history insert uses UNIQUE constraint to prevent duplicates at DB level
-   Match status check prevents re-processing

**Note:** Full PostgreSQL transaction wrapping would require using Supabase's RPC functions or database functions. Current implementation provides application-level transaction safety through sequential processing and status checks.

## UI Implementation

### Changes to `app/session/[id]/page.tsx`

1. **State Management:**

    - Added `submitting` state for loading indicator
    - Added `showConfirmModal` state for confirmation dialog
    - Initialize scores from completed matches on load

2. **Round Completion Detection:**

    - `isCurrentRoundCompleted` - checks if all matches have status "completed"
    - `canSubmitRound` - checks if all matches have scores entered

3. **Submission Logic:**

    - `handleSubmitRound()` - calls API endpoint with match scores
    - `handleNextClick()` - shows confirmation modal if round can be submitted, otherwise navigates

4. **Read-Only State:**

    - Match inputs are disabled/read-only when `match.status === "completed"`
    - Scores are loaded from database for completed matches

5. **Confirmation Modal:**
    - Simple inline modal (no external dependencies)
    - Shows before submitting round
    - Prevents accidental submissions

## Safety Features

1. **Database-Level Duplicate Prevention:**

    - UNIQUE constraint on `match_elo_history.match_id`
    - Status check before processing (matches must be "pending")

2. **Application-Level Validation:**

    - All matches must have scores before submission
    - All matches must be pending before submission
    - User must own the session

3. **UI-Level Safety:**
    - Read-only inputs for completed matches
    - Confirmation modal before submission
    - Loading states during submission

## Migration Order

Run SQL scripts in this order:

1. `supabase-add-match-status-and-scores.sql`
2. `supabase-create-match-elo-history.sql`

## Future Improvements

-   Consider using PostgreSQL stored procedures for true transaction safety
-   Add retry logic for transient failures
-   Add match result validation (e.g., scores must be >= 0)
-   Consider adding `submitted_at` timestamp for audit
