# Diagnostic Steps for 500 Error

## Current Status

The 500 error is likely caused by one of these issues:

1. **RPC function doesn't have SECURITY DEFINER** - RLS is blocking inserts
2. **Type mismatch** - RPC expects INTEGER but receives decimal (even after rounding)
3. **RPC function doesn't exist** - Function was never created
4. **Service role key missing** - `SUPABASE_SERVICE_ROLE_KEY` not set

## Immediate Steps

### 1. Check Server Logs

The error handling I added should now show the actual error in your server console. Look for:

```
Error updating player 1 rating: [actual error message]
```

Or:

```
Error updating Elo ratings for match [match_id]: [actual error message]
```

### 2. Check Browser Console

The error response now includes `details` and `stack`. Check the browser console for:

```json
{
  "error": "Internal server error",
  "details": "[actual error message]",
  "stack": "..."
}
```

### 3. Run SQL Migration

**CRITICAL:** Run one of these SQL files:

- **If decimal migration NOT run:** `supabase-fix-rpc-integer-version.sql`
- **If decimal migration WAS run:** `supabase-fix-rpc-security.sql` (change NUMERIC to INTEGER if needed)

This adds `SECURITY DEFINER` to RPC functions, which is likely the issue.

### 4. Verify RPC Function Exists

Run this SQL to check if the function exists:

```sql
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    p.prosecdef as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN ('upsert_player_rating', 'upsert_player_double_rating', 'upsert_double_team_rating');
```

**Expected:** Should return 3 rows with `security_definer = true` (after running migration).

### 5. Test RPC Function Directly

Run this SQL to test the function:

```sql
-- Test with a dummy player ID (replace with actual UUID from auth.users)
SELECT upsert_player_rating(
    '00000000-0000-0000-0000-000000000000'::UUID,  -- Replace with real player ID
    20,  -- delta
    1,   -- wins
    0,   -- losses
    0,   -- draws
    1,   -- sets_won
    0    -- sets_lost
);
```

**Expected:** Should succeed without error.

## Most Likely Fix

**Run this SQL immediately:**

```sql
-- Add SECURITY DEFINER to all RPC functions (INTEGER version)
CREATE OR REPLACE FUNCTION public.upsert_player_rating(
    p_player_id UUID,
    p_elo_delta INTEGER,
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
        1500 + p_elo_delta,
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
        elo = player_ratings.elo + p_elo_delta,
        matches_played = player_ratings.matches_played + 1,
        wins = player_ratings.wins + p_wins,
        losses = player_ratings.losses + p_losses,
        draws = player_ratings.draws + p_draws,
        sets_won = player_ratings.sets_won + p_sets_won,
        sets_lost = player_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This should fix the 500 error immediately.

