# Elo Precision and Rounding Audit

## Executive Summary

**Current State:** The system uses **integer-only Elo values** with rounding applied at calculation time. No decimal precision is preserved anywhere in the system.

**Key Finding:** Elo deltas are rounded using `Math.round()` before being applied, and all database columns are `INTEGER` type, meaning values like `1498.97` are stored as `1499`.

---

## 1. Elo Calculation Functions

### 1.1 Core Calculation Function

**File:** `lib/elo/calculation.ts`

**Function:** `calculateEloDelta()`

**Location:** Line 84

```typescript
export function calculateEloDelta(
    playerElo: number,
    opponentElo: number,
    result: MatchResult,
    matchCount: number = 0
): number {
    const K = calculateKFactor(matchCount);
    const expectedScore = calculateExpectedScore(playerElo, opponentElo);
    const actualScore = getActualScore(result);

    const delta = K * (actualScore - expectedScore);
    return Math.round(delta);  // ⚠️ ROUNDING HAPPENS HERE
}
```

**Finding:**
- ✅ Calculation uses floating-point math (`K * (actualScore - expectedScore)`)
- ❌ **Result is rounded to integer** using `Math.round()`
- Example: If delta = `17.3`, it becomes `17`. If delta = `-17.7`, it becomes `-18`.

**Impact:** All Elo deltas are integers before being applied.

---

### 1.2 Recalculation Flow (Edit Match)

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Location:** Lines 490-491

```typescript
const player1Delta = Math.round(player1K * (player1Actual - player1Expected));
const player2Delta = Math.round(player2K * (player2Actual - player2Expected));
```

**Finding:**
- ❌ **Additional rounding** happens in the recalculation flow
- This is redundant since `calculateEloDelta()` already rounds, but it's used directly here
- Note: The edit route calculates deltas manually instead of using `calculateEloDelta()`

**Impact:** Consistent rounding behavior, but code duplication.

---

## 2. Database Schema

### 2.1 Elo Rating Tables

All Elo columns are defined as `INTEGER`:

#### `player_ratings` (Singles)
**File:** `supabase-setup-elo-ratings.sql`, Line 18
```sql
elo INTEGER NOT NULL DEFAULT 1500,
```

#### `player_double_ratings` (Individual Doubles)
**File:** `supabase-setup-elo-ratings.sql`, Line 31
```sql
elo INTEGER NOT NULL DEFAULT 1500,
```

#### `double_team_ratings` (Team Doubles)
**File:** `supabase-setup-elo-ratings.sql`, Line 53
```sql
elo INTEGER NOT NULL DEFAULT 1500,
```

**Finding:**
- ❌ **All Elo columns are `INTEGER`** - cannot store decimal values
- Values like `1498.97` would be truncated/rounded to `1499` (or `1498` depending on rounding mode)
- PostgreSQL `INTEGER` type: 32-bit signed integer (-2,147,483,648 to 2,147,483,647)

---

### 2.2 Elo History Tables

#### `match_elo_history`
**File:** `supabase-create-match-elo-history.sql`, Lines 20-25, 30-35
```sql
player1_elo_before INTEGER,
player1_elo_after INTEGER,
player1_elo_delta INTEGER,
player2_elo_before INTEGER,
player2_elo_after INTEGER,
player2_elo_delta INTEGER,
-- ... (same for teams)
```

**Finding:**
- ❌ **All Elo fields in history are `INTEGER`**
- No precision preserved in audit trail

---

### 2.3 Snapshot Tables

#### `elo_snapshots`
**File:** `supabase-create-elo-snapshots.sql`, Line 24
```sql
elo INTEGER NOT NULL,
```

#### `session_rating_snapshots`
**File:** `supabase-create-session-rating-snapshots.sql`, Line 25
```sql
elo INTEGER NOT NULL,
```

**Finding:**
- ❌ **All snapshot Elo fields are `INTEGER`**
- Baseline restoration loses precision

---

## 3. RPC Functions (Database Updates)

### 3.1 `upsert_player_rating`

**File:** `supabase-setup-elo-ratings.sql`, Lines 134-169

