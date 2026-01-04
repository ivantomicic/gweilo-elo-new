# Best/Worst Player Calculation Audit

## Executive Summary

**Status**: ✅ **FIXED** - Best/worst player calculation now matches session preview page definition.

The best/worst player calculation has been updated to use the same method as the session summary: `elo_change = elo_after_session - elo_before_session` instead of summing per-match deltas.

## 1. Findings: Session Preview Page Calculation

### 1.1 Code Path
**File**: `app/api/sessions/[sessionId]/summary/route.ts` (lines 202-239)

**Method**:
```typescript
// For singles
const baselineState = await getSessionBaseline(sessionId);
const postSessionState = await replaySessionMatches(sessionId, baselineState);

for (const playerId of singlesPlayerIds) {
  const baseline = baselineState.get(playerId);
  const eloBefore = baseline?.elo ?? 1500;
  const postSession = postSessionState.get(playerId);
  const eloAfter = postSession?.elo ?? eloBefore;
  const eloChange = eloAfter - eloBefore; // ← CORRECT DEFINITION
}
```

### 1.2 Source of "Before" and "After" Elo

**Before (elo_before)**:
- Source: `getSessionBaseline(sessionId)` from `lib/elo/session-baseline.ts`
- Method: Replays all previous completed sessions in chronological order
- Returns: Map of `playerId -> { elo, matches_played, wins, losses, draws }`
- Default: 1500 if player has no previous matches

**After (elo_after)**:
- Source: `replaySessionMatches(sessionId, baselineState)` from `lib/elo/session-baseline.ts`
- Method: Takes baseline state, replays current session's matches sequentially
- Returns: Map of `playerId -> { elo, matches_played, wins, losses, draws }` after session
- Uses same Elo calculation logic as match submission (K-factor based on match count)

**Key Insight**: The session summary uses **replay-based calculation**, not sum of stored deltas.

### 1.3 Why Replay vs Sum-of-Deltas?

**Theoretical Equivalence**:
- Sum of deltas SHOULD equal (after - before) if:
  1. Deltas were calculated correctly at match time
  2. Deltas account for sequential Elo state (each match uses Elo after previous match)
  3. K-factor changes are handled correctly

**Why Replay is More Reliable**:
- Replay recalculates from scratch using current Elo logic
- Handles edge cases (missing history, data inconsistencies)
- Matches exactly what the session summary shows
- More maintainable (single source of truth)

## 2. Previous Implementation (Sum of Deltas)

### 2.1 Old Method
**File**: `app/api/sessions/[sessionId]/best-worst-player/route.ts` (previous version)

**Logic**:
1. Fetch all `match_elo_history` records for session
2. Sum `player1_elo_delta` and `player2_elo_delta` for singles
3. Sum `team1_elo_delta` and `team2_elo_delta` for doubles (mapped to players via `double_teams`)
4. Aggregate per player

**Issue**: This sums stored deltas, which may not match the replay-based calculation used in session summary.

## 3. Updated Implementation (After - Before)

### 3.1 New Method
**File**: `app/api/sessions/[sessionId]/best-worst-player/route.ts` (current version)

**Logic**:
1. Get all players in session from `session_players`
2. Calculate singles Elo change:
   - `singlesBaseline = getSessionBaseline(sessionId)` (replay previous sessions)
   - `singlesPostSession = replaySessionMatches(sessionId, singlesBaseline)` (replay current session)
   - `singlesChange = singlesAfter - singlesBefore`
3. Calculate doubles player Elo change:
   - `doublesBaseline = getDoublesPlayerBaseline(sessionId)` (replay previous doubles)
   - `doublesPostSession = replayDoublesPlayerMatches(sessionId, doublesBaseline)` (replay current doubles)
   - `doublesChange = doublesAfter - doublesBefore`
4. Combine: `totalChange = singlesChange + doublesChange`
5. Find best (highest totalChange) and worst (lowest totalChange)
6. Fetch display names for best/worst players only

### 3.2 Code Changes

**Key Updates**:
- Removed: Sum-of-deltas aggregation from `match_elo_history`
- Added: Baseline + replay calculation (same as session summary)
- Added: Combined singles + doubles Elo changes
- Added: Verification logging to compare both methods

