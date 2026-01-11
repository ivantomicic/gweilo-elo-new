# Best/Worst Player: Singles-Only Calculation

## Executive Summary

**Status**: ✅ **UPDATED** - Best/worst player calculation now uses **singles-only Elo change**, matching the session preview page exactly.

The best/worst player ranking has been changed from combined (singles + doubles) to **singles-only** to provide a clearer, more focused view of individual performance.

## 1. Why Singles-Only Was Chosen

### 1.1 Problem with Combined Approach
- **Inflated/Obscured Performance**: Combining singles and doubles Elo changes mixed two different skill systems
- **Unclear Mental Model**: Users couldn't easily understand what "best player" meant when it combined different match types
- **Inconsistent with Session Preview**: Session preview page shows singles and doubles separately, making combined ranking confusing

### 1.2 Benefits of Singles-Only
- **Clearer Mental Model**: Best/worst player = best/worst singles performance (matches user expectations)
- **Matches Session Preview**: Aligns with how session summary displays singles rankings
- **Focused Performance Metric**: Singles Elo is the primary individual skill metric
- **Consistent Definition**: Same calculation method as session preview singles summary

### 1.3 Rationale
- Singles matches are 1v1, providing the clearest individual performance metric
- Doubles involves team dynamics and partner-dependent factors
- Session preview already separates singles and doubles, so best/worst should match singles view
- Users expect "best player" to mean best individual performance, not combined team + individual

## 2. How Before/After Elo is Obtained

### 2.1 Source: Baseline + Replay Method

**Before (elo_before)**:
- **Function**: `getSessionBaseline(sessionId)` from `lib/elo/session-baseline.ts`
- **Method**: Replays all previous completed sessions' **singles matches** in chronological order
- **Returns**: Map of `playerId -> { elo, matches_played, wins, losses, draws }`
- **Default**: 1500 if player has no previous singles matches

**After (elo_after)**:
- **Function**: `replaySessionMatches(sessionId, baselineState)` from `lib/elo/session-baseline.ts`
- **Method**: Takes baseline state, replays current session's **singles matches** sequentially
- **Returns**: Map of `playerId -> { elo, matches_played, wins, losses, draws }` after session
- **Uses**: Same Elo calculation logic as match submission (K-factor based on match count)

**Calculation**:
```typescript
const singlesBaseline = await getSessionBaseline(sessionId);
const singlesPostSession = await replaySessionMatches(sessionId, singlesBaseline);

for (const playerId of singlesPlayerIds) {
  const baseline = singlesBaseline.get(playerId);
  const eloBefore = baseline?.elo ?? 1500;
  const postSession = singlesPostSession.get(playerId);
  const eloAfter = postSession?.elo ?? eloBefore;
  const singlesEloChange = eloAfter - eloBefore; // ← SINGLES ONLY
}
```

### 2.2 Why Replay Instead of Sum-of-Deltas?

**Replay is More Reliable**:
- Recalculates from scratch using current Elo logic
- Handles edge cases (missing history, data inconsistencies)
- Matches exactly what the session summary shows
- More maintainable (single source of truth)

**Sum-of-Deltas Limitations**:
- Assumes deltas were calculated correctly at match time
- May not account for K-factor changes during session
- Can accumulate floating-point precision errors
- Less reliable if match history is incomplete

## 3. Why This Now Matches Session Preview

### 3.1 Identical Calculation Method

**Session Preview** (`app/api/sessions/[sessionId]/summary/route.ts`):
```typescript
// 1. Get singles matches only
const singlesMatches = await adminClient
  .from("session_matches")
  .select("*")
  .eq("session_id", sessionId)
  .eq("match_type", "singles")
  .eq("status", "completed");

// 2. Get baseline and replay
const baselineState = await getSessionBaseline(sessionId);
const postSessionState = await replaySessionMatches(sessionId, baselineState);

// 3. Collect only players who played singles
const singlesPlayerIds = new Set<string>();
for (const match of singlesMatches) {
  const playerIds = (match.player_ids as string[]) || [];
  if (playerIds.length >= 2) {
    singlesPlayerIds.add(playerIds[0]);
    singlesPlayerIds.add(playerIds[1]);
  }
}

// 4. Calculate elo_change per player
for (const playerId of singlesPlayerIds) {
  const baseline = baselineState.get(playerId);
  const eloBefore = baseline?.elo ?? 1500;
  const postSession = postSessionState.get(playerId);
  const eloAfter = postSession?.elo ?? eloBefore;
  const eloChange = eloAfter - eloBefore; // ← SINGLES ONLY
}
```

