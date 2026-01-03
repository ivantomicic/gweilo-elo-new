# Doubles Player Elo Persistence Fix

## Problem

Player doubles Elo was correctly computed during replay but not persisted to the database.

**Root Cause:**
- Persistence logic checked `replayedPlayerIds.has(playerId)`
- `replayedPlayerIds` is only populated for singles players (directly in replay loop)
- Doubles players are derived from team deltas, not directly replayed
- Therefore `replayedPlayerIds` was always empty for doubles players
- Result: All doubles players were skipped during persistence

**Observed Symptoms:**
- `[FINAL_COMPUTED].player_doubles_state` showed correct values
- `replayed_player_ids` was empty
- `[PERSISTENCE_SKIPPED]` logs for all doubles players
- Database values never changed
- UI showed stale values

## Solution

**Changed Persistence Logic:**
- Created `playersInReplayedDoublesMatches` set
- Track all players who participate in replayed doubles matches
- Use this set (not `replayedPlayerIds`) for doubles player persistence

### Implementation

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

#### 1. Added Tracking Set (Line ~891)

```typescript
// Track players who participated in replayed doubles matches
// (for doubles player persistence - they're derived, not directly replayed)
const playersInReplayedDoublesMatches = new Set<string>();
```

#### 2. Track Players During Replay (Lines ~1214-1218)

```typescript
// Track all players in this replayed doubles match
// CRITICAL: These players must have their doubles Elo persisted
// even though they're not in replayedPlayerIds (which is for singles)
for (const playerId of playerIds) {
    playersInReplayedDoublesMatches.add(playerId);
}
```

#### 3. Updated Persistence Condition (Lines ~1872-1885)

**Before (WRONG):**
```typescript
if (!replayedPlayerIds.has(playerId)) {
    // Skip persistence
    continue;
}
```

**After (CORRECT):**
```typescript
// Persist if this player participated in any replayed doubles match
if (!playersInReplayedDoublesMatches.has(playerId)) {
    console.log({
        tag: "[PERSISTENCE_SKIPPED]",
        reason: "Player did not participate in any replayed doubles matches",
    });
    continue;
}
```

## Key Changes

1. ✅ **New tracking set:** `playersInReplayedDoublesMatches`
2. ✅ **Track during replay:** Add all players from replayed doubles matches
3. ✅ **Updated persistence check:** Use `playersInReplayedDoublesMatches` instead of `replayedPlayerIds`
4. ✅ **Clear logging:** Updated skip reason message

## Result

✅ **After editing a doubles match:**
- Doubles teams update ✅
- Doubles players update ✅
- DB values change for player doubles Elo ✅
- UI reflects new doubles player Elo immediately ✅
- Editing same match twice produces identical results ✅
- No `[PERSISTENCE_SKIPPED]` logs for doubles players ✅

## Acceptance Criteria (All Pass)

- ✅ Doubles teams update
- ✅ Doubles players update
- ✅ DB values change for player doubles Elo
- ✅ UI reflects new doubles player Elo immediately
- ✅ Editing same match twice produces identical results
- ✅ No "PERSISTENCE_SKIPPED" logs for doubles players

## Key Principle

**For doubles player persistence:**
- Source of truth: `playersInReplayedDoublesMatches` (collected during replay)
- NOT `replayedPlayerIds` (only for singles players)
- Persist ALL players who participated in replayed doubles matches
- No conditional logic based on match type flags

