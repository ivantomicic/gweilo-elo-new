-- ============================================================================
-- Elo Precision Consistency Verification Script
-- ============================================================================
-- 
-- This script verifies that the Elo system is configured for decimal precision
-- and checks for any inconsistencies.
-- 
-- Run this script to:
-- 1. Verify database schema (all Elo columns should be NUMERIC(10,2))
-- 2. Verify RPC functions (all should accept NUMERIC(10,2) parameters)
-- 3. Check for any INTEGER columns or functions that might cause precision loss
-- 
-- ============================================================================

-- ============================================================================
-- STEP 0: Check if tables exist
-- ============================================================================

SELECT 
    'TABLE_EXISTS_CHECK' as check_type,
    table_name,
    CASE 
        WHEN table_name IS NOT NULL THEN '✅ Table exists'
        ELSE '❌ Table missing'
    END as status
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_name IN (
        'player_ratings',
        'player_double_ratings',
        'double_team_ratings',
        'elo_snapshots',
        'session_rating_snapshots',
        'match_elo_history'
    )
ORDER BY table_name;

-- ============================================================================
-- STEP 1: Verify Database Schema
-- ============================================================================
-- All Elo columns should be NUMERIC(10,2), not INTEGER

SELECT 
    'SCHEMA_CHECK' as check_type,
    table_name,
    column_name,
    data_type,
    numeric_precision,
    numeric_scale,
    CASE 
        WHEN data_type = 'numeric' AND numeric_precision = 10 AND numeric_scale = 2 THEN '✅ CORRECT'
        WHEN data_type = 'integer' THEN '❌ INTEGER - Run migration!'
        WHEN data_type IS NULL THEN '❌ Column not found'
        ELSE '⚠️ UNEXPECTED TYPE: ' || data_type
    END as status
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

-- ============================================================================
-- STEP 2: Check if RPC functions exist
-- ============================================================================

SELECT 
    'RPC_EXISTS_CHECK' as check_type,
    routine_name,
    routine_type,
    CASE 
        WHEN routine_name IS NOT NULL THEN '✅ Function exists'
        ELSE '❌ Function missing'
    END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name IN (
        'upsert_player_rating',
        'upsert_player_double_rating',
        'upsert_double_team_rating'
    )
ORDER BY routine_name;

-- ============================================================================
-- STEP 2B: Verify RPC Function Parameters
-- ============================================================================
-- All RPC functions should accept NUMERIC(10,2) for p_elo_delta

SELECT 
    'RPC_CHECK' as check_type,
    r.routine_name,
    p.parameter_name,
    p.data_type,
    p.numeric_precision,
    p.numeric_scale,
    CASE 
        WHEN p.data_type = 'numeric' AND p.numeric_precision = 10 AND p.numeric_scale = 2 THEN '✅ CORRECT'
        WHEN p.data_type = 'integer' THEN '❌ INTEGER - Run migration!'
        WHEN p.parameter_name IS NULL THEN '❌ Parameter p_elo_delta not found'
        ELSE '⚠️ UNEXPECTED TYPE: ' || COALESCE(p.data_type, 'NULL')
    END as status
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p 
    ON p.specific_schema = r.specific_schema 
    AND p.specific_name = r.specific_name
    AND p.parameter_name = 'p_elo_delta'
WHERE r.routine_schema = 'public'
    AND r.routine_name IN (
        'upsert_player_rating',
        'upsert_player_double_rating',
        'upsert_double_team_rating'
    )
ORDER BY r.routine_name;

-- ============================================================================
-- STEP 3: Check for Decimal Values in Database
-- ============================================================================
-- If migration was applied, we should see decimal values (e.g., 1500.00)
-- If migration was NOT applied, all values will be integers
-- Note: This will fail if tables don't exist - that's expected

SELECT 
    'DECIMAL_CHECK' as check_type,
    'player_ratings' as table_name,
    COUNT(*) as total_rows,
    COUNT(CASE WHEN elo != ROUND(elo, 0) THEN 1 END) as rows_with_decimals,
    CASE 
        WHEN COUNT(CASE WHEN elo != ROUND(elo, 0) THEN 1 END) > 0 THEN '✅ Decimals found - Schema is NUMERIC'
        WHEN COUNT(*) > 0 THEN '⚠️ No decimals found - May be INTEGER or all values are whole numbers'
        ELSE 'ℹ️ No data'
    END as status
FROM player_ratings
UNION ALL
SELECT 
    'DECIMAL_CHECK' as check_type,
    'player_double_ratings' as table_name,
    COUNT(*) as total_rows,
    COUNT(CASE WHEN elo != ROUND(elo, 0) THEN 1 END) as rows_with_decimals,
    CASE 
        WHEN COUNT(CASE WHEN elo != ROUND(elo, 0) THEN 1 END) > 0 THEN '✅ Decimals found - Schema is NUMERIC'
        WHEN COUNT(*) > 0 THEN '⚠️ No decimals found - May be INTEGER or all values are whole numbers'
        ELSE 'ℹ️ No data'
    END as status
FROM player_double_ratings
UNION ALL
SELECT 
    'DECIMAL_CHECK' as check_type,
    'double_team_ratings' as table_name,
    COUNT(*) as total_rows,
    COUNT(CASE WHEN elo != ROUND(elo, 0) THEN 1 END) as rows_with_decimals,
    CASE 
        WHEN COUNT(CASE WHEN elo != ROUND(elo, 0) THEN 1 END) > 0 THEN '✅ Decimals found - Schema is NUMERIC'
        WHEN COUNT(*) > 0 THEN '⚠️ No decimals found - May be INTEGER or all values are whole numbers'
        ELSE 'ℹ️ No data'
    END as status
FROM double_team_ratings;

-- ============================================================================
-- STEP 4: Sample Elo Values (for manual inspection)
-- ============================================================================
-- Check a few sample values to see if they have decimals
-- Note: This will fail if table doesn't exist - that's expected

SELECT 
    'SAMPLE_VALUES' as check_type,
    'player_ratings' as table_name,
    player_id::text as player_id,
    elo::text as elo,
    CASE 
        WHEN elo != ROUND(elo, 0) THEN 'Has decimals'
        ELSE 'Whole number'
    END as precision_status
FROM player_ratings
ORDER BY updated_at DESC NULLS LAST
LIMIT 5;

-- ============================================================================
-- STEP 5: Summary
-- ============================================================================
-- This query provides a summary of the verification

SELECT 
    'SUMMARY' as check_type,
    'All checks completed. Review results above.' as message,
    'If any ❌ found, run: supabase-complete-decimal-migration.sql' as action;

