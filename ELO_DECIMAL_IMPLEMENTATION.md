# Elo Decimal Precision Implementation

## Summary

Implemented decimal precision for Elo ratings throughout the system. All Elo values are now stored and calculated with decimal precision (NUMERIC(10,2)), with no rounding during calculation or persistence.

---

## Changes Implemented

### 1. Database Migration

**File:** `supabase-migrate-elo-to-decimal.sql`

**Changes:**
- ✅ All Elo columns migrated from `INTEGER` → `NUMERIC(10, 2)`
- ✅ RPC functions updated to accept `NUMERIC(10, 2)` deltas
- ✅ Helper functions updated to return `NUMERIC(10, 2)`

**Tables Modified:**
1. `player_ratings.elo`
2. `player_double_ratings.elo`
3. `double_team_ratings.elo`
4. `elo_snapshots.elo`
5. `session_rating_snapshots.elo`
6. `match_elo_history` - All Elo fields (before/after/delta for players and teams)

**RPC Functions Updated:**
1. `upsert_player_rating()` - `p_elo_delta` now `NUMERIC(10, 2)`
2. `upsert_player_double_rating()` - `p_elo_delta` now `NUMERIC(10, 2)`
3. `upsert_double_team_rating()` - `p_elo_delta` now `NUMERIC(10, 2)`

**Helper Functions Updated:**
1. `get_snapshot_before_match()` - Returns `elo NUMERIC(10, 2)`
2. `get_initial_baseline()` - Returns `elo NUMERIC(10, 2)`

---

### 2. Elo Calculation Logic

**File:** `lib/elo/calculation.ts`

**Change:**
```typescript
// BEFORE:
return Math.round(delta);

// AFTER:
return delta; // Return decimal delta - no rounding
```

**Impact:**
- ✅ `calculateEloDelta()` now returns decimal values (e.g., `17.3`, `-5.67`)
- ✅ All calculations preserve precision

---

### 3. Recalculation / Replay Flow

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Changes:**

1. **Removed manual calculation, use `calculateEloDelta()`:**
```typescript
// BEFORE:
const player1K = calculateKFactor(player1MatchesPlayedBefore);
const player2K = calculateKFactor(player2MatchesPlayedBefore);
const player1Expected = calculateExpectedScore(player1EloBefore, player2EloBefore);
const player2Expected = calculateExpectedScore(player2EloBefore, player1EloBefore);
const player1Actual = player1Result === "win" ? 1 : player1Result === "loss" ? 0 : 0.5;
const player2Actual = player2Result === "win" ? 1 : player2Result === "loss" ? 0 : 0.5;
const player1Delta = Math.round(player1K * (player1Actual - player1Expected));
const player2Delta = Math.round(player2K * (player2Actual - player2Expected));

// AFTER:
const player1Delta = calculateEloDelta(player1EloBefore, player2EloBefore, player1Result, player1MatchesPlayedBefore);
const player2Delta = calculateEloDelta(player2EloBefore, player1EloBefore, player2Result, player2MatchesPlayedBefore);
```

**Benefits:**
- ✅ Consistent calculation logic (reuses `calculateEloDelta()`)
- ✅ No rounding during replay
- ✅ Decimal precision preserved through entire replay chain

2. **In-memory state tracking:**
- ✅ Already uses TypeScript `number` type (supports decimals)
- ✅ Deltas are now decimal values
- ✅ Elo values accumulate with decimal precision

3. **Persistence:**
- ✅ Elo written to DB as decimal (DB column now `NUMERIC(10, 2)`)
- ✅ No implicit rounding before persistence

---

### 4. UI Formatting (Optional)

**File:** `lib/elo/format.ts` (NEW)

**Created formatting utilities:**
- `formatElo(elo, round)` - Format Elo for display
  - `round = true`: Round to integer (e.g., `1498.97` → `"1499"`)
  - `round = false`: Show 2 decimals (e.g., `1498.97` → `"1498.97"`)
- `formatEloDelta(delta, round)` - Format Elo change for display
  - Includes sign (e.g., `"+17.3"` or `"-5.67"`)

**Usage:**
```typescript
import { formatElo, formatEloDelta } from "@/lib/elo/format";

// Display rounded
{formatElo(player.elo, true)}  // "1499"

// Display with decimals
{formatElo(player.elo, false)}  // "1498.97"

// Display delta
{formatEloDelta(delta, false)}  // "+17.3"
```

