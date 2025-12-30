# Global Elo Overwrite Bug - Fix Summary

## Root Cause

**The Bug:** When editing a match in Session 2, `player_ratings` was overwritten with only Session 2's totals, losing all matches from Session 1.

**Exact Locations:**
1. **Line 189 (OLD):** `.eq("session_id", sessionId)` - Only fetched matches from current session
2. **Line 441 (OLD):** `allMatches.slice(0, matchIndex)` - Baseline only included current session matches
3. **Line 286 (OLD):** `allMatches.slice(matchIndex)` - Replay only included current session matches
4. **Line 894-900 (OLD):** `upsert` overwrote global totals with session-only totals

## The Fix

**Implemented Option B: Full Historical Replay**

### 1. Query ALL Matches Globally (Lines 188-250)

**Before:**
```typescript
.from("session_matches")
.select("*")
.eq("session_id", sessionId)  // ❌ Only current session
```

**After:**
```typescript
// Fetch all sessions for ordering
const { data: allSessions } = await adminClient
    .from("sessions")
    .select("id, created_at")
    .order("created_at", { ascending: true });

// Fetch ALL matches globally
const { data: allMatchesRaw } = await adminClient
    .from("session_matches")
    .select("*");

// Sort by session created_at, then round_number, then match_order
const allMatches = allMatchesRaw.sort((a, b) => {
    // Sort by session creation time, then round/match order
});
```

### 2. Baseline Computation Includes All Previous Sessions (Lines 439-515)

**Before:**
```typescript
const matchesBeforeEdit = allMatches.slice(0, matchIndex);
// Only included matches from current session before edited match
```

**After:**
```typescript
const matchesBeforeEdit = allMatches.slice(0, matchIndex);
// Now includes ALL matches globally before edited match (from all sessions)
```

### 3. Replay Includes All Future Sessions (Line 286)

**Before:**
```typescript
const matchesToReplay = allMatches.slice(matchIndex);
// Only included matches from current session after edited match
```

**After:**
```typescript
const matchesToReplay = allMatches.slice(matchIndex);
// Now includes ALL matches globally after edited match (from all sessions)
```

### 4. Guardrails Added (Lines 950-1000)

**Guardrail 1: Prevent matches_played from decreasing**
```typescript
if (state.matches_played < beforeMatchesPlayed) {
    // Abort with error - prevents data corruption
    return NextResponse.json({ error: "matches_played would decrease" }, { status: 500 });
}
```

**Guardrail 2: Reconciliation check**
```typescript
// Verify computed match counts match DB counts
const { count: dbMatchCount } = await adminClient
    .from("session_matches")
    .select("*", { count: "exact", head: true })
    .eq("status", "completed")
    .contains("player_ids", [playerId])
    .eq("match_type", "singles");

if (state.matches_played !== dbMatchCount) {
    // Log warning for investigation
}
```

## Verification SQL Query

Run this after editing a match to verify totals:

```sql
-- Per-player totals from player_ratings
SELECT 
    pr.player_id,
    pr.elo,
    pr.matches_played as pr_matches_played,
    pr.wins,
    pr.losses,
    pr.draws,
    -- Count actual completed matches in DB
    (
        SELECT COUNT(*)
        FROM session_matches sm
        WHERE sm.status = 'completed'
        AND sm.match_type = 'singles'
        AND sm.player_ids @> ARRAY[pr.player_id]::uuid[]
    ) as db_match_count
FROM player_ratings pr
WHERE pr.player_id IN (
    SELECT DISTINCT unnest(player_ids) 
    FROM session_matches 
    WHERE session_id = 'YOUR_SESSION_ID'
)
ORDER BY pr.player_id;
```

**Expected Results:**
- `pr_matches_played` should equal `db_match_count` for each player
- `pr_matches_played` should include matches from ALL sessions, not just current session
- After editing Session 2 match:
  - Ivan: 4 matches (2 from Session 1 + 2 from Session 2)
  - Andrej: 4 matches (2 from Session 1 + 2 from Session 2)
  - Gara: 2 matches (2 from Session 2)
  - Miladin: 2 matches (2 from Session 2)

## Key Changes

1. ✅ Query fetches ALL matches globally, sorted by session creation time
2. ✅ Baseline computation includes all previous sessions
3. ✅ Replay includes all future sessions
4. ✅ Persistence writes global all-time totals
5. ✅ Guardrails prevent matches_played from decreasing
6. ✅ Reconciliation check logs mismatches

## Testing Checklist

- [ ] Edit match in Session 2
- [ ] Verify all players have correct match counts (includes Session 1)
- [ ] Verify Elo values are correct (includes Session 1 impact)
- [ ] Check logs show `total_matches_globally` > `matches_in_current_session`
- [ ] Verify no guardrail errors (matches_played decreasing)
- [ ] Run verification SQL query - `pr_matches_played` should equal `db_match_count`

