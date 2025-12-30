# Doubles Elo Calculation Audit

## Root Cause

**The bug is NOT in the calculation logic itself** - `calculateEloDelta()` correctly uses expected score. However, **all teams start at 1500 Elo**, so when two 1500-rated teams play, the expected score is always 0.5, resulting in:
- Win: `K * (1.0 - 0.5) = K * 0.5`
- Loss: `K * (0.0 - 0.5) = K * -0.5`

For K=40 (first 10 matches): `40 * 0.5 = +20` and `40 * -0.5 = -20`

**The real issue:** Teams are not accumulating Elo differences over time because:
1. All teams start at 1500
2. After 3 wins, a team should be ~1560 (1500 + 20 + 20 + 20)
3. But if they keep playing 1500-rated teams, they'll keep getting +20

**However, there's a potential secondary issue:** If teams are correctly updating but the calculation is still showing flat ±20, it could mean:
- Teams are not persisting their updated Elo values, OR
- The team Elo values are being reset/overwritten somewhere

## Audit Results

### 1. Where Doubles Elo Delta is Calculated

**File:** `lib/elo/updates.ts`
- **Lines 142-143:** `calculateEloDelta()` is called for both teams
- **Line 142:** `const team1DeltaRaw = calculateEloDelta(team1Elo, team2Elo, team1Result as MatchResult, team1MatchCount);`
- **Line 143:** `const team2DeltaRaw = calculateEloDelta(team2Elo, team1Elo, team2Result as MatchResult, team2MatchCount);`

**Status:** ✅ Correctly calls `calculateEloDelta()` with team Elo values

### 2. Expected Score Usage

**File:** `lib/elo/calculation.ts`
- **Lines 40-42:** `calculateExpectedScore()` uses standard formula: `1 / (1 + 10^((opponentElo - playerElo) / 400))`
- **Lines 79-84:** `calculateEloDelta()` correctly:
  - Calculates K-factor based on match count
  - Calculates expected score using `calculateExpectedScore()`
  - Calculates actual score from result
  - Returns `K * (actualScore - expectedScore)`

**Status:** ✅ Expected score IS being used correctly

### 3. K-Factor Usage

**File:** `lib/elo/calculation.ts`
- **Lines 21-29:** `calculateKFactor()` returns:
  - 40 for matches < 10
  - 32 for matches 11-40
  - 24 for matches 41+
- **Line 79:** K-factor is calculated dynamically based on `matchCount` parameter
- **Line 136-137:** Team match counts are correctly calculated from team ratings

**Status:** ✅ K-factor is dynamic and based on team match count

### 4. Propagation to player_double_ratings

**File:** `lib/elo/updates.ts`
- **Lines 198-257:** Player double ratings are updated using the **team delta** (not recalculated)
- **Line 200:** `p_elo_delta: team1Delta` (same for all players on team)
- **Line 215:** `p_elo_delta: team1Delta` (same for all players on team)
- **Line 231:** `p_elo_delta: team2Delta` (same for all players on team)
- **Line 246:** `p_elo_delta: team2Delta` (same for all players on team)

**Status:** ✅ Intentional - players get team delta (as per requirement)

### 5. Concrete Bug Location

**The calculation logic is CORRECT.** The issue is likely:

**Hypothesis 1: Teams always start at 1500**
- If all teams are new (0 matches), they all start at 1500
- When 1500 vs 1500: expected score = 0.5
- Win: `40 * (1.0 - 0.5) = +20`
- Loss: `40 * (0.0 - 0.5) = -20`
- This is mathematically correct!

**Hypothesis 2: Team Elo values are not persisting**
- Check if `upsert_double_team_rating` RPC function is correctly updating team Elo
- Check if team Elo is being read correctly in subsequent matches

**Hypothesis 3: Team Elo is being reset/overwritten**
- Check if there's any code that resets team Elo to 1500
- Check if team Elo is being overwritten with incorrect values

### 6. Verification Steps

To confirm the root cause, check:

1. **Query team Elo values after matches:**
   ```sql
   SELECT team_id, elo, matches_played, wins, losses, draws
   FROM double_team_ratings
   ORDER BY matches_played DESC;
   ```

2. **Check if teams are accumulating Elo:**
   - After 3 wins, team should be ~1560 (if K=40) or ~1548 (if K=32)
   - If teams are still at 1500, the RPC function is not persisting

3. **Check RPC function:**
   - Verify `upsert_double_team_rating` correctly adds delta to existing Elo
   - Verify it's not overwriting with `1500 + delta` instead of `current_elo + delta`

## Minimal Fix

**If the issue is that teams are not accumulating Elo:**

1. **Check RPC function** `upsert_double_team_rating`:
   - Should be: `elo = double_team_ratings.elo + p_elo_delta`
   - NOT: `elo = 1500 + p_elo_delta`

2. **If RPC is correct, check if teams are being created fresh each time:**
   - Verify `getOrCreateDoubleTeam()` returns the same team_id for the same player pair
   - If it creates new teams, Elo will reset to 1500

**If the issue is that calculation is wrong:**

The calculation logic is correct. The ±20 is expected when:
- Both teams are at 1500 Elo
- K-factor is 40 (first 10 matches)
- Expected score = 0.5
- Delta = 40 * (1.0 - 0.5) = +20 for win

**The fix:** Ensure teams accumulate Elo over time. After a team wins and goes to 1520, the next match against a 1500 team should give:
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
- `lib/elo/updates.ts:134-135` - Gets team Elo values - ✅ Correct

**Potential Issue Location:**
- `lib/elo/updates.ts:161-169` - RPC call `upsert_double_team_rating` - **NEEDS VERIFICATION**
- Check SQL function `upsert_double_team_rating` - **NEEDS VERIFICATION**

## Minimal Patch Suggestion

**If RPC function is the issue:**

```sql
-- Verify this is correct in upsert_double_team_rating:
ON CONFLICT (team_id) DO UPDATE SET
    elo = double_team_ratings.elo + p_elo_delta,  -- ✅ Correct: add to existing
    -- NOT: elo = 1500 + p_elo_delta  -- ❌ Wrong: would reset to 1500
```

**If team creation is the issue:**

Verify `getOrCreateDoubleTeam()` in `lib/elo/double-teams.ts` returns consistent team_id for same player pair.

