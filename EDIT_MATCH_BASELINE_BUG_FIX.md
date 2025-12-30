# Edit Match Baseline Bug Fix

## Root Cause

**The Bug:** When editing match #2, players who participated in match #1 (Ivan, Andrej) were losing match #1's contribution to their stats.

**Why it happened:**
1. The code tries to get a snapshot before the edited match
2. If no snapshot exists (snapshots weren't created or were deleted), it falls back to `getInitialBaseline()`
3. `getInitialBaseline()` returns the player's state **BEFORE the session started** (1500/0 matches)
4. This loses all matches before the edited match

**Example:**
- Match 1: Ivan 2:1 Andrej
- Match 2: Gara 1:2 Ivan (edited to Gara 2:2 Ivan)
- Match 3: Andrej 1:2 Gara

When editing match 2:
- Ivan should have baseline: 1 match, 1 win, 0 loss (from match 1)
- But if no snapshot exists, baseline = 0 matches, 0 wins, 0 loss (initial baseline)
- After replay: Ivan has 1 match (only match 2), not 2 matches

## The Fix

**Solution:** Compute baseline by replaying matches from the start up to the edited match, instead of relying on snapshots or falling back to initial baseline.

**Algorithm:**
1. Initialize all players with their initial baseline (before session)
2. Replay all matches from start up to (but not including) the edited match
3. Use the computed state as the baseline for replay
4. Replay matches from edited match onward

This ensures:
- ✅ Baseline includes all matches before the edited match
- ✅ Works even if snapshots don't exist
- ✅ Correct totals for all players

## Code Changes

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Before (BUGGY):**
```typescript
// Tries snapshot, falls back to initial baseline (loses match #1)
const snapshot = await getSnapshotBeforeMatch(playerId, matchId);
if (snapshot) {
    baseline = snapshot;
} else {
    baseline = await getInitialBaseline(playerId, sessionId); // ❌ Wrong!
}
```

**After (FIXED):**
```typescript
// Compute baseline by replaying matches from start
const baselineComputedState = new Map();
// Initialize all players
for (const playerId of allPlayerIds) {
    const initialBaseline = await getInitialBaseline(playerId, sessionId);
    baselineComputedState.set(playerId, { ...initialBaseline });
}

// Replay matches from start up to edited match
const matchesBeforeEdit = allMatches.slice(0, matchIndex);
for (const match of matchesBeforeEdit) {
    // Calculate Elo delta and update state
    // ...
}

// Use computed baseline
for (const [playerId, state] of baselineComputedState.entries()) {
    baselineState.set(playerId, { ...state });
}
```

## Verification

After editing match 2, verify with SQL:

```sql
SELECT 
    player_id,
    elo,
    matches_played,
    wins,
    losses,
    draws
FROM player_ratings
WHERE player_id IN (
    SELECT DISTINCT unnest(player_ids) 
    FROM session_matches 
    WHERE session_id = 'YOUR_SESSION_ID'
)
ORDER BY player_id;
```

**Expected Results:**
- **Ivan**: 2 matches, 1 win, 0 loss, 1 draw, Elo ~1520
- **Andrej**: 2 matches, 0 win, 1 loss, 0 draw, Elo ~1480
- **Gara**: 2 matches, 1 win, 0 loss, 1 draw, Elo ~1520

**Check Logs:**
Look for `[BASELINE_COMPUTATION]` and `[BASELINE_LOADED]` tags:
- Should show `matches_to_replay_for_baseline: 1` (match 1)
- Should show `source: "computed_by_replay"`
- Baseline should show correct `matches_played`, `wins`, `losses` from match 1

## Benefits

1. **Robust:** Works even if snapshots don't exist
2. **Correct:** Always includes all matches before edited match
3. **Deterministic:** Same result every time
4. **No data loss:** Preserves all match history

## Testing Checklist

- [ ] Edit match 2 in a 3-match session
- [ ] Verify all 3 players have 2 matches (not 1)
- [ ] Verify Elo values are correct
- [ ] Verify win/loss/draw stats are correct
- [ ] Check logs show baseline computation
- [ ] Verify no players stuck at 1500/0 matches