```sql
CREATE OR REPLACE FUNCTION public.upsert_player_rating(
    p_player_id UUID,
    p_elo_delta INTEGER,  -- ⚠️ INTEGER parameter
    ...
)
RETURNS void AS $$
BEGIN
    ...
    ON CONFLICT (player_id) DO UPDATE SET
        elo = player_ratings.elo + p_elo_delta,  -- Integer addition
        ...
END;
```

**Finding:**
- ✅ Function accepts `INTEGER` delta (already rounded by calculation)
- ✅ Addition is integer math: `elo + p_elo_delta`
- ❌ **No precision loss in function itself** (delta is already rounded)

**Similar functions:**
- `upsert_player_double_rating()` - Same pattern
- `upsert_double_team_rating()` - Same pattern

---

## 4. Recalculation / Replay Flow

### 4.1 In-Memory State Tracking

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Location:** Lines 408-421, 538-540

```typescript
const currentState = new Map<string, {
    elo: number;  // ⚠️ TypeScript number (could be decimal)
    matches_played: number;
    wins: number;
    losses: number;
    draws: number;
    sets_won: number;
    sets_lost: number;
}>();

// During replay:
player1State.elo += player1Delta;  // ⚠️ Delta is already rounded integer
```

**Finding:**
- ✅ TypeScript `number` type allows decimals in memory
- ❌ **But deltas are already rounded integers** (`Math.round()` applied)
- ❌ **Final Elo written to DB is integer** (see persistence below)

---

### 4.2 Persistence to Database

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Location:** Lines 649-660

```typescript
// Update player_ratings with final computed state
for (const [playerId, state] of currentState.entries()) {
    await adminClient
        .from("player_ratings")
        .upsert({
            player_id: playerId,
            elo: state.elo,  // ⚠️ Written as integer (DB column is INTEGER)
            matches_played: state.matches_played,
            ...
        });
}
```

**Finding:**
- ❌ **Elo written as integer** (DB column constraint)
- Even if `state.elo` had decimals, PostgreSQL would coerce to integer
- Example: `1498.97` → `1499` (or `1498` depending on rounding mode)

---

## 5. UI Formatting vs Storage

### 5.1 Display in UI

**File:** `app/statistics/page.tsx`, Line 234
```tsx
<TableCell className="text-right font-bold">
    {player.elo}
</TableCell>
```

**File:** `app/session/[id]/page.tsx`, Lines 1784-1797
```tsx
const team1Elo = isSingles
    ? team1Players[0]?.elo || 1500
    : averageElo(team1Players.map((p) => p.elo));
```

**Finding:**
- ✅ **No rounding in UI** - Elo is displayed directly
- ✅ **No formatting** (no `.toFixed()`, etc.)
- ❌ **But Elo is already integer** from database, so no decimals to display

---

## 6. Summary of Precision Loss Points

### Current Precision Loss Chain:

1. **Calculation:** `calculateEloDelta()` → `Math.round(delta)` → Integer delta
2. **Storage:** Integer delta applied to integer Elo → Integer result
3. **Database:** `INTEGER` column type → Cannot store decimals
4. **Replay:** Rounded deltas applied → Integer results
5. **Persistence:** Integer values written → Integer storage

**Result:** No decimal precision anywhere in the system.

---

## 7. Concrete Changes Needed

### 7.1 Database Schema Changes

**Required:** Change all Elo columns from `INTEGER` to `NUMERIC(10, 2)` (or similar)

**Tables to modify:**
1. `player_ratings.elo`
2. `player_double_ratings.elo`
3. `double_team_ratings.elo`
4. `elo_snapshots.elo`
5. `session_rating_snapshots.elo`
6. `match_elo_history` - All Elo fields (before/after/delta)

**Migration example:**
```sql
-- Example for player_ratings
ALTER TABLE public.player_ratings 
    ALTER COLUMN elo TYPE NUMERIC(10, 2) USING elo::NUMERIC(10, 2);
```

---

### 7.2 Code Changes

#### 7.2.1 Remove Rounding from Calculation

**File:** `lib/elo/calculation.ts`, Line 84

**Current:**
```typescript
return Math.round(delta);
```

**Change to:**
```typescript
return delta;  // Return decimal delta
```

---

#### 7.2.2 Update RPC Functions

