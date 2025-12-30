# Baseline Initialization Fix for Match Edit Replay

## Problem

When editing a match, baseline state initialization was incorrect for players who are "new to the session" (no session_n_minus_1_snapshot). The code was falling back to `initial_baseline_fallback` (1500, 0 matches), which is wrong if the player appears later in the same session.

**Observed Symptom:**
- After editing an early singles match, Elo and match counts become slightly wrong for multiple players
- Logs show existing players loaded from `session_n_minus_1_snapshot`
- A player who is new to the session (but played later matches) loaded from `initial_baseline_fallback`
- This causes incorrect deltas and distorted final ratings

## Root Cause

The baseline selection logic had only 2 steps:
1. Try session_n_minus_1_snapshot
2. Fallback to initial_baseline (1500/0)

This missed the case where a player:
- Doesn't have a previous session snapshot (new to session)
- But has played matches before this session (exists in player_ratings)
- Should use their rating at session start, not 1500

## Solution

Implemented 3-step baseline selection with proper fallback order:

### Step 1: Session N-1 Snapshot (Highest Priority)
- If player has a snapshot from previous completed session → use it
- Source: `session_rating_snapshots` for Session N-1
- Log: `source: "session_n_minus_1_snapshot"`

### Step 2: Current Session Snapshot (Second Priority)
- If no previous snapshot, check if there's a snapshot for THIS session
- This snapshot was created at session start, before any matches
- Source: `session_rating_snapshots` for current session
- Log: `source: "session_start_snapshot"`

### Step 3: Calculate from Current Rating (Third Priority)
- If no snapshots, player exists in `player_ratings`
- Calculate baseline by reversing this session's matches:
  - Get current rating from `player_ratings`
  - Get all Elo history entries for this session for this player
  - Reverse Elo deltas: `baselineElo = currentElo - sum(sessionEloDeltas)`
  - Count matches in this session and subtract from current stats
  - Source: Calculated from current rating minus session changes
  - Log: `source: "session_start_rating_calculated"`

### Step 4: Initial Baseline (Last Resort)
- Only if player doesn't exist in `player_ratings` at all
- Truly new player with no prior matches
- Source: Default (1500/0)
- Log: `source: "initial_baseline"`

## Implementation Details

### Code Location
- File: `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`
- Lines: ~432-612

### Key Changes

1. **Added Step 2: Current Session Snapshot Check** (lines ~459-568)
   - Queries `session_rating_snapshots` for current session
   - Uses snapshot if it exists (most accurate)

2. **Added Step 3: Calculate from Current Rating** (lines ~503-580)
   - Queries `player_ratings` for current state
   - Queries `match_elo_history` for this session's matches
   - Reverses Elo deltas: `baselineElo = currentElo - sum(sessionDeltas)`
   - Counts matches from `session_matches` and subtracts from current stats
   - Ensures baseline reflects state before this session

3. **Updated Logging**
   - All baseline loads now log their source
   - Added detailed logging for calculated baselines showing:
     - Current rating
     - Session changes reversed
     - Final baseline

## Acceptance Criteria

✅ **Editing a match does not change total matches played for any player**
- Baseline correctly includes all matches before this session
- Replay adds only this session's matches

✅ **Editing a match does not introduce small Elo drift**
- Baseline Elo is calculated by reversing session deltas
- No approximation or estimation

✅ **Albert-type players (new to session but present later) no longer reset to 1500**
- Step 3 calculates their baseline from current rating minus session changes
- Only truly new players (no rating at all) get 1500

✅ **Logs clearly show baseline source**
- All baseline loads log: `source: "session_n_minus_1_snapshot" | "session_start_snapshot" | "session_start_rating_calculated" | "initial_baseline"`
- Calculated baselines include detailed breakdown

## Testing

To verify the fix:

1. **Create a session with:**
   - Player A (has previous session snapshot)
   - Player B (new to session, but has rating from earlier sessions)
   - Player C (truly new, no rating)

2. **Edit an early match in the session**

3. **Check logs:**
   - Player A: `source: "session_n_minus_1_snapshot"`
   - Player B: `source: "session_start_rating_calculated"` (not `initial_baseline`)
   - Player C: `source: "initial_baseline"`

4. **Verify final ratings:**
   - Total matches played should match count of completed matches
   - Elo should be consistent (no drift)

## Files Changed

- `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

