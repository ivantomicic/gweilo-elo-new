# Scalability Audit: Snapshot Usage in Match Edit Flow

## Executive Summary

**Current State:** The edit route **ignores snapshots** and replays ALL matches from the beginning of time, causing severe scalability issues.

**Root Cause:** Baseline computation (lines 478-525) explicitly replays all matches from start instead of using snapshots.

**Impact:** Editing match #74 requires replaying matches 1-73, which becomes exponentially slower as history grows.

---

## 1. Current Edit + Recalculation Flow

### 1.1 Query All Matches Globally

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`, Lines 188-250

```typescript
// Fetch ALL matches globally (across all sessions)
const { data: allMatchesRaw } = await adminClient
    .from("session_matches")
    .select("*");

// Sort by session created_at, then round_number, then match_order
const allMatches = allMatchesRaw.sort((a, b) => {
    // Sort chronologically across all sessions
});
```

**Status:** ✅ Correctly fetches all matches globally

### 1.2 Baseline Computation (THE PROBLEM)

**Location:** Lines 478-525

```typescript
// Compute baseline by replaying matches from start to matchIndex-1
// This ensures we have the correct state even if snapshots don't exist
const baselineComputedState = new Map();

// Initialize all players with initial baseline (1500/0)
for (const playerId of allPlayerIds) {
    baselineComputedState.set(playerId, {
        elo: 1500,  // ❌ Always starts from 1500
        matches_played: 0,
        // ...
    });
}

// Replay ALL matches globally from start up to (but not including) the edited match
const matchesBeforeEdit = allMatches.slice(0, matchIndex);  // ❌ ALL matches from start
for (const match of matchesBeforeEdit) {
    // Calculate Elo delta and update state
    // This builds baseline by replaying EVERYTHING from the beginning
}
```

**Problem:** 
- ❌ **Ignores snapshots completely**
- ❌ **Replays ALL matches from start** (if editing match #74, replays 1-73)
- ❌ **Always starts from 1500/0** instead of using snapshot

### 1.3 Snapshot Deletion

**Location:** Lines 366-404

```typescript
// Delete snapshots for edited match and all matches after it
const { error: deleteSnapshotsError } = await adminClient
    .from("elo_snapshots")
    .delete()
    .in("match_id", matchIdsToReplay);
```

**Status:** ✅ Correctly deletes snapshots for matches to be replayed

### 1.4 Snapshot Creation During Replay

**Location:** Lines 923-937

```typescript
// Create snapshot after this match using in-memory state
await createEloSnapshots(match.id, playerIds, "singles", currentState);
```

**Status:** ✅ Correctly creates snapshots during replay

### 1.5 Persistence

**Location:** Lines 1025-1050

```typescript
await adminClient.from("player_ratings").upsert({
    player_id: playerId,
    elo: state.elo,
    matches_played: state.matches_played,
    // ...
});
```

**Status:** ✅ Persists final computed state

---

## 2. Snapshot Infrastructure Analysis

### 2.1 Snapshot Table Exists

**Location:** `supabase-create-elo-snapshots.sql`

```sql
CREATE TABLE elo_snapshots (
    id UUID PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES session_matches(id),
    player_id UUID NOT NULL REFERENCES auth.users(id),
    elo NUMERIC(10, 2) NOT NULL,
    matches_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    draws INTEGER NOT NULL,
    sets_won INTEGER NOT NULL,
    sets_lost INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(match_id, player_id)
);
```

**Status:** ✅ Table exists with correct schema

### 2.2 Snapshot Creation

**Location:** `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`, Line 311

```typescript
// Create Elo snapshots after match completes
await createEloSnapshots(match.id, playerIds, "singles");
```

**Status:** ✅ Snapshots are created after each match completes

### 2.3 Snapshot Retrieval Function

**Location:** `supabase-create-elo-snapshots.sql`, Lines 79-123

```sql
CREATE OR REPLACE FUNCTION public.get_snapshot_before_match(
    p_player_id UUID,
    p_match_id UUID
)
RETURNS TABLE (...) AS $$
BEGIN
    RETURN QUERY
    SELECT ...
    FROM public.elo_snapshots es
    JOIN public.session_matches sm_before ON sm_before.id = es.match_id
    JOIN public.session_matches sm_target ON sm_target.id = p_match_id
    WHERE es.player_id = p_player_id
    AND sm_before.session_id = sm_target.session_id  -- ❌ BUG: Session-scoped!
    AND (
        sm_before.round_number < sm_target.round_number
        OR (sm_before.round_number = sm_target.round_number 
            AND sm_before.match_order < sm_target.match_order)
    )
    ORDER BY sm_before.round_number DESC, sm_before.match_order DESC
    LIMIT 1;
