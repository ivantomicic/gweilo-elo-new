# Doubles Elo Calculation Audit - Final Report

## Root Cause

**The calculation logic is CORRECT** - `calculateEloDelta()` properly uses expected score. However, **if all teams are always at 1500 Elo when they play**, the expected score will always be 0.5, resulting in flat ±20 deltas.

**The issue:** Teams are either:
1. Not accumulating Elo (RPC function not persisting), OR
2. Always being read as 1500 (default fallback), OR  
3. Being reset/overwritten somewhere

## Audit Results

### 1. Where Doubles Elo Delta is Calculated

**File:** `lib/elo/updates.ts`
- **Line 142:** `const team1DeltaRaw = calculateEloDelta(team1Elo, team2Elo, team1Result as MatchResult, team1MatchCount);`
- **Line 143:** `const team2DeltaRaw = calculateEloDelta(team2Elo, team1Elo, team2Result as MatchResult, team2MatchCount);`

**Status:** ✅ Correctly calls `calculateEloDelta()` with team Elo values

### 2. Expected Score Usage

**File:** `lib/elo/calculation.ts`
- **Lines 40-42:** `calculateExpectedScore()` uses: `1 / (1 + 10^((opponentElo - playerElo) / 400))`
- **Lines 79-84:** `calculateEloDelta()` correctly:
  - Calculates K-factor (line 79)
  - Calculates expected score (line 80)
  - Calculates actual score (line 81)
  - Returns `K * (actualScore - expectedScore)` (line 83)

**Status:** ✅ Expected score IS being used correctly

**Mathematical Proof:**
- When both teams are at 1500: expected score = 0.5
- Win: `40 * (1.0 - 0.5) = +20` ✅
- Loss: `40 * (0.0 - 0.5) = -20` ✅
- This is mathematically correct!

**The problem:** If teams accumulate Elo correctly, after 3 wins a team should be ~1560, and the next match should give ~+19.5 (not +20).

### 3. K-Factor Usage

**File:** `lib/elo/calculation.ts`
- **Lines 21-29:** Dynamic K-factor:
  - 40 for matches < 10
  - 32 for matches 11-40
  - 24 for matches 41+
- **Line 79:** K is calculated from `matchCount` parameter
- **Line 136-137:** Team match counts are correctly calculated

**Status:** ✅ K-factor is dynamic and based on team match count

### 4. Propagation to player_double_ratings

**File:** `lib/elo/updates.ts`
- **Lines 198-257:** Players get the **team delta** (not recalculated)
- This is intentional per requirement: "Both players on the same team receive the same Elo delta"

**Status:** ✅ Intentional design

### 5. RPC Function Verification

**File:** `supabase-drop-duplicate-rpc-functions.sql` (Lines 113-148)
- **Line 139:** `elo = double_team_ratings.elo + p_elo_delta` ✅ CORRECT
- **Line 129:** INSERT uses `1500 + p_elo_delta` (only for new teams) ✅ CORRECT

**Status:** ✅ RPC function correctly adds delta to existing Elo

### 6. Team Elo Reading

**File:** `lib/elo/updates.ts`
- **Lines 122-132:** Reads team Elo from `double_team_ratings`
- **Line 134-135:** Uses `team1Rating?.elo ?? 1500` (defaults to 1500 if not found)

**Potential Issue:** If team rating doesn't exist in DB, it defaults to 1500. This could happen if:
- Team was never created in `double_team_ratings`
- Team was deleted/reset
- Query is failing silently

## Concrete Bug Location

**The calculation is correct.** The issue is likely:

### Hypothesis 1: Teams Always Default to 1500

**File:** `lib/elo/updates.ts:134-135`
```typescript
const team1Elo = team1Rating?.elo ?? 1500;
const team2Elo = team2Rating?.elo ?? 1500;
```

**If `team1Rating` or `team2Rating` is `null` or `undefined`, Elo defaults to 1500.**

**Check:** Verify teams exist in `double_team_ratings` table:
```sql
SELECT team_id, elo, matches_played 
FROM double_team_ratings 
ORDER BY matches_played DESC;
```

### Hypothesis 2: Team Creation Issue

**File:** `lib/elo/updates.ts:118-119`
```typescript
const team1Id = await getOrCreateDoubleTeam(team1PlayerIds[0], team1PlayerIds[1]);
const team2Id = await getOrCreateDoubleTeam(team2PlayerIds[0], team2PlayerIds[1]);
```

