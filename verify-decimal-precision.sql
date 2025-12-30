-- ============================================================================
-- Verification Query: Check Decimal Precision Migration Status
-- ============================================================================
-- 
-- Run this query AFTER running supabase-complete-decimal-migration.sql
-- to verify all Elo columns are NUMERIC(10,2)
-- 
-- ============================================================================

-- Check column types for all Elo-related columns
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

-- Expected result:
-- All data_type should be 'numeric'
-- All numeric_precision should be 10
-- All numeric_scale should be 2

-- ============================================================================
-- Check RPC Function Parameter Types
-- ============================================================================

SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname IN (
        'upsert_player_rating',
        'upsert_player_double_rating',
        'upsert_double_team_rating'
    )
ORDER BY p.proname;

-- Expected result:
-- All functions should have p_elo_delta NUMERIC(10,2) in arguments

-- ============================================================================
-- Test Decimal Preservation (Sample Query)
-- ============================================================================
-- 
-- After running a match, check if Elo values have decimals:
-- 
-- SELECT 
--     player_id,
--     elo,
--     matches_played
-- FROM player_ratings
-- WHERE matches_played > 0
-- ORDER BY matches_played DESC
-- LIMIT 10;
-- 
-- Expected: Elo values should show decimals (e.g., 1518.64, not 1519.00)
-- 
-- ============================================================================

