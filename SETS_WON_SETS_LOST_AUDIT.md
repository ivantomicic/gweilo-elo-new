# Sets Won / Sets Lost Audit Report

## Executive Summary

**Finding:** `sets_won` and `sets_lost` are fundamentally broken across all rating systems. They are being treated as binary match win/loss indicators (0 or 1) rather than actual set counts.

**Root Cause:** The calculation logic treats match scores as binary win/loss indicators, not as set counts. When a match score is 4:2, `sets_won` should be 4, but the code sets it to 1.

**Impact:** This affects all three rating systems:
- `player_ratings` (singles)
- `player_double_ratings` (individual doubles)
- `double_team_ratings` (team doubles)

**Conclusion:** This is a bug, not a misnamed field or unfinished feature. The fields are intended to track sets, but the implementation incorrectly maps match scores to binary win/loss values.

---

## 1. Where sets_won and sets_lost are Written

### 1.1 Primary Update Functions

**File:** `lib/elo/updates.ts`

**Singles (`updateSinglesRatings`):**
- **Lines 71-74:** Sets are calculated as binary indicators:
  ```typescript
  const player1SetsWon = player1Score > player2Score ? 1 : 0;
  const player1SetsLost = player1Score < player2Score ? 1 : 0;
  const player2SetsWon = player2Score > player1Score ? 1 : 0;
  const player2SetsLost = player2Score < player1Score ? 1 : 0;
  ```
- **Lines 83-84, 99-100:** These binary values are passed to RPC functions

**Doubles (`updateDoublesRatings`):**
- **Lines 387-390:** Same binary logic for team ratings:
  ```typescript
  const team1SetsWon = team1Score > team2Score ? 1 : 0;
  const team1SetsLost = team1Score < team2Score ? 1 : 0;
  const team2SetsWon = team2Score > team1Score ? 1 : 0;
  const team2SetsLost = team2Score < team1Score ? 1 : 0;
  ```
- **Lines 401-402, 448-449, 501-502, 524-525, 548-549, 571-572:** Binary values passed to RPC functions for both team and player doubles ratings

### 1.2 Match Edit/Replay Logic

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Singles Replay:**
- **Lines 1319-1325:** Same binary logic during match replay:
  ```typescript
  if (score1 > score2) {
      player1State.sets_won += 1;
      player2State.sets_lost += 1;
  } else if (score1 < score2) {
      player1State.sets_lost += 1;
      player2State.sets_won += 1;
  }
  ```

**Doubles Team Replay:**
- **Lines 1689-1695:** Same binary logic for team doubles

**Doubles Player Replay:**
- **Lines 1813-1842:** Same binary logic for player doubles (both teams)

### 1.3 Database RPC Functions

**Files:** `supabase-setup-elo-ratings.sql`, `supabase-complete-decimal-migration.sql`, etc.

All RPC functions (`upsert_player_rating`, `upsert_player_double_rating`, `upsert_double_team_rating`) accept `p_sets_won` and `p_sets_lost` as INTEGER parameters and accumulate them:
```sql
sets_won = player_ratings.sets_won + p_sets_won,
sets_lost = player_ratings.sets_lost + p_sets_lost,
```

The database schema supports proper set tracking (INTEGER fields), but the application code only passes 0 or 1.

---

## 2. How Values are Calculated

### 2.1 Current Implementation

**Pattern:** All calculation points use the same binary logic:
```typescript
const setsWon = score1 > score2 ? 1 : 0;
const setsLost = score1 < score2 ? 1 : 0;
```

**What this means:**
- If match score is 4:2 → `sets_won = 1`, `sets_lost = 0` (WRONG)
- If match score is 3:5 → `sets_won = 0`, `sets_lost = 1` (WRONG)
- If match score is 2:2 → `sets_won = 0`, `sets_lost = 0` (WRONG - should be 2:2)

### 2.2 What Should Happen

If match scores represent sets won in the match:
- If match score is 4:2 → `sets_won = 4`, `sets_lost = 2` (CORRECT)
- If match score is 3:5 → `sets_won = 3`, `sets_lost = 5` (CORRECT)
- If match score is 2:2 → `sets_won = 2`, `sets_lost = 2` (CORRECT)

### 2.3 Relationship to Wins/Losses

**Current behavior:**
- `sets_won` is always equal to `wins` (1 if won, 0 if lost/drew)
- `sets_lost` is always equal to `losses` (1 if lost, 0 if won/drew)
- This is why the user observes `sets_won === wins` and `sets_lost === losses`

**Intended behavior:**
- `sets_won` should be the sum of all sets won across all matches
- `sets_lost` should be the sum of all sets lost across all matches
- These should be independent of match win/loss counts

---

## 3. Applies to All Rating Systems

### 3.1 Singles (`player_ratings`)

**Location:** `lib/elo/updates.ts:71-74`
**Status:** ❌ Broken - uses binary logic

### 3.2 Player Doubles (`player_double_ratings`)

**Location:** `lib/elo/updates.ts:501-502, 524-525, 548-549, 571-572`
**Status:** ❌ Broken - uses binary logic (same values as team doubles)

### 3.3 Team Doubles (`double_team_ratings`)

**Location:** `lib/elo/updates.ts:401-402, 448-449`
**Status:** ❌ Broken - uses binary logic

**All three systems have identical bugs.**

---

## 4. Increment Behavior

### 4.1 Per-Match Increment