**Verification**:
- Logs comparison between after-before and sum-of-deltas for first player
- Format: `[BEST_WORST_VERIFY] Session {id}, Player {id}: after-before={x}, sum-deltas={y}, diff={z}`

## 4. Performance Considerations

### 4.1 Efficiency
- **Baseline calculation**: Replays all previous sessions (O(n) where n = previous sessions)
- **Session replay**: Replays current session matches (O(m) where m = matches in session)
- **User lookup**: Only fetches names for 2 players (best + worst)

**Performance Impact**:
- More expensive than sum-of-deltas (requires replay)
- But matches session summary calculation exactly
- Acceptable for session cards (only calculated for completed sessions)
- Can be optimized later with caching if needed

### 4.2 Optimization Opportunities (Future)
- Cache baseline state per session
- Precompute best/worst on session completion
- Use materialized view for session statistics

## 5. Verification Results

### 5.1 Comparison Method
The updated code includes verification logging that compares:
- **Method A**: `elo_after - elo_before` (replay-based)
- **Method B**: `sum(match_elo_history.delta)` (sum-of-deltas)

### 5.2 Expected Results
- **If methods match**: `diff ≈ 0` (within floating point precision)
- **If methods differ**: `diff > 0` indicates discrepancy

**Possible Reasons for Difference**:
1. K-factor changes during session (match count increases, K-factor decreases)
2. Missing or incorrect `match_elo_history` records
3. Data inconsistencies from match edits
4. Floating point precision differences

## 6. Combined Singles + Doubles Logic

### 6.1 Rationale
Session cards show best/worst player across **all** matches in the session (singles + doubles), not just one type.

**Calculation**:
```
total_elo_change(player) = 
  (singles_elo_after - singles_elo_before) + 
  (doubles_elo_after - doubles_elo_before)
```

### 6.2 Why Combine?
- Players may play both singles and doubles in same session
- Best/worst should reflect overall session performance
- Matches user expectation (who performed best overall)

### 6.3 Alternative Approaches Considered
1. **Separate best/worst for singles and doubles**: More complex UI, less clear
2. **Only singles**: Excludes doubles players, incomplete
3. **Only doubles**: Excludes singles players, incomplete
4. **Combined (chosen)**: Complete picture, matches session summary philosophy

## 7. Return Value Structure

### 7.1 API Response
```typescript
{
  best_player_id: string | null,
  best_player_display_name: string | null,
  best_player_delta: number | null,  // Total Elo change (singles + doubles)
  worst_player_id: string | null,
  worst_player_display_name: string | null,
  worst_player_delta: number | null   // Total Elo change (singles + doubles)
}
```

### 7.2 Field Names
- `best_player_delta` / `worst_player_delta`: Actually represents **elo_change** (after - before)
- Naming kept as "delta" for backward compatibility with UI
- Value is the combined singles + doubles Elo change

## 8. Edge Cases Handled

### 8.1 No Completed Matches
- Returns all nulls
- Handled at session status check

### 8.2 Active Sessions
- Returns all nulls
- Only completed sessions have meaningful Elo changes

### 8.3 Players with No Matches
- Included in calculation (defaults to 1500/0)
- Elo change will be 0 (no matches played)

### 8.4 Ties
- Deterministic tie-breaking: lowest UUID wins
- Ensures consistent results across requests

### 8.5 Missing User Data
- Display name defaults to null
- UI handles null gracefully (shows "Unknown")

## 9. Query/Code Summary

