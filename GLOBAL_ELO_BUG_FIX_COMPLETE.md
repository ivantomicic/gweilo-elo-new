# Global Elo Overwrite Bug - Complete Fix

## Root Cause Explanation

**The Bug:** When editing a match in Session 2, `player_ratings` was overwritten with only Session 2's totals, losing all matches from Session 1.

### Exact Bug Locations

1. **Line 189 (OLD):** Query only fetched current session
   ```typescript
   .eq("session_id", sessionId)  // ❌ Only Session 2 matches
   ```

2. **Line 441 (OLD):** Baseline only included current session matches
   ```typescript
   const matchesBeforeEdit = allMatches.slice(0, matchIndex);
   // allMatches only had Session 2 matches, so baseline = Session 2 Match 1 only
   ```

3. **Line 286 (OLD):** Replay only included current session matches
   ```typescript
   const matchesToReplay = allMatches.slice(matchIndex);
   // Only Session 2 matches after edited match
   ```

4. **Line 894-900 (OLD):** Persistence overwrote global totals
   ```typescript
   upsert({
       matches_played: state.matches_played,  // ❌ Only Session 2 count (2 matches)
       // This overwrote global total, losing Session 1's 2 matches
   })
   ```

### Why It Happened

- `player_ratings` is **global** (all-time across all sessions)
- Edit route only replayed **current session** matches
- Final state only had **current session** totals
- `upsert` **overwrote** global totals with session-only totals

**Example:**
- Session 1: Ivan 2 matches
- Session 2: Ivan 2 matches (edit match 2)
- After edit: Ivan's `matches_played` became 2 (Session 2 only), losing Session 1's 2 matches

## The Fix

**Implemented Option B: Full Historical Replay**

### 1. Query ALL Matches Globally

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`, Lines 188-250

```typescript
// Fetch all sessions for chronological ordering
const { data: allSessions } = await adminClient
    .from("sessions")
    .select("id, created_at")
    .order("created_at", { ascending: true });

// Fetch ALL matches globally (no session filter)
const { data: allMatchesRaw } = await adminClient
    .from("session_matches")
    .select("*");

// Sort by session created_at, then round_number, then match_order
const allMatches = allMatchesRaw.sort((a, b) => {
    const sessionA = sessionOrderMap.get(a.session_id);
    const sessionB = sessionOrderMap.get(b.session_id);
    // Sort by session time, then round/match order
});
```

### 2. Baseline Includes All Previous Sessions

**File:** Lines 439-515

```typescript
// Replay ALL matches globally from start up to edited match
const matchesBeforeEdit = allMatches.slice(0, matchIndex);
// Now includes Session 1 matches + Session 2 matches before edited match

// Initialize from true initial (1500/0), then replay all matches
for (const match of matchesBeforeEdit) {
    // Calculate Elo delta and update state
    // This builds correct baseline including all previous sessions
}
```

### 3. Replay Includes All Future Sessions

**File:** Line 286

```typescript
const matchesToReplay = allMatches.slice(matchIndex);
// Now includes Session 2 matches after edited match + Session 3+ matches
```

### 4. Guardrails Added

**File:** Lines 950-1050

**Guardrail 1: Prevent matches_played from decreasing**
```typescript
if (state.matches_played < beforeMatchesPlayed) {
    return NextResponse.json(
        { error: "matches_played would decrease" },
        { status: 500 }
    );
}
```

**Guardrail 2: Reconciliation check**
```typescript
// Verify computed match counts match DB counts
const dbMatchCount = /* count from session_matches */;
if (state.matches_played !== dbMatchCount) {
    console.error("Match count mismatch");
}
```

## Verification SQL Query

```sql
-- Per-player totals from player_ratings vs actual DB counts
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
    ) as db_match_count,
    -- Show if they match
    CASE 
        WHEN pr.matches_played = (
            SELECT COUNT(*)
            FROM session_matches sm
            WHERE sm.status = 'completed'
            AND sm.match_type = 'singles'
            AND sm.player_ids @> ARRAY[pr.player_id]::uuid[]
        ) THEN '✅ MATCH'
        ELSE '❌ MISMATCH'
    END as verification
FROM player_ratings pr
WHERE pr.player_id IN (
    SELECT DISTINCT unnest(player_ids) 
    FROM session_matches 
    WHERE session_id = 'YOUR_SESSION_ID'
)
ORDER BY pr.player_id;
```

**Expected Results After Editing Session 2 Match:**
- **Ivan**: `pr_matches_played = 4`, `db_match_count = 4` (2 from Session 1 + 2 from Session 2)
- **Andrej**: `pr_matches_played = 4`, `db_match_count = 4` (2 from Session 1 + 2 from Session 2)
- **Gara**: `pr_matches_played = 2`, `db_match_count = 2` (2 from Session 2)
- **Miladin**: `pr_matches_played = 2`, `db_match_count = 2` (2 from Session 2)

## Key Changes Summary

1. ✅ **Query fetches ALL matches globally** (removed `.eq("session_id", sessionId)`)
2. ✅ **Sorted by session creation time** (ensures chronological order across sessions)
3. ✅ **Baseline includes all previous sessions** (replays from start of timeline)
4. ✅ **Replay includes all future sessions** (replays to end of timeline)
5. ✅ **Persistence writes global totals** (includes all sessions)
6. ✅ **Guardrails prevent data corruption** (matches_played can't decrease)
7. ✅ **Reconciliation check** (verifies computed vs DB counts)

## Testing Checklist

- [ ] Edit match in Session 2
- [ ] Check logs: `total_matches_globally` should be > `matches_in_current_session`
- [ ] Verify all players have correct match counts (includes Session 1)
- [ ] Verify Elo values are correct (includes Session 1 impact)
- [ ] Run verification SQL - `pr_matches_played` should equal `db_match_count`
- [ ] Verify no guardrail errors (matches_played decreasing)
- [ ] Check `[RECONCILIATION_CHECK]` logs show `match: true`