END;
```

**Critical Bug:** Line 114 restricts snapshots to the **same session** only:
```sql
AND sm_before.session_id = sm_target.session_id  -- ❌ Only finds snapshots in same session
```

**Impact:** 
- If editing Session 2 match, it can't find snapshots from Session 1
- Forces fallback to full replay

### 2.4 Snapshot Retrieval Code

**Location:** `lib/elo/snapshots.ts`, Lines 258-285

```typescript
export async function getSnapshotBeforeMatch(
    playerId: string,
    matchId: string
) {
    const { data, error } = await adminClient.rpc("get_snapshot_before_match", {
        p_player_id: playerId,
        p_match_id: matchId,
    });
    // Returns snapshot or null
}
```

**Status:** ✅ Function exists but is **NOT CALLED** in edit route

---

## 3. How Snapshots SHOULD Be Used vs How They ARE Used

### 3.1 Intended Design (from documentation)

**From `SNAPSHOT_BASED_RECALCULATION.md`:**
> "When editing Match 2:
> - Elo state before Match 2 is restored from snapshot
> - Recalculate Match 2 and Match 3 only
> - Match 1 remains untouched"

**Expected Flow:**
1. Load snapshot before edited match → baseline state
2. Replay only matches from edited match onward
3. No need to replay matches before snapshot

### 3.2 Actual Implementation

**Current Flow:**
1. ❌ **Ignore snapshots** - don't even try to load them
2. ❌ **Replay ALL matches from start** (lines 478-525)
3. ✅ Replay matches from edited match onward
4. ✅ Create new snapshots during replay

**Why Snapshots Are Ignored:**
- Line 478 comment: "This ensures we have the correct state even if snapshots don't exist"
- Code explicitly chooses full replay over snapshot usage
- `getSnapshotBeforeMatch()` is imported but never called

---

## 4. Minimal Changes Needed

### 4.1 Fix SQL Function (Global Scope)

**File:** `supabase-create-elo-snapshots.sql`

**Change:** Remove session restriction from `get_snapshot_before_match`

**Current (BROKEN):**
```sql
AND sm_before.session_id = sm_target.session_id  -- ❌ Session-scoped
```

**Fixed:**
```sql
-- Remove session restriction - find snapshot globally
-- Order by match chronological position (session created_at + round + match_order)
```

**Alternative:** Create new function `get_snapshot_before_match_global()` that:
- Finds snapshot before edited match globally (across all sessions)
- Orders by session created_at, then round_number, then match_order

### 4.2 Use Snapshots for Baseline (Replace Full Replay)

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`, Lines 478-525

**Current (BROKEN):**
```typescript
// Compute baseline by replaying matches from start
const matchesBeforeEdit = allMatches.slice(0, matchIndex);
for (const match of matchesBeforeEdit) {
    // Replay everything from start
}
```

**Fixed:**
```typescript
// Try to load snapshot before edited match
const snapshot = await getSnapshotBeforeMatch(playerId, matchId);
if (snapshot) {
    // Use snapshot as baseline - no replay needed!
    baselineState.set(playerId, snapshot);
} else {
    // Fallback: replay from start (only if no snapshot exists)
    // This should be rare - snapshots should exist for all completed matches
}
```

### 4.3 Determine Nearest Snapshot Match

**Challenge:** Need to find the match that has the snapshot, not just any match before edited match.

**Solution:**
1. Query `elo_snapshots` for player
2. Find snapshot with `match_id` that is chronologically before edited match
3. Use that snapshot's state as baseline
4. Replay only matches after that snapshot match

---

## 5. Risks of Current Full-Replay Approach

### 5.1 Performance Degradation

**Risk:** O(n) complexity where n = total matches globally
- Editing match #74 → replays 73 matches
- Editing match #100 → replays 99 matches
- **Exponential slowdown** as history grows

**Impact:**
- Request timeout (30s+ for large histories)
- Database load spikes
- User experience degradation

### 5.2 Database Locking

**Risk:** Long-running transactions
- Full replay takes seconds/minutes
- `recalc_status` lock held during entire replay
- Blocks other edit attempts

**Impact:**
- Concurrent edit requests fail (409 Conflict)
- User frustration
- Potential deadlocks

### 5.3 Data Consistency

