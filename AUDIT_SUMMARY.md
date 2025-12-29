# Current Schema & Logic Audit Summary

## Current Database Schema

### session_matches Table

-   **Columns**: `id`, `session_id`, `round_number`, `match_type`, `match_order`, `player_ids` (JSONB), `created_at`, `team_1_id`, `team_2_id`
-   **Missing**:
    -   ❌ No `status` field (pending/completed)
    -   ❌ No `team1_score` or `team2_score` fields
    -   ❌ No RLS policy for UPDATE operations

### Elo Rating Tables

-   `player_ratings` - Singles ratings per player
-   `player_double_ratings` - Individual doubles ratings
-   `double_team_ratings` - Team doubles ratings
-   **Missing**:
    -   ❌ No match-level Elo history/audit table

## Current API Logic

### `/api/sessions/[sessionId]/matches/[matchId]/result`

-   **Current behavior**: Updates Elo directly without checking if match already processed
-   **Issues**:
    -   ❌ No duplicate prevention
    -   ❌ No score storage
    -   ❌ No transaction safety
    -   ❌ Per-match submission (not round-level)
    -   ❌ No status tracking

### Elo Update Functions (`lib/elo/updates.ts`)

-   `updateSinglesRatings()` - Calculates and updates ratings
-   `updateDoublesRatings()` - Calculates and updates ratings
-   **Issues**:
    -   ❌ No check if match was already processed
    -   ❌ No audit/history logging

## Current UI Logic

-   Scores stored in local state only (`scores` state object)
-   No submission logic connected
-   No read-only state for completed matches

## Required Changes

1. **Schema Changes**:

    - Add `status` column to `session_matches` (pending/completed)
    - Add `team1_score` and `team2_score` columns to `session_matches`
    - Create `match_elo_history` table for audit trail

2. **API Changes**:

    - Create new `/api/sessions/[sessionId]/rounds/[roundNumber]/submit` endpoint
    - Implement transactional round submission
    - Add duplicate prevention logic

3. **UI Changes**:
    - Connect "Next" button to submission API
    - Add read-only state for completed rounds
    - Show confirmation modal before submission
