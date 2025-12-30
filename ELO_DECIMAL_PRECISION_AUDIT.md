# Elo Decimal Precision Loss Audit

## Executive Summary

**Root Cause:** Multiple precision loss points exist in the system. The primary issue is that **RPC functions expect INTEGER parameters** and **code rounds deltas before calling RPC**, causing decimals to be lost during live match submission. Additionally, **database schema may still be INTEGER** (if decimal migration wasn't run), and **edit/replay flow uses direct upsert** which may preserve decimals if schema is NUMERIC, creating inconsistency.

---

## 1. Database Schema Status

### Current Schema (Original)
**File:** `supabase-setup-elo-ratings.sql`

All Elo columns are defined as **INTEGER**:
- `player_ratings.elo` → `INTEGER` (line 18)
- `player_double_ratings.elo` → `INTEGER` (line 31)
- `double_team_ratings.elo` → `INTEGER` (line 53)
- `elo_snapshots.elo` → `INTEGER` (line 24 in `supabase-create-elo-snapshots.sql`)
- `match_elo_history.*_elo_*` → All `INTEGER` (lines 20-35 in `supabase-create-match-elo-history.sql`)

### Migration Available
**File:** `supabase-migrate-elo-to-decimal.sql`

Migration exists to convert all Elo columns to `NUMERIC(10,2)`, but **status is unknown**:
- Migration may or may not have been run
- If NOT run: All columns are still `INTEGER` → **decimals lost at DB level**
- If run: Columns are `NUMERIC(10,2)` → **decimals preserved at DB level**

**Critical:** Need to verify actual database schema state.

---

## 2. Write Paths - Live Match Submission

### Path: Round Submission → RPC Functions

**File:** `lib/elo/updates.ts`

#### Singles Matches (lines 72-74):
```typescript
const player1DeltaRaw = calculateEloDelta(...); // Returns decimal (e.g., 18.64)
const player2DeltaRaw = calculateEloDelta(...); // Returns decimal (e.g., -18.64)

// ❌ PRECISION LOST HERE
const player1Delta = Math.round(player1DeltaRaw); // 18.64 → 19
const player2Delta = Math.round(player2DeltaRaw); // -18.64 → -19
```

**Lines 83-107:** RPC call with rounded deltas:
```typescript
await supabase.rpc("upsert_player_rating", {
    p_elo_delta: player1Delta, // INTEGER (rounded)
    ...
});
```

#### Doubles Matches (lines 241-243):
```typescript
const team1DeltaRaw = calculateEloDelta(...); // Returns decimal
const team2DeltaRaw = calculateEloDelta(...); // Returns decimal

// ❌ PRECISION LOST HERE
const team1Delta = Math.round(team1DeltaRaw); // Rounds to integer
const team2Delta = Math.round(team2DeltaRaw); // Rounds to integer
```

**Lines 274-450:** RPC calls with rounded deltas for teams and players.

**Status:** ✅ **IDENTIFIED** - Decimals lost at code level before DB write.

---

## 3. Write Paths - Edit/Replay Flow

### Path: Edit Route → Direct Upsert

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

#### Singles (lines 1365-1375):
```typescript
await adminClient.from("player_ratings").upsert({
    player_id: playerId,
    elo: state.elo, // Decimal value from in-memory state
    ...
});
```

#### Doubles Teams (lines 1446-1456):
```typescript
await adminClient.from("double_team_ratings").upsert({
    team_id: teamId,
    elo: state.elo, // Decimal value from in-memory state
    ...
});
```

#### Doubles Players (lines 1527-1537):
```typescript
await adminClient.from("player_double_ratings").upsert({
    player_id: playerId,
    elo: state.elo, // Decimal value from in-memory state
    ...
});
```

**Status:** 
- ✅ **Preserves decimals** if schema is `NUMERIC(10,2)`
- ❌ **Loses decimals** if schema is still `INTEGER`
- ⚠️ **Inconsistent** with live submission path (which always rounds)

---

## 4. RPC Functions

### Current RPC Function Signatures

**File:** `supabase-drop-duplicate-rpc-functions.sql` (lines 37-148)

All RPC functions expect **INTEGER** for `p_elo_delta`:
- `upsert_player_rating(p_elo_delta INTEGER, ...)`
- `upsert_player_double_rating(p_elo_delta INTEGER, ...)`
- `upsert_double_team_rating(p_elo_delta INTEGER, ...)`

**SQL Arithmetic:**
```sql
elo = player_ratings.elo + p_elo_delta
```
- If `elo` column is `INTEGER`: Result is integer (decimals truncated)
- If `elo` column is `NUMERIC(10,2)`: Result is numeric, but `p_elo_delta` is INTEGER, so decimals in delta are lost

**Status:** ❌ **RPC functions force INTEGER deltas** → Decimals lost even if schema is NUMERIC.

### Alternative RPC Function Definition

**File:** `supabase-fix-rpc-security.sql` (lines 28-139)

Defines RPC functions with `NUMERIC(10,2)` parameters, but **this file may not have been applied** if `supabase-drop-duplicate-rpc-functions.sql` was run later (which recreates INTEGER versions).

**Status:** ⚠️ **Unclear which version is active** in database.

---

## 5. Snapshot Tables

### elo_snapshots
**File:** `supabase-create-elo-snapshots.sql` (line 24)
- `elo INTEGER` → **Decimals lost when snapshots are created**

### session_rating_snapshots
**File:** `supabase-create-session-rating-snapshots.sql` (line 25)
- `elo INTEGER` → **Decimals lost when snapshots are created**

### match_elo_history
**File:** `supabase-create-match-elo-history.sql` (lines 20-35)
- All Elo fields are `INTEGER` → **Decimals lost in history**

---

## 6. Precision Loss Points Summary

| Location | File | Line | Issue | Type |
|----------|------|------|-------|------|
| **Live Submission - Singles** | `lib/elo/updates.ts` | 73-74 | `Math.round()` before RPC | Code |
| **Live Submission - Doubles** | `lib/elo/updates.ts` | 242-243 | `Math.round()` before RPC | Code |
| **RPC Parameters** | `supabase-drop-duplicate-rpc-functions.sql` | 39, 77, 115 | `p_elo_delta INTEGER` | Schema |
| **Database Columns** | `supabase-setup-elo-ratings.sql` | 18, 31, 53 | `elo INTEGER` | Schema |
| **Snapshot Table** | `supabase-create-elo-snapshots.sql` | 24 | `elo INTEGER` | Schema |
| **Session Snapshot Table** | `supabase-create-session-rating-snapshots.sql` | 25 | `elo INTEGER` | Schema |
| **History Table** | `supabase-create-match-elo-history.sql` | 20-35 | All `INTEGER` | Schema |

---

## 7. Where Precision is Lost

### Scenario A: Decimal Migration NOT Run
1. ✅ UI calculates decimals (1498.86)
2. ❌ Code rounds to integer (`Math.round()` in `lib/elo/updates.ts`)
3. ❌ RPC receives INTEGER delta
4. ❌ Database column is INTEGER → stores 1499 (or 1498 if truncated)
5. ❌ Result: 1498.00 or 1499.00

### Scenario B: Decimal Migration Run, But RPC Still INTEGER
1. ✅ UI calculates decimals (1498.86)
2. ❌ Code rounds to integer (`Math.round()` in `lib/elo/updates.ts`)
3. ❌ RPC receives INTEGER delta
4. ✅ Database column is NUMERIC(10,2) → but receives integer delta
5. ❌ Result: 1498.00 or 1499.00 (no decimals in delta)

### Scenario C: Edit/Replay Flow (Direct Upsert)
1. ✅ In-memory state has decimals (1498.86)
2. ✅ Direct upsert passes decimal value
3. ⚠️ If schema is INTEGER → decimals lost
4. ✅ If schema is NUMERIC(10,2) → decimals preserved
5. ⚠️ **Inconsistent with live submission**

---

## 8. Root Cause Analysis

**Primary Issue:** Code-level rounding in `lib/elo/updates.ts` before RPC calls.

**Secondary Issues:**
1. RPC functions expect INTEGER parameters (even if migration was run)
2. Database schema may still be INTEGER (if migration wasn't run)
3. Edit/replay uses direct upsert (may preserve decimals if schema is NUMERIC, creating inconsistency)

**Why decimals show in UI but not in DB:**
- UI reads from `player_ratings` table
- If schema is INTEGER: Values are integers (e.g., 1498)
- UI might be formatting integers as decimals (e.g., `1498.toFixed(2)` → "1498.00")
- OR: UI is reading from a different source (in-memory state during active session)

---

## 9. Minimal Fix Required

### Option 1: Complete Decimal Migration (Recommended)

**Step 1: Verify Schema**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('player_ratings', 'player_double_ratings', 'double_team_ratings')
AND column_name = 'elo';
```

**Step 2: Run Decimal Migration (if not run)**
- Execute `supabase-migrate-elo-to-decimal.sql`
- This converts all columns to `NUMERIC(10,2)`

**Step 3: Update RPC Functions**
- Recreate RPC functions with `NUMERIC(10,2)` parameters
- Use `supabase-fix-rpc-security.sql` as template (already has NUMERIC)

**Step 4: Remove Code-Level Rounding**
- Remove `Math.round()` from `lib/elo/updates.ts` lines 73-74, 242-243
- Pass decimal deltas directly to RPC

**Step 5: Update Snapshot/History Tables**
- Migrate `elo_snapshots.elo` to `NUMERIC(10,2)`
- Migrate `session_rating_snapshots.elo` to `NUMERIC(10,2)`
- Migrate `match_elo_history.*_elo_*` to `NUMERIC(10,2)`

### Option 2: Keep Integers (Not Recommended)
- Keep current behavior
- Remove decimal display from UI
- Accept integer-only Elo

---

## 10. Data Migration Safety

**If decimal migration is run:**
- Existing integer values (e.g., 1500) become decimals (1500.00)
- No data loss
- Safe to run

**If RPC functions are updated:**
- Existing data remains unchanged
- New calculations will use decimals
- Safe to run

**If code rounding is removed:**
- Existing data remains unchanged
- New calculations will preserve decimals
- Safe to run

---

## 11. Exact File + Line Numbers

### Code-Level Rounding (PRIMARY ISSUE)
- `lib/elo/updates.ts:73-74` - Singles: `Math.round(player1DeltaRaw)`, `Math.round(player2DeltaRaw)`
- `lib/elo/updates.ts:242-243` - Doubles: `Math.round(team1DeltaRaw)`, `Math.round(team2DeltaRaw)`

### Schema-Level Issues
- `supabase-setup-elo-ratings.sql:18` - `player_ratings.elo INTEGER`
- `supabase-setup-elo-ratings.sql:31` - `player_double_ratings.elo INTEGER`
- `supabase-setup-elo-ratings.sql:53` - `double_team_ratings.elo INTEGER`
- `supabase-create-elo-snapshots.sql:24` - `elo_snapshots.elo INTEGER`
- `supabase-create-session-rating-snapshots.sql:25` - `session_rating_snapshots.elo INTEGER`
- `supabase-create-match-elo-history.sql:20-35` - All Elo fields `INTEGER`

### RPC Function Issues
- `supabase-drop-duplicate-rpc-functions.sql:39` - `p_elo_delta INTEGER`
- `supabase-drop-duplicate-rpc-functions.sql:77` - `p_elo_delta INTEGER`
- `supabase-drop-duplicate-rpc-functions.sql:115` - `p_elo_delta INTEGER`

---

## 12. Confirmation Checklist

- [ ] Verify actual database schema (INTEGER vs NUMERIC)
- [ ] Verify which RPC function version is active (INTEGER vs NUMERIC)
- [ ] Check if decimal migration was run
- [ ] Confirm UI decimal display source (DB vs in-memory)
- [ ] Test live submission path (should lose decimals)
- [ ] Test edit/replay path (may preserve decimals if schema is NUMERIC)

---

## 13. Recommendation

**Immediate Action:**
1. Verify database schema state
2. If schema is INTEGER → Run decimal migration
3. Update RPC functions to accept NUMERIC(10,2)
4. Remove `Math.round()` from `lib/elo/updates.ts`
5. Migrate snapshot/history tables to NUMERIC(10,2)

**Expected Result:**
- Decimals preserved end-to-end
- Consistent behavior between live submission and edit/replay
- UI shows actual stored decimals (not formatted integers)