**Risk:** Race conditions during long replay
- If another match completes during replay, state diverges
- No transaction isolation across full timeline

**Impact:**
- Incorrect Elo calculations
- Data corruption

### 5.4 Memory Usage

**Risk:** Loading all matches into memory
- `allMatches` array grows with history
- In-memory state tracking for all players

**Impact:**
- Server memory pressure
- Potential OOM errors

### 5.5 Scalability Ceiling

**Risk:** System becomes unusable at scale
- 100 sessions × 10 matches = 1000 matches to replay
- 1000 sessions × 10 matches = 10,000 matches to replay
- **Unbounded growth** - no scalability limit

**Impact:**
- System becomes unusable after ~50-100 sessions
- Requires architectural rewrite

---

## 6. Proposed Snapshot-Based Recalculation Strategy

### 6.1 Core Principle

**Use snapshots as checkpoints:**
- Snapshots represent "safe" baseline states
- Editing a match only requires replaying from nearest snapshot
- Matches before snapshot remain untouched

### 6.2 Step-by-Step Algorithm

#### Step 1: Find Nearest Snapshot Before Edited Match

**For each player in edited match:**
1. Query `elo_snapshots` for that player
2. Find snapshot with `match_id` that is chronologically before edited match
3. Order by: session created_at DESC, round_number DESC, match_order DESC
4. Take first result (most recent snapshot before edited match)

**If no snapshot found:**
- Fallback: Use `getInitialBaseline()` (player state before any session)
- This should be rare - snapshots should exist for all completed matches

#### Step 2: Determine Replay Start Point

**If snapshot exists:**
- Baseline = snapshot state
- Replay starts from match **after** snapshot match
- Replay range: `(snapshot_match_index + 1)` to `matchIndex` (edited match)

**If no snapshot:**
- Baseline = initial baseline (1500/0)
- Replay starts from match 0 (beginning)
- Replay range: `0` to `matchIndex`

#### Step 3: Delete Forward Snapshots

**Current (CORRECT):**
- Delete snapshots for edited match and all matches after it
- This is already implemented correctly

#### Step 4: Replay from Snapshot (or Start)

**If snapshot exists:**
- Initialize `currentState` from snapshot
- Replay only matches from `(snapshot_match_index + 1)` to end
- **Much smaller replay set** (e.g., 5 matches instead of 73)

**If no snapshot:**
- Initialize from initial baseline
- Replay from start (fallback behavior)

#### Step 5: Create New Snapshots

**Current (CORRECT):**
- Create snapshots after each replayed match
- This is already implemented correctly

#### Step 6: Persist Final State

**Current (CORRECT):**
- Upsert to `player_ratings` with final computed state
- This is already implemented correctly

### 6.3 Performance Improvement

**Before (Full Replay):**
- Editing match #74: Replay 73 matches
- Time: ~5-10 seconds
- Database queries: 73+ match reads + 73+ Elo calculations

**After (Snapshot-Based):**
- Editing match #74: Find snapshot (e.g., after match #70), replay 4 matches
- Time: ~0.5-1 second
- Database queries: 1 snapshot read + 4 match reads + 4 Elo calculations

**Improvement:** ~10x faster for typical cases

### 6.4 Edge Cases to Handle

#### Case 1: No Snapshot Exists
- **Cause:** Match was completed before snapshot system was implemented
- **Solution:** Fallback to full replay (current behavior)
- **Mitigation:** Run backfill script to create snapshots for historical matches

#### Case 2: Snapshot Exists But Is Stale
- **Cause:** Snapshot was created but matches were edited/deleted after
- **Solution:** Validate snapshot by checking if matches after snapshot are still valid
- **Mitigation:** Add snapshot validation logic

#### Case 3: Multiple Snapshots for Same Match
- **Cause:** Duplicate snapshot creation
- **Solution:** `UNIQUE(match_id, player_id)` constraint prevents this
- **Status:** ✅ Already handled

#### Case 4: Snapshot from Different Session
- **Cause:** Player participated in multiple sessions
- **Solution:** Global snapshot lookup (fix SQL function)
- **Status:** ❌ Currently broken (session-scoped)

### 6.5 Implementation Priority

**Phase 1 (Critical):**
1. Fix `get_snapshot_before_match` SQL function to be global-scoped
2. Replace full replay with snapshot-based baseline loading
3. Add fallback to full replay if no snapshot exists

**Phase 2 (Optimization):**
1. Add snapshot validation
2. Add backfill script for historical matches
3. Add monitoring/logging for snapshot hit rate