**File:** `supabase-setup-elo-ratings.sql`

**Current:**
```sql
p_elo_delta INTEGER,
```

**Change to:**
```sql
p_elo_delta NUMERIC(10, 2),
```

**And update function body:**
```sql
elo = player_ratings.elo + p_elo_delta,  -- NUMERIC addition preserves precision
```

---

#### 7.2.3 Update Recalculation Flow

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`, Lines 490-491

**Current:**
```typescript
const player1Delta = Math.round(player1K * (player1Actual - player1Expected));
const player2Delta = Math.round(player2K * (player2Actual - player2Expected));
```

**Change to:**
```typescript
const player1Delta = player1K * (player1Actual - player1Expected);
const player2Delta = player2K * (player2Actual - player2Expected);
```

**Or better:** Use `calculateEloDelta()` after removing rounding.

---

#### 7.2.4 Update TypeScript Types

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`, Line 408

**Current:**
```typescript
elo: number;  // Already allows decimals
```

**No change needed** - TypeScript `number` already supports decimals.

---

### 7.3 UI Formatting (Optional)

**Recommendation:** Add optional rounding for display only

**File:** `app/statistics/page.tsx`, Line 234

**Current:**
```tsx
{player.elo}
```

**Optional change:**
```tsx
{Math.round(player.elo)}  // Round for display only
```

**Or use a formatting utility:**
```tsx
{formatElo(player.elo)}  // e.g., "1498.97" → "1499" or "1498.97" (configurable)
```

---

## 8. Recommended Precision Strategy

### Option 1: Full Decimal Precision (Recommended)

**Storage:** `NUMERIC(10, 2)` - Stores up to 2 decimal places
- Example: `1498.97`, `1500.00`, `1523.45`

**Calculation:** No rounding during calculation or persistence
- Only round for display (optional)

**Pros:**
- ✅ Preserves precision through entire calculation chain
- ✅ More accurate Elo ratings
- ✅ Better for competitive rankings

**Cons:**
- ⚠️ Requires database migration
- ⚠️ Requires code changes

---

### Option 2: Integer with Better Rounding

**Storage:** Keep `INTEGER` but improve rounding strategy
- Use `Math.round()` consistently (already done)
- Consider banker's rounding for edge cases

**Pros:**
- ✅ No database migration needed
- ✅ Minimal code changes

**Cons:**
- ❌ Still loses precision
- ❌ Accumulated rounding errors over many matches

---

### Option 3: High Precision Decimals

**Storage:** `NUMERIC(10, 4)` - 4 decimal places
- Example: `1498.9734`

**Use case:** If you need very high precision for tie-breaking

**Pros:**
- ✅ Maximum precision
- ✅ Future-proof

**Cons:**
- ⚠️ Overkill for most use cases
- ⚠️ More complex migration

---

## 9. Migration Checklist

If implementing Option 1 (Full Decimal Precision):

- [ ] Create migration SQL to change all Elo columns to `NUMERIC(10, 2)`
- [ ] Update RPC function parameters to `NUMERIC(10, 2)`
- [ ] Remove `Math.round()` from `calculateEloDelta()`
- [ ] Remove `Math.round()` from edit route recalculation
- [ ] Test calculation chain with decimal values
- [ ] Test recalculation/replay with decimal values
- [ ] Verify snapshots preserve decimal precision
- [ ] Update UI formatting (optional)
- [ ] Backfill existing integer Elo values (they'll become `1500.00`, etc.)

---

## 10. Testing Requirements

After implementing changes:

1. **Test decimal calculation:**
   - Verify `1498.97 + 17.3 = 1516.27` (not `1516`)

2. **Test recalculation:**
   - Edit a match and verify decimal precision is preserved through replay

3. **Test snapshot restoration:**
   - Verify snapshots store and restore decimal values correctly

4. **Test UI display:**
   - Verify Elo displays correctly (with or without rounding)

---

## Conclusion

**Current State:** Integer-only Elo with rounding at calculation time.

**Recommended:** Implement Option 1 (Full Decimal Precision) with `NUMERIC(10, 2)` storage and no rounding during calculation/persistence.

**Impact:** This will require a database migration and code changes, but will provide more accurate Elo ratings and better support for competitive rankings.

