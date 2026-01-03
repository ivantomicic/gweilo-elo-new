# Elo Calculation Pipeline - Precision & Rounding Audit

## Executive Summary

This audit examines the entire Elo calculation pipeline (singles, doubles teams, doubles players) to verify consistent rounding and precision rules across all code paths.

**Status:** ✅ **Calculation logic is consistent** - All paths use `calculateEloDelta()` which preserves decimal precision. However, **database schema migration status is unknown**, which could cause precision loss if columns are still `INTEGER`.

---

## 1. Elo Calculation Points - Complete Inventory

### 1.1 Core Calculation Function

**File:** `lib/elo/calculation.ts`

**Function:** `calculateEloDelta()`

```73:85:lib/elo/calculation.ts
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
	return delta; // Return decimal delta - no rounding
}
```

**Precision Behavior:**
- ✅ **No rounding** - Returns decimal values (e.g., `17.3`, `-5.67`)
- ✅ Uses JavaScript floating-point math directly
- ✅ Decimal precision preserved in return value

**Used By:**
- Singles match updates
- Doubles team updates
- Doubles player updates (via team delta)
- Edit/replay logic

---

### 1.2 Singles Elo Updates

**File:** `lib/elo/updates.ts`

**Function:** `updateSinglesRatings()`

```55:68:lib/elo/updates.ts
	// Calculate Elo changes based on current ratings and match counts (for dynamic K-factor)
	// Decimal precision is preserved - no rounding
	const player1Delta = calculateEloDelta(
		player1Elo,
		player2Elo,
		player1Result as MatchResult,
		player1MatchCount
	);
	const player2Delta = calculateEloDelta(
		player2Elo,
		player1Elo,
		player2Result as MatchResult,
		player2MatchCount
	);
```

**Precision Behavior:**
- ✅ **No rounding** - Delta passed directly to RPC function
- ✅ Decimal precision preserved through entire path

**Persistence:**
```77:85:lib/elo/updates.ts
	// Update player 1 rating
	const { error: error1 } = await supabase.rpc("upsert_player_rating", {
		p_player_id: player1Id,
		p_elo_delta: player1Delta,
		p_wins: player1Result === "win" ? 1 : 0,
		p_losses: player1Result === "loss" ? 1 : 0,
		p_draws: player1Result === "draw" ? 1 : 0,
		p_sets_won: player1SetsWon,
		p_sets_lost: player1SetsLost,
	});
```

**Precision Behavior:**
- ✅ Delta passed directly (no rounding before RPC call)
- ⚠️ **RPC function must accept `NUMERIC(10,2)`** to preserve decimals
- ⚠️ **Database column must be `NUMERIC(10,2)`** to store decimals

---

### 1.3 Doubles Team Elo Updates

**File:** `lib/elo/updates.ts`

**Function:** `updateDoublesRatings()`

```218:231:lib/elo/updates.ts
	// Calculate Elo changes for teams using dynamic K-factor (based on team match count)
	// Decimal precision is preserved - no rounding
	const team1Delta = calculateEloDelta(
		team1Elo,
		team2Elo,
		team1Result as MatchResult,
		team1MatchCount
	);
	const team2Delta = calculateEloDelta(
		team2Elo,
		team1Elo,
		team2Result as MatchResult,
		team2MatchCount
	);
```

**Precision Behavior:**
- ✅ **No rounding** - Delta passed directly to RPC function
- ✅ Decimal precision preserved through entire path

**Persistence:**
```259:270:lib/elo/updates.ts
	// Update team ratings
	const { error: team1Error } = await supabase.rpc(
		"upsert_double_team_rating",
		{
			p_team_id: team1Id,
			p_elo_delta: team1Delta,
			p_wins: team1Result === "win" ? 1 : 0,
			p_losses: team1Result === "loss" ? 1 : 0,
			p_draws: team1Result === "draw" ? 1 : 0,
			p_sets_won: team1SetsWon,
			p_sets_lost: team1SetsLost,
		}
	);
```