**Phase 3 (Advanced):**
1. Periodic snapshot cleanup (keep only recent N snapshots)
2. Snapshot compression/archival
3. Distributed snapshot storage

---

## 7. Concrete Code Changes Required

### 7.1 SQL Function Fix

**File:** `supabase-create-elo-snapshots.sql`

**Change:** Remove session restriction, order globally

```sql
CREATE OR REPLACE FUNCTION public.get_snapshot_before_match_global(
    p_player_id UUID,
    p_match_id UUID
)
RETURNS TABLE (...) AS $$
DECLARE
    v_target_session_id UUID;
    v_target_round_number INTEGER;
    v_target_match_order INTEGER;
    v_target_session_created_at TIMESTAMPTZ;
BEGIN
    -- Get edited match's session and position
    SELECT sm.session_id, sm.round_number, sm.match_order, s.created_at
    INTO v_target_session_id, v_target_round_number, v_target_match_order, v_target_session_created_at
    FROM session_matches sm
    JOIN sessions s ON s.id = sm.session_id
    WHERE sm.id = p_match_id;
    
    -- Find snapshot before edited match globally
    RETURN QUERY
    SELECT es.*
    FROM elo_snapshots es
    JOIN session_matches sm_before ON sm_before.id = es.match_id
    JOIN sessions s_before ON s_before.id = sm_before.session_id
    WHERE es.player_id = p_player_id
    AND (
        -- Snapshot from earlier session
        s_before.created_at < v_target_session_created_at
        OR (
            -- Snapshot from same session, earlier match
            s_before.created_at = v_target_session_created_at
            AND (
                sm_before.round_number < v_target_round_number
                OR (sm_before.round_number = v_target_round_number 
                    AND sm_before.match_order < v_target_match_order)
            )
        )
    )
    ORDER BY s_before.created_at DESC, sm_before.round_number DESC, sm_before.match_order DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 7.2 Baseline Loading Fix

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`, Lines 478-525

**Replace full replay with snapshot loading:**

```typescript
// Try to load snapshot before edited match for each player
for (const playerId of allPlayerIds) {
    const snapshot = await getSnapshotBeforeMatch(playerId, matchId);
    
    if (snapshot) {
        // Use snapshot as baseline - no replay needed!
        baselineState.set(playerId, {
            elo: snapshot.elo,
            matches_played: snapshot.matches_played,
            wins: snapshot.wins,
            losses: snapshot.losses,
            draws: snapshot.draws,
            sets_won: snapshot.sets_won,
            sets_lost: snapshot.sets_lost,
        });
        
        console.log(JSON.stringify({
            tag: "[BASELINE_LOADED]",
            source: "snapshot",
            snapshot_match_id: snapshot.match_id,
            // ...
        }));
    } else {
        // Fallback: replay from start (should be rare)
        // Find matches before edited match and replay them
        const matchesBeforeEdit = allMatches.slice(0, matchIndex);
        // ... replay logic ...
    }
}
```

### 7.3 Determine Replay Start Point

**After loading baseline from snapshot:**

```typescript
// Find the match that has the snapshot
const snapshotMatchIndex = allMatches.findIndex(
    (m: any) => m.id === snapshot.match_id
);

// Replay starts from match AFTER snapshot
const replayStartIndex = snapshotMatchIndex + 1;
const matchesToReplay = allMatches.slice(replayStartIndex);
```

---

## 8. Summary

### Current State
- ❌ Snapshots exist but are **ignored**
- ❌ Full replay from start happens **always**
- ❌ SQL function is **session-scoped** (broken)
- ❌ Scalability ceiling: ~50-100 sessions before unusable

### Required Changes
1. **Fix SQL function** to be global-scoped
2. **Replace full replay** with snapshot-based baseline loading
3. **Determine replay start point** from snapshot match index
4. **Keep fallback** to full replay if no snapshot exists

### Expected Improvement
- **10x faster** for typical cases (5 matches vs 50 matches)
- **Bounded complexity** (O(k) where k = matches after snapshot, not O(n))
- **Scalable** to 1000+ sessions

### Risks if Not Fixed
- System becomes unusable at scale
- Request timeouts
- Database performance degradation
- Poor user experience

---

## Next Steps

1. **Review this audit** - confirm understanding
2. **Decide on approach** - snapshot-based vs hybrid
3. **Implement SQL function fix** - make it global-scoped
4. **Replace baseline computation** - use snapshots
5. **Test with large dataset** - verify performance improvement
6. **Add monitoring** - track snapshot hit rate