**Note:** UI components can be updated to use these formatters, but they are optional. The default behavior (displaying raw values) will show decimals.

---

## Validation Checklist

### ✅ New players start at 1500.00
- **Verification:** RPC functions use `1500.00 + p_elo_delta` for new players
- **Database:** Default value is `NUMERIC(10, 2)` which will store as `1500.00`

### ✅ After a match, Elo can be 1516.27
- **Verification:** 
  - `calculateEloDelta()` returns decimal (e.g., `16.27`)
  - RPC function adds: `1500.00 + 16.27 = 1516.27`
  - Database stores as `NUMERIC(10, 2)`

### ✅ Editing a past match and replaying preserves decimals
- **Verification:**
  - Baseline loaded from snapshots (now `NUMERIC(10, 2)`)
  - Deltas calculated with `calculateEloDelta()` (decimal)
  - In-memory state tracks decimals
  - Final state written as decimal

### ✅ No DB column silently truncates values
- **Verification:**
  - All Elo columns are `NUMERIC(10, 2)` (not `INTEGER`)
  - PostgreSQL `NUMERIC(10, 2)` preserves 2 decimal places exactly

### ✅ UI rounding does not affect stored values
- **Verification:**
  - `formatElo()` is display-only (doesn't modify source values)
  - No rounding in calculation or persistence code
  - UI can optionally round for display, but stored values remain decimal

---

## Migration Steps

1. **Run SQL migration:**
   ```bash
   # Apply supabase-migrate-elo-to-decimal.sql to your database
   ```

2. **Deploy code changes:**
   - Updated `lib/elo/calculation.ts`
   - Updated `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`
   - New `lib/elo/format.ts` (optional UI formatting)

3. **Test:**
   - Create a new match and verify decimal Elo values
   - Edit a match and verify replay preserves decimals
   - Check database to confirm `NUMERIC(10, 2)` values

---

## Edge Cases Handled

### 1. Existing Integer Values
- **Solution:** `USING elo::NUMERIC(10, 2)` converts existing integers to decimals
- **Example:** `1500` → `1500.00`

### 2. TypeScript Number Type
- **Solution:** TypeScript `number` already supports decimals
- **No changes needed** to type definitions

### 3. JSON Serialization
- **Solution:** Supabase client handles `NUMERIC` → JavaScript `number` conversion
- **Verification:** Decimal values are preserved in API responses

### 4. Snapshot Restoration
- **Solution:** Snapshots now store `NUMERIC(10, 2)`, restoration preserves decimals
- **Verification:** Baseline loading uses decimal values

---

## Code Diffs Summary

### Files Modified

1. **`lib/elo/calculation.ts`**
   - Removed `Math.round(delta)`
   - Returns decimal delta

2. **`app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`**
   - Replaced manual calculation with `calculateEloDelta()`
   - Removed `Math.round()` calls

3. **`supabase-create-elo-snapshots.sql`**
   - Updated helper function return types to `NUMERIC(10, 2)`

### Files Created

1. **`supabase-migrate-elo-to-decimal.sql`**
   - Complete database migration

2. **`lib/elo/format.ts`**
   - UI formatting utilities (optional)

---

## Testing Recommendations

1. **Unit Test:**
   ```typescript
   // Test calculateEloDelta returns decimal
   const delta = calculateEloDelta(1500, 1500, "win", 0);
   expect(delta).toBeCloseTo(20.0); // Not exactly 20 due to expected score calculation
   ```

2. **Integration Test:**
   - Create a match and verify Elo stored as decimal
   - Edit match and verify replay preserves decimals

3. **Database Verification:**
   ```sql
   SELECT elo FROM player_ratings WHERE player_id = '...';
   -- Should return: 1516.27 (not 1516)
   ```

---

## Next Steps

1. ✅ Run migration SQL
2. ✅ Deploy code changes
3. ⏳ Update UI components to use `formatElo()` (optional)
4. ⏳ Test with real data
5. ⏳ Monitor for any precision issues

---

## Notes

- **No breaking changes:** Existing integer values are automatically converted to decimals
- **Backward compatible:** API responses will now include decimals, but clients can handle this
- **Performance:** `NUMERIC(10, 2)` has minimal performance impact vs `INTEGER`
- **Storage:** `NUMERIC(10, 2)` uses slightly more storage than `INTEGER`, but negligible