**Precision Behavior:**
- ✅ Delta passed directly (no rounding before RPC call)
- ⚠️ **RPC function must accept `NUMERIC(10,2)`** to preserve decimals
- ⚠️ **Database column must be `NUMERIC(10,2)`** to store decimals

---

### 1.4 Doubles Player Elo Updates

**File:** `lib/elo/updates.ts`

**Function:** `updateDoublesRatings()` (continued)

```359:371:lib/elo/updates.ts
	// Team 1 players - use team delta (both get same delta)
	const { error: team1Player1Error } = await supabase.rpc(
		"upsert_player_double_rating",
		{
			p_player_id: team1PlayerIds[0],
			p_elo_delta: team1Delta,
			p_wins: team1Result === "win" ? 1 : 0,
			p_losses: team1Result === "loss" ? 1 : 0,
			p_draws: team1Result === "draw" ? 1 : 0,
			p_sets_won: team1SetsWon,
			p_sets_lost: team1SetsLost,
		}
	);
```

**Precision Behavior:**
- ✅ **Uses same team delta** (no recalculation, no rounding)
- ✅ Decimal precision preserved (if team delta has decimals)
- ⚠️ **RPC function must accept `NUMERIC(10,2)`** to preserve decimals
- ⚠️ **Database column must be `NUMERIC(10,2)`** to store decimals

---

### 1.5 Live Match Submission

**File:** `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`

**Path:** Round submission → `updateSinglesRatings()` or `updateDoublesRatings()`

```264:269:app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts
				try {
					await updateSinglesRatings(
						playerIds[0],
						playerIds[1],
						score.team1Score,
						score.team2Score
					);
```

**Precision Behavior:**
- ✅ Calls `updateSinglesRatings()` or `updateDoublesRatings()` directly
- ✅ No intermediate rounding
- ✅ Decimal precision preserved (if DB schema supports it)

---

### 1.6 Edit/Replay Logic - Singles

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Path:** In-memory replay → `calculateEloDelta()` → Accumulate → Persist

```1024:1035:app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts
					const player1Delta = calculateEloDelta(
						player1EloBefore,
						player2EloBefore,
						player1Result,
						player1MatchesPlayedBefore
					);
					const player2Delta = calculateEloDelta(
						player2EloBefore,
						player1EloBefore,
						player2Result,
						player2MatchesPlayedBefore
					);
```

**In-Memory Accumulation:**
```1085:1086:app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts
					// Update state in memory
					player1State.elo += player1Delta;
```

**Precision Behavior:**
- ✅ Uses `calculateEloDelta()` directly (no rounding)
- ✅ Accumulates in memory with JavaScript `number` type (preserves decimals)
- ✅ Final state written via `.upsert()` (preserves decimals if DB schema supports it)

---

### 1.7 Edit/Replay Logic - Doubles Teams

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Path:** In-memory replay → `calculateEloDelta()` → Accumulate → Persist

```1345:1356:app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts
					// Calculate team Elo deltas using team Elo from memory
					const team1Delta = calculateEloDelta(
						team1EloBefore,
						team2EloBefore,
						team1Result,
						team1MatchesPlayedBefore
					);
					const team2Delta = calculateEloDelta(
						team2EloBefore,
						team1EloBefore,
						team2Result,
						team2MatchesPlayedBefore
					);
```

**In-Memory Accumulation:**
```1429:1430:app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts
					// Update team state in memory
					team1State.elo += team1Delta;
```

**Precision Behavior:**
- ✅ Uses `calculateEloDelta()` directly (no rounding)
- ✅ Accumulates in memory with JavaScript `number` type (preserves decimals)
- ✅ Final state written via `.upsert()` (preserves decimals if DB schema supports it)

---

### 1.8 Edit/Replay Logic - Doubles Players

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Path:** Uses team delta → Accumulate in memory → Persist

```1464:1465:app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts
					player1DoublesState.elo += team1Delta;
					player2DoublesState.elo += team1Delta;
```