**If `getOrCreateDoubleTeam()` creates a new team each time (instead of returning existing), the team won't have accumulated Elo.**

**Check:** Verify `getOrCreateDoubleTeam()` returns consistent team_id for same player pair.

### Hypothesis 3: RPC Function Not Executing

**File:** `lib/elo/updates.ts:161-169`
```typescript
const { error: team1Error } = await supabase.rpc("upsert_double_team_rating", {
    p_team_id: team1Id,
    p_elo_delta: team1Delta,
    // ...
});
```

**If RPC call fails silently or doesn't execute, Elo won't update.**

**Check:** Verify error handling catches RPC failures (it does - lines 171-174).

## Minimal Fix

**If teams are always at 1500:**

1. **Add logging to verify team Elo values:**
   ```typescript
   console.log('Team 1 Elo:', team1Elo, 'Team 2 Elo:', team2Elo);
   console.log('Team 1 Delta:', team1Delta, 'Team 2 Delta:', team2Delta);
   ```

2. **Verify teams exist in DB:**
   ```sql
   SELECT team_id, elo, matches_played, wins, losses, draws
   FROM double_team_ratings
   WHERE team_id IN (
       SELECT team_id FROM double_teams 
       WHERE player1_id = 'PLAYER_ID' OR player2_id = 'PLAYER_ID'
   );
   ```

3. **If teams don't exist, check `getOrCreateDoubleTeam()`:**
   - Should return existing team_id for same player pair
   - Should not create duplicate teams

**If calculation is wrong (unlikely):**

The calculation logic is correct. The ±20 is expected when:
- Both teams are at 1500 Elo
- K-factor is 40 (first 10 matches)
- Expected score = 0.5
- Delta = 40 * (1.0 - 0.5) = +20 for win

**The fix:** Ensure teams accumulate Elo. After a team wins and goes to 1520, the next match against a 1500 team should give:
- Expected score = 1 / (1 + 10^((1500 - 1520)/400)) = 1 / (1 + 10^(-0.05)) ≈ 0.512
- Delta = 40 * (1.0 - 0.512) ≈ +19.5 (not +20)

## Exact File + Line Numbers

**Calculation Logic (CORRECT):**
- `lib/elo/calculation.ts:73-85` - `calculateEloDelta()` - ✅ Correct
- `lib/elo/calculation.ts:40-42` - `calculateExpectedScore()` - ✅ Correct
- `lib/elo/calculation.ts:21-29` - `calculateKFactor()` - ✅ Correct

**Doubles Update Logic (CORRECT):**
- `lib/elo/updates.ts:142-143` - Calls `calculateEloDelta()` - ✅ Correct
- `lib/elo/updates.ts:136-137` - Calculates team match counts - ✅ Correct
- `lib/elo/updates.ts:134-135` - Gets team Elo values - ⚠️ **POTENTIAL ISSUE: Defaults to 1500 if not found**

**RPC Function (CORRECT):**
- `supabase-drop-duplicate-rpc-functions.sql:139` - `elo = double_team_ratings.elo + p_elo_delta` - ✅ Correct

## Minimal Patch Suggestion

**Add diagnostic logging to verify team Elo values are being read correctly:**

```typescript
// In lib/elo/updates.ts, after line 137:
console.log(JSON.stringify({
    tag: "[DOUBLES_ELO_READ]",
    team1_id: team1Id,
    team1_elo: team1Elo,
    team1_match_count: team1MatchCount,
    team1_rating_exists: !!team1Rating,
    team2_id: team2Id,
    team2_elo: team2Elo,
    team2_match_count: team2MatchCount,
    team2_rating_exists: !!team2Rating,
}));

// After line 148:
console.log(JSON.stringify({
    tag: "[DOUBLES_ELO_CALCULATED]",
    team1_delta_raw: team1DeltaRaw,
    team1_delta_rounded: team1Delta,
    team2_delta_raw: team2DeltaRaw,
    team2_delta_rounded: team2Delta,
}));
```

**If teams are always 1500, the issue is:**
- Teams don't exist in `double_team_ratings` (check `getOrCreateDoubleTeam()`)
- Teams are being reset somewhere
- Query is failing silently

**The calculation itself is correct - the issue is data persistence or retrieval.**

