# Doubles Elo Expectation Calculation Audit

## Executive Summary

**Status:** ✅ **Backend calculation logic is CORRECT** - Team Elo from `double_team_ratings` is used for expectation.

**Issues Found:**
1. ❌ **UI displays averaged player singles Elo** instead of team Elo (display-only, doesn't affect calculation)
2. ❌ **Edit route does NOT handle doubles matches** during replay (critical bug)

---

## 1. Doubles Expectation Calculation (Backend)

### Location: `lib/elo/updates.ts`

**Lines 157-195:** Team Elo is read from `double_team_ratings` table:
```typescript
const { data: team1Rating } = await supabase
    .from("double_team_ratings")
    .select("elo, wins, losses, draws")
    .eq("team_id", team1Id)
    .maybeSingle();

const team1Elo = team1Rating?.elo ?? 1500;
const team2Elo = team2Rating?.elo ?? 1500;
```

**Lines 208-219:** Team Elo is passed to `calculateEloDelta()`:
```typescript
const team1DeltaRaw = calculateEloDelta(
    team1Elo,      // ✅ From double_team_ratings.elo
    team2Elo,      // ✅ From double_team_ratings.elo
    team1Result as MatchResult,
    team1MatchCount
);
```

**Status:** ✅ **CORRECT**
- Uses `double_team_ratings.elo` as the source
- Falls back to 1500 only for new teams (no existing rating)
- No averaging of player Elo
- No fallback to singles Elo
- No fallback to `player_double_ratings`

### Expected Score Calculation

**Location:** `lib/elo/calculation.ts:40-42`
```typescript
export function calculateExpectedScore(playerElo: number, opponentElo: number): number {
    return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}
```

**Status:** ✅ **CORRECT** - Standard Elo formula

**When called from doubles:**
- `playerElo` = `team1Elo` (from `double_team_ratings.elo`)
- `opponentElo` = `team2Elo` (from `double_team_ratings.elo`)

---

## 2. Team Elo Lifecycle

### Team ID Resolution

**Location:** `lib/elo/double-teams.ts`
- ✅ `getOrCreateDoubleTeam()` normalizes player pairs (smaller ID first)
- ✅ Uses unique constraint to prevent duplicates
- ✅ Handles race conditions

### Team Elo Read Path

**Location:** `lib/elo/updates.ts:157-195`
1. ✅ Resolve `team_id` via `getOrCreateDoubleTeam()`
2. ✅ Read `double_team_ratings` for that `team_id`
3. ✅ Use that Elo for expectation calculation
4. ✅ Fallback to 1500 only if team has no rating yet

### Team Elo Write Path

**Location:** `lib/elo/updates.ts:254-346`
1. ✅ Compute delta using team Elo
2. ✅ Call `upsert_double_team_rating` RPC with `team_id` and `delta`
3. ✅ RPC function correctly uses `double_team_ratings.elo + p_elo_delta` (see SQL below)
4. ✅ Verify write by re-reading team rating

**RPC Function:** `supabase-setup-elo-ratings.sql:214-249`
```sql
ON CONFLICT (team_id) DO UPDATE SET
    elo = double_team_ratings.elo + p_elo_delta,  -- ✅ Adds delta to existing Elo
    ...
```

**Status:** ✅ **CORRECT** - Team Elo accumulates correctly

---

## 3. Player Propagation (Secondary)

**Location:** `lib/elo/updates.ts:348-447`

**Direction:** ✅ `team Elo → delta → player_double_ratings`
- Team delta is computed first (using team Elo)
- Each player receives the same team delta
- Player Elo is updated via `upsert_player_double_rating`

**Direction:** ✅ `player Elo → expectation` is **NOT used**
- No code path uses player Elo for doubles expectation

**Status:** ✅ **CORRECT**

---

## 4. UI Display

### Location: `app/session/[id]/page.tsx:1811-1824`

**Current Behavior:**
```typescript
const team1Elo = isSingles
    ? team1Players[0]?.elo || 1500
    : averageElo(team1Players.map((p) => p.elo));  // ❌ Uses averaged player singles Elo
```

**Issue:** 
- UI displays **averaged player singles Elo** for doubles matches
- This is misleading but **does NOT affect calculation** (calculation happens server-side)
- Players only have `singles_elo` loaded (see `app/api/sessions/[sessionId]/players/route.ts:106`)

**Status:** ⚠️ **DISPLAY BUG** (non-critical, visual only)

**Fix Needed:**
- Fetch `double_team_ratings` for doubles matches
- Display team Elo instead of averaged player Elo
- Or fetch `doubles_elo` for players and average that (but this is still wrong - should use team Elo)

---

## 5. Edit Route Doubles Handling

### Location: `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Current Behavior:**
- Lines 564-800: Replay loop only handles **singles matches**
- No code path calls `updateDoublesRatings()` for doubles matches
- Doubles matches are skipped or processed incorrectly

**Status:** ❌ **CRITICAL BUG**

**Impact:**
- Editing a doubles match does NOT recalculate team Elo
- Team Elo remains incorrect after edit
- Player doubles ratings remain incorrect

**Fix Needed:**
- Add doubles match handling in replay loop
- Call `updateDoublesRatings()` for doubles matches
- Track team state in memory (similar to player state)
- Persist team ratings after replay

---

## 6. RPC Function Verification

**Location:** `supabase-setup-elo-ratings.sql:214-249`

```sql
CREATE OR REPLACE FUNCTION public.upsert_double_team_rating(
    p_team_id UUID,
    p_elo_delta INTEGER,
    ...
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.double_team_ratings (...)
    VALUES (p_team_id, 1500 + p_elo_delta, ...)  -- New team
    ON CONFLICT (team_id) DO UPDATE SET
        elo = double_team_ratings.elo + p_elo_delta,  -- ✅ Existing team: adds delta
        ...
END;
```

**Status:** ✅ **CORRECT** - Accumulates Elo correctly

---

## Summary of Findings

### ✅ Correct Behavior

1. **Backend expectation calculation:** Uses `double_team_ratings.elo` exclusively
2. **Team Elo lifecycle:** Read → Calculate → Write → Persist all correct
3. **Player propagation:** Downstream only, never used for expectation
4. **RPC function:** Correctly accumulates Elo

### ❌ Bugs Found

1. **UI Display Bug (Non-Critical):**
   - **File:** `app/session/[id]/page.tsx:1813-1817`
   - **Issue:** Displays averaged player singles Elo instead of team Elo
   - **Impact:** Visual only, doesn't affect calculation
   - **Fix:** Fetch and display `double_team_ratings.elo` for doubles matches

2. **Edit Route Critical Bug:**
   - **File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts:564-800`
   - **Issue:** Replay loop does NOT handle doubles matches
   - **Impact:** Editing doubles matches doesn't recalculate team Elo
   - **Fix:** Add doubles match handling in replay loop, call `updateDoublesRatings()`

---

## Validation Check

**Expected Behavior:**
- Team A+B has Elo 1520
- Team C+D has Elo 1480
- Expected score should be asymmetric
- Delta should NOT be ±20

**Current Backend Behavior:** ✅ **CORRECT**
- If team Elo is correctly persisted (1520 vs 1480), expected score will be asymmetric
- Delta will be ~+19.5 for higher-rated team, ~-19.5 for lower-rated team

**If flat ±20 persists:**
- Team Elo is not being read correctly (but code looks correct)
- Team Elo is not being persisted correctly (but RPC looks correct)
- Team Elo is being reset somewhere (need to check edit route - **BUG FOUND**)

---

## Recommended Fixes

### Priority 1: Fix Edit Route (Critical)

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

Add doubles match handling in replay loop:
1. Detect doubles matches (`match.match_type === "doubles"`)
2. Resolve team IDs via `getOrCreateDoubleTeam()`
3. Load team Elo from `double_team_ratings` (or from in-memory state if tracking)
4. Call `updateDoublesRatings()` for doubles matches
5. Track team state in memory during replay
6. Persist team ratings after replay

### Priority 2: Fix UI Display (Non-Critical)

**File:** `app/session/[id]/page.tsx`

For doubles matches:
1. Fetch `double_team_ratings` for the match's teams
2. Display team Elo instead of averaged player Elo
3. Or fetch `doubles_elo` for players (but team Elo is more accurate)

---

## Confirmation

✅ **Team Elo is the only doubles expectation input**
✅ **Player Elo is downstream only**
❌ **Edit route needs doubles handling**
⚠️ **UI display is misleading but harmless**

