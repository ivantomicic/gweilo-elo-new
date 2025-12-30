# Quick Fix for 500 Internal Server Error

## Problem

After submitting the first round, you're getting a 500 Internal Server Error. This is caused by a **type mismatch** between the code and the database RPC function.

## Root Cause

1. **Code change:** `calculateEloDelta()` now returns decimal values (e.g., `17.3`) after we removed `Math.round()`
2. **Database:** RPC function `upsert_player_rating()` still expects `INTEGER` (if decimal migration hasn't been run)
3. **Result:** PostgreSQL rejects the decimal value when expecting INTEGER → 500 error

## Quick Fix Applied

**File:** `lib/elo/updates.ts`

**Change:** Added temporary rounding before passing delta to RPC functions:

```typescript
// Round to integer for now (until decimal migration is run)
const player1Delta = Math.round(player1DeltaRaw);
const player2Delta = Math.round(player2DeltaRaw);
```

This ensures the delta is an integer when passed to the RPC function.

## Next Steps

### Option 1: Keep Integer Elo (Quick Fix)

1. ✅ **Already done:** Code now rounds deltas to integers
2. **Run SQL:** Apply `supabase-fix-rpc-integer-version.sql` to add `SECURITY DEFINER` to RPC functions
3. **Test:** Submit a round - should work now

### Option 2: Switch to Decimal Elo (Recommended)

1. **Run decimal migration:** Apply `supabase-migrate-elo-to-decimal.sql`
2. **Run RPC security fix:** Apply `supabase-fix-rpc-security.sql` (uses NUMERIC)
3. **Remove rounding:** Remove `Math.round()` calls from `lib/elo/updates.ts`
4. **Test:** Submit a round - should work with decimal precision

## Current Status

✅ **Code fix applied:** Deltas are now rounded to integers before RPC calls
⏳ **SQL fix needed:** Run `supabase-fix-rpc-integer-version.sql` to add `SECURITY DEFINER`

## After Running SQL Fix

The 500 error should be resolved. The RPC functions will:
- Accept integer deltas (matches current code)
- Have `SECURITY DEFINER` (bypasses RLS)
- Successfully insert/update ratings

## Future: Remove Rounding

Once you run the decimal migration:
1. Remove `Math.round()` calls from `lib/elo/updates.ts`
2. Run `supabase-fix-rpc-security.sql` (NUMERIC version)
3. Elo will have full decimal precision

