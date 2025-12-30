-- ============================================================================
-- Clean all data from Elo and session tables
-- ============================================================================
-- 
-- WARNING: This will delete ALL data from the following tables:
-- - double_team_ratings
-- - double_teams
-- - elo_snapshots
-- - match_elo_history
-- - player_double_ratings
-- - player_ratings
-- - session_matches
-- - session_players
-- - session_rating_snapshots
-- - sessions
-- 
-- This is a destructive operation. Use with caution!
-- 
-- ============================================================================

-- Delete in order to respect foreign key constraints
-- Start with tables that have foreign keys, then delete referenced tables

-- 1. Delete from tables that reference session_matches
DELETE FROM public.match_elo_history;
DELETE FROM public.elo_snapshots;

-- 2. Delete from session_matches (references sessions)
DELETE FROM public.session_matches;

-- 3. Delete from tables that reference sessions
DELETE FROM public.session_players;
DELETE FROM public.session_rating_snapshots;

-- 4. Delete from sessions (base table)
DELETE FROM public.sessions;

-- 5. Delete from double_team_ratings (references double_teams)
DELETE FROM public.double_team_ratings;

-- 6. Delete from double_teams (base table)
DELETE FROM public.double_teams;

-- 7. Delete from player rating tables (these reference auth.users but we're just clearing data)
DELETE FROM public.player_double_ratings;
DELETE FROM public.player_ratings;

-- ============================================================================
-- Alternative: Using TRUNCATE CASCADE (faster, but requires proper permissions)
-- ============================================================================
-- 
-- If you have the necessary permissions, you can use TRUNCATE CASCADE instead:
-- 
-- TRUNCATE TABLE 
--     public.match_elo_history,
--     public.elo_snapshots,
--     public.session_matches,
--     public.session_players,
--     public.session_rating_snapshots,
--     public.sessions,
--     public.double_team_ratings,
--     public.double_teams,
--     public.player_double_ratings,
--     public.player_ratings
-- CASCADE;
-- 
-- Note: TRUNCATE CASCADE will automatically handle foreign key constraints
-- and is faster than DELETE, but requires TRUNCATE permission on all tables.
-- 
-- ============================================================================