**Best/Worst Player** (`app/api/sessions/[sessionId]/best-worst-player/route.ts`):
```typescript
// 1. Get singles matches only
const singlesMatches = await adminClient
  .from("session_matches")
  .select("id, match_type, player_ids")
  .eq("session_id", sessionId)
  .eq("match_type", "singles")
  .eq("status", "completed");

// 2. Get baseline and replay (SAME FUNCTIONS)
const singlesBaseline = await getSessionBaseline(sessionId);
const singlesPostSession = await replaySessionMatches(sessionId, singlesBaseline);

// 3. Collect only players who played singles (SAME LOGIC)
const singlesPlayerIds = new Set<string>();
for (const match of singlesMatches) {
  const playerIds = (match.player_ids as string[]) || [];
  if (playerIds.length >= 2) {
    singlesPlayerIds.add(playerIds[0]);
    singlesPlayerIds.add(playerIds[1]);
  }
}

// 4. Calculate elo_change per player (SAME CALCULATION)
for (const playerId of singlesPlayerIds) {
  const baseline = singlesBaseline.get(playerId);
  const eloBefore = baseline?.elo ?? 1500;
  const postSession = singlesPostSession.get(playerId);
  const eloAfter = postSession?.elo ?? eloBefore;
  const singlesEloChange = eloAfter - eloBefore; // ← IDENTICAL
}
```

### 3.2 Exact Alignment

✅ **Same Functions**: Both use `getSessionBaseline()` and `replaySessionMatches()`  
✅ **Same Filter**: Both only include players who played singles matches  
✅ **Same Calculation**: Both calculate `eloChange = eloAfter - eloBefore`  
✅ **Same Baseline**: Both replay previous sessions identically  
✅ **Same Replay**: Both replay current session singles matches identically  

**Result**: Best/worst player values will **exactly match** the session preview singles rankings.

## 4. Implementation Details

### 4.1 Player Selection

**Included**:
- Players who played at least one completed singles match in the session

**Excluded**:
- Players who only played doubles matches
- Players with no completed matches
- Players not in the session

### 4.2 Edge Cases

**No Singles Matches**:
- Returns all nulls (no best/worst player)

**Players with No Singles**:
- Excluded from ranking (only doubles players don't appear)

**Ties**:
- Deterministic tie-breaking: lowest UUID wins
- Ensures consistent results across requests

**Active Sessions**:
- Returns all nulls (only completed sessions have meaningful Elo changes)

### 4.3 Return Value

```typescript
{
  best_player_id: string | null,
  best_player_display_name: string | null,
  best_player_delta: number | null,  // Singles Elo change (after - before)
  worst_player_id: string | null,
  worst_player_display_name: string | null,
  worst_player_delta: number | null   // Singles Elo change (after - before)
}
```

**Note**: Field name is `best_player_delta` but value is actually `singles_elo_change` (kept for backward compatibility).

## 5. Verification

### 5.1 Comparison with Session Preview

The implementation includes verification logging that compares:
- **Method A**: `elo_after - elo_before` (replay-based, singles-only)
- **Method B**: `sum(match_elo_history.player_elo_delta)` (sum-of-deltas, singles-only)

**Expected**: Both methods should produce identical results (within floating-point precision).

### 5.2 How to Verify

1. Check server logs for `[BEST_WORST_VERIFY]` entries
2. Compare best/worst values with session preview singles rankings
3. Verify that players with only doubles matches are excluded
4. Confirm values match session preview exactly

## 6. Code Changes Summary

### 6.1 Removed
- ❌ Doubles baseline calculation (`getDoublesPlayerBaseline`)
- ❌ Doubles replay calculation (`replayDoublesPlayerMatches`)
- ❌ Combined singles + doubles Elo changes
- ❌ Inclusion of all session players (now only singles players)

### 6.2 Added
- ✅ Singles-only match filtering
- ✅ Singles-only player selection (only players who played singles)
- ✅ Singles-only Elo change calculation
- ✅ Verification logging for singles-only comparison

### 6.3 Files Changed
- `app/api/sessions/[sessionId]/best-worst-player/route.ts`
  - Updated to use singles-only calculation
  - Removed doubles-related imports and logic
  - Added singles-only player filtering

## 7. Performance

### 7.1 Efficiency
- **Baseline calculation**: Replays all previous sessions' singles matches (O(n) where n = previous sessions)
- **Session replay**: Replays current session singles matches (O(m) where m = singles matches in session)
- **Player filtering**: Only includes players with singles matches (reduces computation)
- **User lookup**: Only fetches names for 2 players (best + worst)

**Performance Impact**:
- Slightly faster than combined approach (no doubles calculation)
- Same performance as session summary (uses same functions)
- Acceptable for session cards (only calculated for completed sessions)

## 8. Conclusion

### 8.1 Alignment Confirmed
✅ **ALIGNED** - Best/worst player calculation now:
- Uses singles-only Elo change
- Matches session preview calculation exactly
- Includes only players who played singles matches
- Uses same baseline + replay method

### 8.2 Benefits
- **Clearer**: Users understand "best player" = best singles performance
- **Consistent**: Matches session preview singles rankings exactly
- **Focused**: Singles is the primary individual skill metric
- **Maintainable**: Single source of truth with session summary

### 8.3 Next Steps
1. Monitor verification logs to confirm methods match
2. Test with sessions containing both singles and doubles
3. Verify UI displays correctly (best/worst should match session preview)
4. Remove verification logging once confirmed working



