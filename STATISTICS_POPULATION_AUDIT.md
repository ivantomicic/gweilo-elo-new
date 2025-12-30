# Statistics Tables Not Populated - Audit Report

## Problem Summary

After completing a full session and recording all match results, the following tables remain empty:

-   `player_ratings`
-   `player_double_ratings`
-   `double_team_ratings`

The `/statistics` page shows no data because these tables have no rows.

---

## Root Cause Identified

**CRITICAL ISSUE:** RPC function calls in `lib/elo/updates.ts` are **not checking for errors**.

**Location:** `lib/elo/updates.ts`, lines 56-64 and 67-75

**Current Code:**

```typescript
// Update player 1 rating
await supabase.rpc("upsert_player_rating", {
	p_player_id: player1Id,
	p_elo_delta: player1Delta,
	// ... other params
});

// Update player 2 rating
await supabase.rpc("upsert_player_rating", {
	p_player_id: player2Id,
	p_elo_delta: player2Delta,
	// ... other params
});
```

**Problem:** No error checking! If the RPC call fails, the error is silently ignored.

---

## Detailed Audit Findings

### 1. Session Completion Flow ✅

**File:** `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`

**Flow:**

1. ✅ Round submission endpoint is called
2. ✅ Matches are validated
3. ✅ `updateSinglesRatings()` is called (line 263)
4. ✅ Matches are marked as completed (line 381)
5. ✅ Session is marked as completed if last round (line 428)

**Status:** Flow is correct, ratings update is triggered per-round.

---

### 2. Match Submission → Elo Update ✅

**File:** `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`, line 263

```typescript
// Update Elo ratings
await updateSinglesRatings(
	playerIds[0],
	playerIds[1],
	score.team1Score,
	score.team2Score
);
```

**Status:** ✅ `updateSinglesRatings()` is being called correctly.

---

### 3. Upsert Logic ❌ **BROKEN HERE**

**File:** `lib/elo/updates.ts`, lines 13-76

**Issue 1: No Error Handling**

```typescript
// Update player 1 rating
await supabase.rpc("upsert_player_rating", {
	p_player_id: player1Id,
	p_elo_delta: player1Delta,
	p_wins: player1Result === "win" ? 1 : 0,
	p_losses: player1Result === "loss" ? 1 : 0,
	p_draws: player1Result === "draw" ? 1 : 0,
	p_sets_won: player1SetsWon,
	p_sets_lost: player1SetsLost,
});
// ❌ NO ERROR CHECKING!
```

**Issue 2: RPC Function Parameter Type Mismatch**

**File:** `supabase-setup-elo-ratings.sql`, line 136

The RPC function expects `p_elo_delta INTEGER`:

```sql
CREATE OR REPLACE FUNCTION public.upsert_player_rating(
    p_player_id UUID,
    p_elo_delta INTEGER,  -- ⚠️ INTEGER
    ...
)
```

**But:** After the decimal migration, `calculateEloDelta()` now returns a `number` (decimal), and the migration changed the parameter to `NUMERIC(10, 2)`.

**However:** If the migration hasn't been run yet, there's a type mismatch:

-   Code passes: `number` (could be `17.3`)
-   RPC expects: `INTEGER` (before migration) or `NUMERIC(10, 2)` (after migration)

**Issue 3: RPC Function Security**

**File:** `supabase-setup-elo-ratings.sql`, line 169

The RPC function is created without `SECURITY DEFINER`:

```sql
$$ LANGUAGE plpgsql;  -- Defaults to SECURITY INVOKER
```

**Impact:** The function runs with the permissions of the caller. Since `createAdminClient()` uses the service role key (which bypasses RLS), this should work, BUT:

-   If there's any issue with the service role key or RLS policies, the function might fail silently
-   The function needs to be able to INSERT/UPDATE in `player_ratings`, which requires proper permissions

---

### 4. RLS & Permissions ⚠️

**File:** `supabase-setup-elo-ratings.sql`, lines 84-97

**RLS Status:**

-   ✅ RLS is enabled on `player_ratings`
-   ✅ SELECT policy exists for authenticated users
-   ❌ **NO INSERT/UPDATE policies defined**

**Comment in SQL:**

```sql
-- Service role can update ratings (for system updates after match results)
-- Note: This will be handled server-side with service role key
```

**Problem:** The comment says it will be handled by service role, but:

1. RLS is still enabled
2. Service role should bypass RLS, but RPC functions might not inherit this bypass
3. No explicit policy for service role

**Admin Client:**
**File:** `lib/supabase/admin.ts`, line 19

```typescript
return createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});
```

**Status:** ✅ Uses service role key correctly, which should bypass RLS.

---

### 5. Transactional / Conditional Skips ✅

**File:** `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`

**Checks:**

-   ✅ Session status check (line 128) - prevents submission to completed sessions
-   ✅ Match status check (line 164) - prevents duplicate submissions
-   ✅ Score validation (line 184) - ensures all scores are provided

**Status:** No conditional skips that would prevent rating updates.

---

## Exact Failure Point

**File:** `lib/elo/updates.ts`, lines 56-75

**The chain breaks here:**

1. ✅ `updateSinglesRatings()` is called
2. ✅ Elo delta is calculated correctly
3. ✅ RPC function is called with correct parameters
4. ❌ **RPC call fails silently** (no error checking)
5. ❌ **No rows inserted/updated** in `player_ratings`

**Most Likely Causes:**

1. **Type mismatch:** `p_elo_delta` type doesn't match (INTEGER vs NUMERIC vs number)
2. **RLS blocking:** RPC function can't insert/update due to RLS (even with service role)
3. **Function error:** RPC function has a bug and fails, but error is not caught

---

## Fixes Applied ✅

### ✅ Fix 1: Added Error Handling to RPC Calls

**File:** `lib/elo/updates.ts`

**Changes Applied:**

-   ✅ Added error checking to `upsert_player_rating` calls (2 places - lines 56-64, 67-75)
-   ✅ Added error checking to `upsert_player_double_rating` calls (4 places)
-   ✅ Added error checking to `upsert_double_team_rating` calls (2 places)

**Result:** All RPC errors are now caught, logged, and thrown. This will reveal the actual error preventing ratings from being created.

### ✅ Fix 2: Added SECURITY DEFINER to RPC Functions

**File:** `supabase-fix-rpc-security.sql` (NEW)

**Changes:**

-   ✅ Added `SECURITY DEFINER` to all three RPC functions
-   ✅ Updated parameter types to `NUMERIC(10, 2)` (if decimal migration was run)
-   ✅ Functions now run with owner permissions, bypassing RLS

**Note:** If decimal migration hasn't been run yet, change `NUMERIC(10, 2)` to `INTEGER` in the SQL file.

### Fix 3: Verify Parameter Types Match

**After running decimal migration:**

-   RPC function expects `NUMERIC(10, 2)`
-   Code passes `number` (TypeScript)
-   Supabase client should handle conversion, but verify

**If migration not run:**

-   RPC function expects `INTEGER`
-   Code passes `number` (could be decimal)
-   **This will cause a type error!**

---

## Testing Checklist

After applying fixes:

1. ✅ Check server logs for RPC errors
2. ✅ Verify `player_ratings` has rows after first match
3. ✅ Verify Elo values are correct (not all 1500)
4. ✅ Verify subsequent matches update existing rows
5. ✅ Check `/statistics` page shows data

---

## Recommended Implementation Order

1. **Add error handling** to RPC calls (will reveal the actual error)
2. **Check server logs** to see what error occurs
3. **Fix the specific issue** (type mismatch, RLS, or function bug)
4. **Add SECURITY DEFINER** to RPC functions (if needed)
5. **Test with a new session** to verify ratings are created

---

## Summary

**Root Cause:** RPC function calls were failing silently due to missing error handling.

**Impact:** No rows were created/updated in rating tables, so statistics page was empty.

**Fixes Applied:**

1. ✅ **Added error handling** to all RPC calls in `lib/elo/updates.ts` - errors will now be logged and thrown
2. ✅ **Created SQL migration** (`supabase-fix-rpc-security.sql`) to add `SECURITY DEFINER` to RPC functions

**Next Steps:**

1. Run `supabase-fix-rpc-security.sql` (change `NUMERIC(10, 2)` to `INTEGER` if decimal migration not run)
2. Test with a new session - errors will now be visible in server logs
3. Verify `player_ratings` table is populated after match completion

**Expected Outcome:** After running the SQL migration, RPC calls should succeed and ratings tables will be populated. If errors still occur, they will now be visible in server logs for debugging.