**Current behavior:**
- `sets_won` and `sets_lost` are incremented once per match
- Values are always 0 or 1 per match
- They are never incremented per set

### 4.2 What Should Happen

If match scores represent sets:
- `sets_won` should be incremented by the actual score value (e.g., +4 for a 4:2 match)
- `sets_lost` should be incremented by the opponent's score value (e.g., +2 for a 4:2 match)

---

## 5. Data Model Support

### 5.1 Database Schema

**Tables:** `player_ratings`, `player_double_ratings`, `double_team_ratings`
**Fields:** `sets_won INTEGER NOT NULL DEFAULT 0`, `sets_lost INTEGER NOT NULL DEFAULT 0`

**Status:** ✅ Schema supports proper set tracking (INTEGER fields can store any count)

### 5.2 Match Score Storage

**Table:** `session_matches`
**Fields:** `team1_score INTEGER`, `team2_score INTEGER`

**Status:** ✅ Match scores are stored as integers, which could represent sets

### 5.3 UI Input

**File:** `app/session/[id]/page.tsx`
**Lines 2490-2540:** Numeric input fields for match scores

**Observation:** The UI accepts numeric values that could represent sets (e.g., 4, 2, 3, 5), but there's no explicit labeling indicating whether these are sets or points.

### 5.4 Interpretation Ambiguity

**Question:** Do `team1_score` and `team2_score` represent:
- Sets won in the match? (e.g., 4:2 means 4 sets to 2)
- Total points scored? (e.g., 40:30 means 40 points to 30)
- Games won? (e.g., 6:4 means 6 games to 4)

**Current code assumption:** The code treats scores as binary win/loss indicators, which suggests the developers may have misunderstood what the scores represent, OR the scores are intended to be sets but the implementation is wrong.

**Evidence for "sets" interpretation:**
- Field names `sets_won` and `sets_lost` suggest sets are the intended unit
- Database schema allows INTEGER values (not just 0/1)
- UI accepts numeric inputs that could represent multiple sets

**Evidence against "sets" interpretation:**
- No documentation or comments clarifying what scores represent
- No validation that scores are reasonable set counts (e.g., max sets per match)

---

## 6. Summary of Findings

### 6.1 Where the Bug Originates

**Primary source:** `lib/elo/updates.ts`
- Lines 71-74 (singles)
- Lines 387-390 (doubles)

**Secondary sources:** Match replay logic in `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`
- All replay logic replicates the same binary calculation

### 6.2 Is This a Bug, Misnamed Field, or Unfinished Feature?

**Verdict: This is a BUG.**

**Reasoning:**
1. **Field names are clear:** `sets_won` and `sets_lost` explicitly indicate set tracking
2. **Schema supports it:** INTEGER fields can store actual set counts
3. **Implementation is wrong:** Code treats scores as binary win/loss instead of set counts
4. **Consistent across all systems:** Same bug in singles, player doubles, and team doubles
5. **No evidence of alternative intent:** No comments or documentation suggesting these fields should track match wins/losses

### 6.3 Intended Meaning (Based on Code)

**Based on field names and schema:** The fields are intended to track sets won and lost across all matches.

**Based on current implementation:** The code treats them as match win/loss counters (duplicating `wins` and `losses`).

**Conclusion:** The intended meaning (sets) is clear from naming and schema, but the implementation is incorrect.

---

## 7. Impact Assessment

### 7.1 Data Integrity

**Current state:**
- All existing `sets_won` values equal `wins`
- All existing `sets_lost` values equal `losses`
- No historical set data is preserved

### 7.2 Statistics Accuracy

**Affected features:**
- Statistics page (`app/statistics/page.tsx`) displays `sets_won` and `sets_lost`
- These values are currently meaningless (duplicates of wins/losses)

### 7.3 Fix Complexity

**To fix:**
1. Change calculation logic to use actual score values instead of binary
2. Recalculate all historical data (if match scores are available)
3. Update all three rating systems consistently

**Challenges:**
- Historical data may not be recoverable if match scores weren't stored
- Need to verify what match scores actually represent (sets vs points vs games)

---

## 8. Recommendations

### 8.1 Immediate Actions

1. **Verify match score semantics:** Determine if `team1_score`/`team2_score` represent sets, points, or games
2. **Document findings:** Add comments/clarification about what scores represent
3. **Plan fix:** Design the correct calculation logic based on score semantics

### 8.2 Fix Strategy

**If scores represent sets:**
- Change calculation from `score1 > score2 ? 1 : 0` to `score1` and `score2` directly
- Recalculate all historical data using stored match scores
- Update all three rating systems

**If scores represent something else:**
- Determine if set tracking is still needed
- If yes, add new fields or change data model
- If no, consider removing `sets_won`/`sets_lost` fields

### 8.3 Data Migration

**If fixing:**
- Historical matches with stored scores can be recalculated
- Matches without scores cannot be fixed retroactively
- Consider a migration script to recalculate from `session_matches.team1_score` and `team2_score`

---

## Conclusion

**Are sets_won / sets_lost fundamentally broken, or just misused?**

**Answer: They are fundamentally broken.**

The fields are correctly named and the schema supports proper set tracking, but the implementation treats match scores as binary win/loss indicators instead of actual set counts. This is a clear bug that affects all three rating systems consistently.

The fix requires:
1. Understanding what match scores actually represent
2. Changing the calculation logic to use score values directly
3. Recalculating historical data (where possible)

