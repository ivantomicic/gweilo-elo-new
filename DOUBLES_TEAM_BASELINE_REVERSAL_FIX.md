# Doubles Team Baseline Reversal Fix

## Problem

When editing a doubles match, team Elo was loaded directly from `double_team_ratings` (current DB state) without reversing session doubles matches. This caused double counting of Elo deltas when replaying doubles matches.

**Observed Symptom:**
- First-ever doubles session
- Brand-new teams should start at exactly 1500 Elo
- Editing the first doubles match showed teams starting at 1480/1520 (already inflated)
- First replayed match produced decimals, which should be impossible
- Logs showed `session_changes_reversed.elo_delta = 0` (no reversal happening)

## Root Cause

**Initial Issue:**
- Players have baseline reversal logic (session deltas are subtracted before replay)
- Teams did NOT have baseline reversal logic
- Team baseline was loaded from DB without reversing session doubles matches
- Replay then reapplied deltas → inflated Elo

**Secondary Bug Found:**
- Team baseline reversal was implemented but used `matchIdsToReplay` instead of ALL doubles matches
- `matchIdsToReplay` only includes matches from edited match onward
- This meant earlier doubles matches in the session were NOT reversed
- Result: Baseline still included earlier matches' deltas → wrong baseline

## Solution

Implemented baseline reversal for doubles teams, analogous to player baseline reversal.

### Implementation Details

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`
**Lines:** ~1212-1500 (team baseline loading)

**Changes:**

1. **Create `allDoublesMatchIds` Set** (line ~290):
   - Filter `allMatches` for `match_type === "doubles"`
   - Extract all match IDs
   - Use this for baseline reversal queries (NOT `matchIdsToReplay`)

2. **Team Baseline Reversal** (lines ~1214-1420):
   - Load current team rating from `double_team_ratings`
   - Query `match_elo_history` for ALL doubles matches in session (using `allDoublesMatchIds`)
   - Sum up team Elo deltas from ALL session doubles matches
   - Reverse deltas: `baselineTeamElo = currentTeamElo - sessionTeamEloDelta`
   - Count wins/losses/draws from ALL session doubles matches
   - Reverse stats: `baselineStats = currentStats - sessionStats`
   - Use reversed baseline for replay

**Key Fix:**
- Changed from `.in("match_id", matchIdsToReplay)` to `.in("match_id", allDoublesMatchIds)`
- This ensures ALL doubles matches in the session are reversed, not just matches being replayed
- `matchIdsToReplay` is still used for deletion and replay filtering (correct)

2. **Logging** (lines ~1395-1420):
   - Added `[TEAM_BASELINE_LOADED]` logs showing:
     - Baseline Elo and stats (after reversal)
     - Current Elo and stats (from DB)
     - Session changes reversed (deltas and stats)

3. **Correct Behavior:**
   - New teams start at 1500 (baseline = 1500 - 0 = 1500)
   - Existing teams start at DB - session deltas (correct baseline)
   - First doubles match produces ±20.00 (no decimals)
   - Edit/replay produces identical results to clean re-entry

## Key Logic

```typescript
// BEFORE baseline calculation:
1. Create allDoublesMatchIds = all doubles match IDs in session

// For each team encountered in replay:
2. Load current team rating from DB
3. Query match_elo_history for ALL session doubles matches (using allDoublesMatchIds)
4. Sum team deltas: sessionTeamEloDelta = sum(team1_elo_delta or team2_elo_delta)
5. Count ALL session doubles matches and stats
6. Calculate baseline:
   - baselineElo = currentElo - sessionTeamEloDelta
   - baselineMatches = currentMatches - sessionMatches
   - baselineStats = currentStats - sessionStats
7. Use baseline for replay (only matches from edited match onward)
```

**Critical Distinction:**
- **Baseline reversal:** Uses `allDoublesMatchIds` (ALL doubles matches in session)
- **History deletion:** Uses `matchIdsToReplay` (only matches being replayed)
- **Replay loop:** Uses `matchIdsToReplay` (only matches from edited match onward)

## Result

✅ **New teams start at 1500**
✅ **First doubles match produces ±20.00 (no decimals)**
✅ **Edit/replay produces identical results to live submission**
✅ **Teams are correctly reversed before replay**
✅ **No double counting of Elo deltas**

## Files Changed

- `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

## Testing

To verify the fix:
1. Create first doubles session with brand-new teams
2. Play first match (should produce ±20.00)
3. Edit the first match
4. Verify teams start at 1500 in logs
5. Verify replayed match produces ±20.00 (no decimals)

