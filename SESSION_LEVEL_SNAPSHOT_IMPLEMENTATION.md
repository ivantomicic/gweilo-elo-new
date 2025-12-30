# Session-Level Snapshot Implementation Plan

## Overview

Switching to **Option A: Session-Level Elo Snapshots** where:

-   `session_rating_snapshots` stores the initial Elo state at the START of each session
-   When editing a match in Session N:
    -   Load snapshot from Session N-1 (previous completed session)
    -   If none exists, fall back to initial baseline (1500)
    -   Replay ONLY matches from Session N (current session), starting from match 1
    -   After recalculation, overwrite snapshot for Session N

## Key Changes Required

### 1. Helper Function: Get Previous Session Snapshot

**New Function:** `lib/elo/snapshots.ts`

```typescript
export async function getPreviousSessionSnapshot(
	playerId: string,
	currentSessionId: string
): Promise<{
	elo: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
} | null>;
```

**Logic:**

1. Get current session's `created_at`
2. Find most recent completed session before current session (ordered by `created_at DESC`)
3. Query `session_rating_snapshots` for that session + player
4. Return snapshot or `null` if not found

### 2. Helper Function: Update Session Snapshot

**New Function:** `lib/elo/snapshots.ts`

```typescript
export async function updateSessionSnapshot(
	sessionId: string,
	playerId: string,
	state: {
		elo: number;
		matches_played: number;
		wins: number;
		losses: number;
		draws: number;
		sets_won: number;
		sets_lost: number;
	}
);
```

**Logic:**

1. Upsert to `session_rating_snapshots` with `entity_type = 'player_singles'`
2. This overwrites the snapshot for Session N after recalculation

### 3. Edit Route Changes

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

#### 3.1 Remove Global Match Query

**Remove:**

-   Lines 188-250: Global match fetching and sorting
-   All logic that queries matches across all sessions

**Replace with:**

-   Query only matches from current session
-   Order by `round_number`, then `match_order`

#### 3.2 Replace Baseline Computation

**Remove:**

-   Lines 478-525: Full replay from start
-   Lines 527-615: Replay of all matches before edited match

**Replace with:**

-   Load snapshot from Session N-1 (previous completed session)
-   If no snapshot, use initial baseline (1500/0)
-   No replay of matches before current session

#### 3.3 Update Replay Logic

**Change:**

-   Replay only matches from current session (Session N)
-   Start from match 1 of current session
-   Replay up to and including edited match, then continue to end

#### 3.4 Update Snapshot After Recalculation

**Add:**

-   After recalculation completes, update `session_rating_snapshots` for Session N
-   This overwrites the snapshot with the final computed state

### 4. SQL Adjustments

**File:** `supabase-create-session-rating-snapshots.sql`

**No changes needed** - table structure is correct.

**Optional:** Add helper SQL function to find previous completed session:

```sql
CREATE OR REPLACE FUNCTION public.get_previous_completed_session(
    p_current_session_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_current_created_at TIMESTAMPTZ;
    v_previous_session_id UUID;
BEGIN
    -- Get current session's created_at
    SELECT created_at INTO v_current_created_at
    FROM public.sessions
    WHERE id = p_current_session_id;

    -- Find most recent completed session before current
    SELECT id INTO v_previous_session_id
    FROM public.sessions
    WHERE created_at < v_current_created_at
    AND status = 'completed'  -- Only completed sessions
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN v_previous_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Implementation Steps

### Step 1: Add Helper Functions

1. Add `getPreviousSessionSnapshot()` to `lib/elo/snapshots.ts`
2. Add `updateSessionSnapshot()` to `lib/elo/snapshots.ts`
3. (Optional) Add SQL function `get_previous_completed_session()`

### Step 2: Modify Edit Route

1. Change match query to only fetch current session matches
2. Replace baseline computation with snapshot loading
3. Update replay to only include current session matches
4. Add snapshot update after recalculation

### Step 3: Remove Global Replay Logic

1. Remove all code that queries matches globally
2. Remove all code that replays matches from previous sessions
3. Remove session ordering logic

### Step 4: Update Logging

1. Update logs to reflect session-level approach
2. Log which session snapshot was loaded
3. Log that only current session matches are replayed

## Confirmation

**Guarantee:** Editing Session N will:

-   ✅ Load baseline from Session N-1 snapshot (or 1500 if none)
-   ✅ Replay ONLY matches from Session N (current session)
-   ✅ NEVER replay matches from Sessions < N
-   ✅ Update Session N snapshot after recalculation
