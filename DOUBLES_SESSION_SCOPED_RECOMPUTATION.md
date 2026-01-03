# Doubles Session-Scoped Recomputation Implementation

## Problem

The previous approach of trying to reverse session deltas from database state was fundamentally flawed:
- Teams were loaded from `double_team_ratings` which already included session results
- Attempting to reverse deltas was error-prone and mathematically invalid
- First doubles match produced decimals instead of ±20.00
- Editing matches produced no visible change

## Solution: Session-Scoped Recomputation

**Core Principle:** During doubles match edit/replay, NEVER read team or player doubles Elo from the database. Recompute everything from scratch for the session.

### Implementation

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

#### 1. Team Initialization (Lines ~1222-1280)

**Before (WRONG):**
- Loaded team Elo from `double_team_ratings`
- Attempted to reverse session deltas
- Complex baseline calculation logic

**After (CORRECT):**
```typescript
// Initialize team state from scratch (session-scoped recomputation)
// CRITICAL: NEVER read team Elo from database during replay
// All teams start at 1500/0/0/0/0 for this session
if (!teamState.has(team1Id)) {
    teamState.set(team1Id, {
        elo: 1500,
        matches_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        sets_won: 0,
        sets_lost: 0,
    });
}
```

**Key Changes:**
- ✅ No database reads for teams
- ✅ All teams start at exactly 1500
- ✅ All stats start at 0
- ✅ Simple, deterministic initialization

#### 2. Player Doubles Initialization (Lines ~1286-1338)

**Before (WRONG):**
- Loaded player doubles Elo from `player_double_ratings`
- Attempted to reverse session deltas
- Complex baseline calculation logic

**After (CORRECT):**
```typescript
// Initialize player doubles state from scratch (session-scoped recomputation)
// CRITICAL: NEVER read player doubles Elo from database during replay
// Player doubles Elo is derived ONLY from replayed team Elo deltas
// All players start at 1500/0/0/0/0 for this session
for (const playerId of playerIds) {
    if (!playerDoublesState.has(playerId)) {
        playerDoublesState.set(playerId, {
            elo: 1500,
            matches_played: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            sets_won: 0,
            sets_lost: 0,
        });
    }
}
```

**Key Changes:**
- ✅ No database reads for player doubles
- ✅ All players start at exactly 1500
- ✅ Player doubles Elo derived only from team deltas during replay
- ✅ Simple, deterministic initialization

#### 3. Replay Logic (Lines ~1340-1680)

**Unchanged (Already Correct):**
- Replay loop processes all doubles matches in order
- Teams start at 1500, accumulate deltas sequentially
- Player doubles Elo updated from team deltas
- No database reads during replay

#### 4. Persistence (Lines ~1782-2125)

**Unchanged (Already Correct):**
- Final state persisted to `double_team_ratings`
- Final state persisted to `player_double_ratings`
- Overwrites existing rows (no merging)

## Removed Code

1. **Team Baseline Reversal Logic:**
   - Removed all `double_team_ratings` reads
   - Removed all `match_elo_history` queries for teams
   - Removed all baseline calculation logic
   - Removed `[TEAM_BASELINE_LOADED]` logs

2. **Player Doubles Baseline Reversal Logic:**
   - Removed all `player_double_ratings` reads
   - Removed all `match_elo_history` queries for player doubles
   - Removed all baseline calculation logic
   - Removed `[PLAYER_DOUBLES_BASELINE]` logs

3. **Helper Variables:**
   - Removed `allDoublesMatchIds` (no longer needed)

## Result

✅ **First doubles match:**
- Both teams start at exactly 1500
- Expected score = 0.5
- Delta = ±20.00 (K=40)
- No decimals possible

✅ **Editing a doubles match:**
- All teams reset to 1500
- All doubles matches replayed sequentially
- Final state is mathematically correct
- Changes are visible and deterministic

✅ **Re-editing the same match:**
- Produces identical results (idempotent)

✅ **Replaying after DB reset:**
- Produces identical results (deterministic)

## Acceptance Criteria (All Pass)

- ✅ First doubles match between two new teams: Both start at 1500, expected score = 0.5, Elo change = ±20.00 exactly, no decimals
- ✅ Editing a doubles match changes final results
- ✅ Re-editing the same match twice yields identical output
- ✅ Replaying after DB reset produces identical results

## Key Principles

1. **Session-Scoped:** Each session's doubles matches are recalculated independently
2. **No DB Reads:** Never read team or player doubles Elo during replay
3. **Deterministic:** Same inputs always produce same outputs
4. **Simple:** No complex reversal logic, just recompute from scratch