**Precision Behavior:**
- ✅ Uses same team delta (no recalculation, no rounding)
- ✅ Accumulates in memory with JavaScript `number` type (preserves decimals)
- ✅ Final state written via `.upsert()` (preserves decimals if DB schema supports it)

---

### 1.9 Snapshot Creation

**File:** `lib/elo/snapshots.ts`

**Function:** `createEloSnapshots()`

```44:54:lib/elo/snapshots.ts
				if (state) {
					snapshots.push({
						match_id: matchId,
						player_id: playerId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
						sets_won: state.sets_won,
						sets_lost: state.sets_lost,
					});
```

**Precision Behavior:**
- ✅ Uses in-memory state directly (no rounding)
- ✅ Or reads from DB and uses value as-is (no rounding)
- ⚠️ **Database column must be `NUMERIC(10,2)`** to store decimals

---

### 1.10 Snapshot Reading

**File:** `lib/elo/snapshots.ts`

**Functions:** `getSnapshotBeforeMatch()`, `getInitialBaseline()`, `getPreviousSessionSnapshot()`

```303:307:lib/elo/snapshots.ts
	return {
		...snapshot,
		elo:
			typeof snapshot.elo === "string"
				? parseFloat(snapshot.elo)
				: Number(snapshot.elo),
	};
```

**Precision Behavior:**
- ✅ Converts `NUMERIC(10,2)` from DB to JavaScript `number` (preserves decimals)
- ✅ Uses `parseFloat()` or `Number()` (no rounding)
- ✅ Decimal precision preserved

---

### 1.11 Database Persistence

**RPC Functions:** `upsert_player_rating()`, `upsert_player_double_rating()`, `upsert_double_team_rating()`

**Migration File:** `supabase-complete-decimal-migration.sql`

```110:145:supabase-complete-decimal-migration.sql
CREATE OR REPLACE FUNCTION public.upsert_player_rating(
    p_player_id UUID,
    p_elo_delta NUMERIC(10, 2),  -- NUMERIC preserves decimal precision
    p_wins INTEGER,
    p_losses INTEGER,
    p_draws INTEGER,
    p_sets_won INTEGER,
    p_sets_lost INTEGER
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.player_ratings (
        player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, updated_at
    )
    VALUES (
        p_player_id,
        1500.00 + p_elo_delta,  -- NUMERIC addition preserves precision
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
        elo = player_ratings.elo + p_elo_delta,  -- NUMERIC addition preserves precision
```

**Precision Behavior:**
- ✅ **If migration run:** RPC accepts `NUMERIC(10,2)`, columns are `NUMERIC(10,2)` → Decimals preserved
- ❌ **If migration NOT run:** RPC expects `INTEGER`, columns are `INTEGER` → Decimals lost

**Status:** ⚠️ **UNKNOWN** - Migration exists but status is unknown

---

### 1.12 Display/Formatting

**File:** `lib/elo/format.ts`

**Functions:** `formatElo()`, `formatEloDelta()`

```20:37:lib/elo/format.ts
export function formatElo(elo: number | string | null | undefined, round: boolean = false): string {
	if (elo === null || elo === undefined) {
		return "1500";
	}

	const eloNum = typeof elo === "string" ? parseFloat(elo) : elo;

	if (isNaN(eloNum)) {
		return "1500";
	}

	if (round) {
		return Math.round(eloNum).toString();
	}

	// Show 2 decimal places, but remove trailing zeros
	return eloNum.toFixed(2).replace(/\.?0+$/, "");
}
```

**Precision Behavior:**
- ✅ **Display-only** - Does NOT modify stored values
- ✅ Optional rounding for display (user-controlled via `round` parameter)
- ✅ Default: Shows 2 decimal places (removes trailing zeros)

---

## 2. Precision Behavior Summary

### 2.1 Calculation Phase

