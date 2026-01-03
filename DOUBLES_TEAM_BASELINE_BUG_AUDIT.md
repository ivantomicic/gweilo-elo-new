# Doubles Team Baseline Reversal Bug Audit

## Problem Identified

**Root Cause:** Team baseline reversal uses `matchIdsToReplay` which only includes matches from the edited match onward, not ALL doubles matches in the session.

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` lines ~1233 and ~1430

**Current Code:**
```typescript
const { data: sessionTeam1EloHistory } = await adminClient
    .from("match_elo_history")
    .select("match_id, team1_id, team2_id, team1_elo_delta, team2_elo_delta")
    .in("match_id", matchIdsToReplay)  // ❌ WRONG: Only includes matches from edited match onward
    .or(`team1_id.eq.${team1Id},team2_id.eq.${team1Id}`);
```

**What `matchIdsToReplay` Contains:**
- Line 285-287: `matchIdsToReplay` is filtered to only include matches of `matchToEdit.match_type`
- This is correct for deletion (we only delete history for matches being replayed)
- But for baseline reversal, we need ALL doubles matches in the session

**Why This Fails:**
1. If editing match #2 in a 3-match doubles session:
   - `matchIdsToReplay` = [match2, match3]
   - Team baseline reversal only reverses match2 and match3
   - Match1's deltas are NOT reversed
   - Result: Baseline is wrong (includes match1's deltas)

2. For first-ever doubles session:
   - If editing match #1, `matchIdsToReplay` = [match1]
   - But if team already played in match2, match2's deltas are not reversed
   - Result: Baseline includes match2's deltas → wrong baseline

## Correct Behavior

**For Team Baseline Reversal:**
- Must reverse ALL doubles matches in the session
- Not just matches being replayed
- Not just matches from edited match onward
- ALL doubles matches that contributed to current DB state

**Why:**
- `double_team_ratings.elo` is global (across all sessions)
- Current DB state includes ALL doubles matches from ALL sessions
- To get session-start baseline, must reverse ALL doubles matches in THIS session
- Then replay only matches from edited match onward

## Fix Required

1. **Create `allDoublesMatchIds` set:**
   - Filter `allMatches` for `match_type === "doubles"`
   - Extract all match IDs
   - Use this for baseline reversal queries

2. **Update team baseline reversal queries:**
   - Change `.in("match_id", matchIdsToReplay)` to `.in("match_id", allDoublesMatchIds)`
   - This ensures ALL session doubles matches are reversed

3. **Keep `matchIdsToReplay` for:**
   - Deleting history (correct - only delete what we'll replay)
   - Replay loop filtering (correct - only replay from edited match onward)

## Comparison with Player Logic

**Players (line 475):**
- Uses `matchIdsToReplay` for baseline reversal
- This is CORRECT because:
  - If editing singles, only reverse singles matches
  - `matchIdsToReplay` already filtered by `matchToEdit.match_type`
  - Players only participate in one match type per session (singles or doubles, not both)

**Teams (line 1233):**
- Uses `matchIdsToReplay` for baseline reversal
- This is WRONG because:
  - `matchIdsToReplay` only includes matches from edited match onward
  - Need to reverse ALL doubles matches in session
  - Teams can play multiple doubles matches in one session

## Implementation Plan

1. Before baseline calculation (after line 287):
   ```typescript
   // Get ALL doubles match IDs in session (for baseline reversal)
   const allDoublesMatchIds = allMatches
       .filter((m: any) => m.match_type === "doubles")
       .map((m: any) => m.id);
   ```

2. Update team baseline reversal queries (lines ~1233, ~1430):
   ```typescript
   .in("match_id", allDoublesMatchIds)  // ✅ CORRECT: All doubles matches
   ```

3. Keep `matchIdsToReplay` for:
   - History deletion (line ~600+)
   - Replay loop filtering (line ~900+)

## Expected Result After Fix

- First doubles match: Teams start at 1500 (baseline = 1500 - 0 = 1500)
- Editing match #2: Teams reverse ALL session doubles matches, then replay from match #2
- Baseline correctly excludes all session doubles matches
- Replay produces identical results to clean entry