### 9.1 Main Calculation Flow
```typescript
// 1. Get session players
const sessionPlayers = await adminClient
  .from("session_players")
  .select("player_id")
  .eq("session_id", sessionId);

// 2. Calculate singles Elo change
const singlesBaseline = await getSessionBaseline(sessionId);
const singlesPostSession = await replaySessionMatches(sessionId, singlesBaseline);

// 3. Calculate doubles Elo change
const doublesBaseline = await getDoublesPlayerBaseline(sessionId);
const doublesPostSession = await replayDoublesPlayerMatches(sessionId, doublesBaseline);

// 4. Combine changes per player
for (const playerId of allPlayerIds) {
  const singlesBefore = singlesBaseline.get(playerId)?.elo ?? 1500;
  const singlesAfter = singlesPostSession.get(playerId)?.elo ?? singlesBefore;
  const singlesChange = singlesAfter - singlesBefore;

  const doublesBefore = doublesBaseline.get(playerId)?.elo ?? 1500;
  const doublesAfter = doublesPostSession.get(playerId)?.elo ?? doublesBefore;
  const doublesChange = doublesAfter - doublesBefore;

  const totalChange = singlesChange + doublesChange;
  playerEloChanges.set(playerId, totalChange);
}

// 5. Find best/worst
playerChangeArray.sort((a, b) => {
  if (b.elo_change !== a.elo_change) {
    return b.elo_change - a.elo_change; // DESC
  }
  return a.player_id.localeCompare(b.player_id); // ASC (tie-break)
});

// 6. Fetch display names (only for best/worst)
const usersData = await adminClient.auth.admin.listUsers();
// ... map to display names
```

### 9.2 Key Functions Used
- `getSessionBaseline(sessionId)`: Replays previous sessions, returns singles Elo baseline
- `replaySessionMatches(sessionId, baseline)`: Replays current session singles matches
- `getDoublesPlayerBaseline(sessionId)`: Replays previous doubles, returns doubles player Elo baseline
- `replayDoublesPlayerMatches(sessionId, baseline)`: Replays current session doubles matches

## 10. Verification Logging

### 10.1 Implementation
The code includes verification that compares both methods for the first player:

```typescript
// Calculate sum-of-deltas for comparison
const sumOfDeltas = new Map<string, number>();
// ... aggregate from match_elo_history ...

// Log comparison
const afterBeforeChange = playerEloChanges.get(firstPlayerId) ?? 0;
const sumDeltasChange = sumOfDeltas.get(firstPlayerId) ?? 0;
console.log(
  `[BEST_WORST_VERIFY] Session ${sessionId}, Player ${firstPlayerId}: ` +
  `after-before=${afterBeforeChange.toFixed(2)}, ` +
  `sum-deltas=${sumDeltasChange.toFixed(2)}, ` +
  `diff=${Math.abs(afterBeforeChange - sumDeltasChange).toFixed(2)}`
);
```

### 10.2 How to Verify
1. Check server logs for `[BEST_WORST_VERIFY]` entries
2. Compare `after-before` vs `sum-deltas` values
3. If `diff > 0.01`, investigate discrepancy
4. Expected: `diff ≈ 0` (within floating point precision)

## 11. Conclusion

### 11.1 Alignment with Session Preview
✅ **ALIGNED** - Best/worst player calculation now uses the exact same method as session summary:
- Same baseline calculation (`getSessionBaseline`)
- Same replay logic (`replaySessionMatches`)
- Same Elo change formula (`elo_after - elo_before`)
- Combined singles + doubles for complete picture

### 11.2 Performance Trade-offs
- **Slower**: Requires replay of previous sessions (not just summing deltas)
- **More Accurate**: Matches session summary exactly
- **More Maintainable**: Single source of truth for Elo calculations

### 11.3 Next Steps (Optional Optimizations)
1. Monitor verification logs to confirm methods match
2. Consider caching baseline state if performance becomes an issue
3. Precompute best/worst on session completion (denormalize)
4. Remove verification logging once confirmed working

## 12. Files Changed

1. **`app/api/sessions/[sessionId]/best-worst-player/route.ts`**
   - Updated to use baseline + replay method
   - Added combined singles + doubles calculation
   - Added verification logging
   - Updated documentation

## 13. Testing Recommendations

1. **Verify Calculation**:
   - Compare best/worst values with session summary page
   - Check verification logs for discrepancies
   - Test with sessions containing both singles and doubles

2. **Edge Cases**:
   - Session with only singles matches
   - Session with only doubles matches
   - Session with mixed singles/doubles
   - Session with no completed matches
   - Active session (should return nulls)

3. **Performance**:
   - Monitor response times for sessions with many previous sessions
   - Consider caching if baseline calculation becomes slow