| Path | Function | Rounding? | Decimal Places |
|------|----------|-----------|----------------|
| Singles | `calculateEloDelta()` | ❌ No | Full precision |
| Doubles Teams | `calculateEloDelta()` | ❌ No | Full precision |
| Doubles Players | Uses team delta | ❌ No | Full precision |

**Status:** ✅ **Consistent** - All paths use `calculateEloDelta()` which preserves decimals

---

### 2.2 Persistence Phase

| Path | Method | Rounding? | Decimal Places |
|------|--------|-----------|----------------|
| Singles (Live) | RPC `upsert_player_rating()` | ⚠️ Depends on DB schema | 2 (if NUMERIC) or 0 (if INTEGER) |
| Doubles Teams (Live) | RPC `upsert_double_team_rating()` | ⚠️ Depends on DB schema | 2 (if NUMERIC) or 0 (if INTEGER) |
| Doubles Players (Live) | RPC `upsert_player_double_rating()` | ⚠️ Depends on DB schema | 2 (if NUMERIC) or 0 (if INTEGER) |
| Singles (Edit/Replay) | Direct `.upsert()` | ⚠️ Depends on DB schema | 2 (if NUMERIC) or 0 (if INTEGER) |
| Doubles Teams (Edit/Replay) | Direct `.upsert()` | ⚠️ Depends on DB schema | 2 (if NUMERIC) or 0 (if INTEGER) |
| Doubles Players (Edit/Replay) | Direct `.upsert()` | ⚠️ Depends on DB schema | 2 (if NUMERIC) or 0 (if INTEGER) |

**Status:** ⚠️ **Depends on database schema** - If migration not run, precision lost at DB level

---

### 2.3 Display Phase

| Path | Function | Rounding? | Decimal Places |
|------|----------|-----------|----------------|
| All | `formatElo()` (default) | ❌ No | 2 (removes trailing zeros) |
| All | `formatElo()` (round=true) | ✅ Yes | 0 (integer) |

**Status:** ✅ **Consistent** - Display-only, does not modify stored values

---

## 3. Detected Mismatches

### 3.1 Database Schema Status Unknown

**Issue:** Migration `supabase-complete-decimal-migration.sql` exists but status is unknown.

**Impact:**
- If **NOT run:** All Elo columns are `INTEGER` → Decimals lost at DB level
- If **run:** All Elo columns are `NUMERIC(10,2)` → Decimals preserved

**Evidence:**
- Migration file exists: `supabase-complete-decimal-migration.sql`
- Code assumes decimals are preserved (no rounding before persistence)
- No verification query has been run to confirm schema state

**Severity:** 🔴 **CRITICAL** - This is the primary source of potential precision loss

---

### 3.2 Obsolete File with Rounding

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit-snapshot-based.ts`

**Issue:** Contains `Math.round()` calls on Elo deltas (lines 490-491)

**Status:** ⚠️ **OBSOLETE** - File is not referenced anywhere in the codebase

**Action:** Consider deleting this file or updating it to use `calculateEloDelta()` for consistency

---

### 3.3 Display-Only Rounding (Not an Issue)

**File:** `lib/elo.ts`

**Function:** `averageElo()` - Rounds average Elo for doubles display

**Status:** ✅ **ACCEPTABLE** - This is for UI display only (averaging player Elos to show team Elo estimate), not for actual Elo calculations

---

### 3.4 No Rounding Inconsistencies in Active Code

**Status:** ✅ **No mismatches detected** in active code paths

- All calculation paths use `calculateEloDelta()` consistently
- No rounding happens before persistence in active code
- Display formatting is consistent and optional

---

## 4. Proposed Global Elo Precision Policy

### Policy: "Preserve Full Decimal Precision Internally, Round Only for Display"

**Rules:**
1. **Calculation:** Never round during calculation - use `calculateEloDelta()` which returns full precision
2. **Storage:** Store Elo as `NUMERIC(10,2)` in database (2 decimal places max)
3. **Persistence:** Never round before writing to database - pass decimals directly
4. **Display:** Round only for UI display using `formatElo(elo, round=true)` if desired
5. **Consistency:** Singles, doubles teams, and doubles players follow identical rules

**Rationale:**
- Preserves precision through entire calculation chain
- Avoids floating-point drift accumulation
- Makes calculations deterministic and idempotent
- Allows flexible display formatting without affecting stored values

---

## 5. Implementation Checklist

### 5.1 Database Schema Verification

- [ ] **Run verification query** to check if migration was applied:
  ```sql
  SELECT 
      table_name,
      column_name,
      data_type,
      numeric_precision,
      numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
      AND column_name LIKE '%elo%'
      AND table_name IN (
          'player_ratings',
          'player_double_ratings',
          'double_team_ratings',
          'elo_snapshots',
          'session_rating_snapshots',
          'match_elo_history'
      )
  ORDER BY table_name, column_name;
  ```
- [ ] **If columns are `INTEGER`:** Run `supabase-complete-decimal-migration.sql`
- [ ] **If columns are `NUMERIC(10,2)`:** ✅ Schema is correct

---

### 5.2 Code Verification

- [x] ✅ All calculation paths use `calculateEloDelta()` (verified)
- [x] ✅ No rounding before persistence (verified)
- [x] ✅ Display formatting is optional and doesn't modify stored values (verified)
- [ ] **Verify RPC functions** accept `NUMERIC(10,2)`:
  ```sql
  SELECT 
      routine_name,
      parameter_name,
      data_type,
      numeric_precision,
      numeric_scale
  FROM information_schema.parameters
  WHERE routine_schema = 'public'
      AND routine_name IN (
          'upsert_player_rating',
          'upsert_player_double_rating',
          'upsert_double_team_rating'
      )
      AND parameter_name = 'p_elo_delta';
  ```
- [ ] **Expected:** `data_type = 'numeric'`, `numeric_precision = 10`, `numeric_scale = 2`

---

### 5.3 Verification Tests

- [ ] **Test 1: New session vs edited session produces identical Elo**
  - Create a session with 3 matches
  - Note final Elo values
  - Edit the first match (change score)
  - Verify final Elo values match (within 0.01 tolerance)

- [ ] **Test 2: Replaying the same session twice is idempotent**
  - Create a session with 3 matches
  - Note final Elo values
  - Edit any match (change and revert)
  - Verify final Elo values are identical (bit-identical, not just within tolerance)

- [ ] **Test 3: Singles and doubles follow the same rounding behavior**
  - Create a singles match between two 1500-rated players (K=40)
  - Create a doubles match between two 1500-rated teams (K=40)
  - Verify both produce identical deltas (±20.00 for win/loss)
  - Verify decimals are preserved (e.g., 1520.00, not 1520)

---

## 6. Action Items

### Immediate (Critical)

1. **Verify database schema** - Run verification query to check if migration was applied
2. **If migration not applied:** Run `supabase-complete-decimal-migration.sql`
3. **Verify RPC functions** - Confirm they accept `NUMERIC(10,2)` parameters

### Short-term (Important)

4. **Run verification tests** - Confirm idempotency and consistency
5. **Add unit tests** - Test `calculateEloDelta()` with various inputs to verify decimal precision
6. **Document expected behavior** - Add comments explaining precision policy

### Long-term (Nice to have)

7. **Add precision validation** - Log warnings if Elo values are unexpectedly rounded
8. **Add integration tests** - Test full pipeline (calculation → persistence → retrieval) for precision

---

## 7. Conclusion

**Code Logic:** ✅ **Consistent** - All paths use `calculateEloDelta()` which preserves decimal precision. No rounding happens before persistence.

**Database Schema:** ⚠️ **Unknown** - Migration exists but status is unknown. This is the primary risk for precision loss.

**Recommendation:** 
1. **Verify database schema** immediately
2. **Run migration if needed** (`supabase-complete-decimal-migration.sql`)
3. **Run verification tests** to confirm idempotency

Once database schema is confirmed as `NUMERIC(10,2)`, the system will have **fully deterministic and predictable Elo calculations** with no precision loss.

