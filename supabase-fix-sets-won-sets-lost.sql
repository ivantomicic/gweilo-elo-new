-- ============================================================================
-- Fix sets_won and sets_lost Calculation - Migration Script
-- ============================================================================
-- 
-- This script fixes the broken sets_won/sets_lost calculation that was
-- treating match scores as binary win/loss indicators (0/1) instead of
-- actual set counts.
-- 
-- Migration Strategy:
-- 1. RESET: Set all sets_won and sets_lost to 0
-- 2. REBUILD: Recompute from completed matches in chronological order
-- 3. NO Elo changes: Only set counters are corrected
-- 
-- Why reset is safe:
-- - Current values are incorrect (they equal wins/losses)
-- - All data will be recomputed from source of truth (session_matches)
-- - No data loss since we're rebuilding from match scores
-- 
-- Why recomputation is correct:
-- - Match scores (team1_score, team2_score) represent sets won
-- - For singles: player gets their score as sets_won, opponent's as sets_lost
-- - For doubles team: team gets their score as sets_won, opponent's as sets_lost
-- - For doubles player: each player gets their team's score as sets_won, opponent's as sets_lost
-- 
-- This script is idempotent - it can be run multiple times safely.
-- 
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: RESET all sets_won and sets_lost to 0
-- ============================================================================
-- This is safe because:
-- 1. Current values are incorrect (they duplicate wins/losses)
-- 2. We will rebuild from match data immediately after
-- 3. No information is lost since match scores are the source of truth

UPDATE public.player_ratings
SET sets_won = 0, sets_lost = 0;

UPDATE public.player_double_ratings
SET sets_won = 0, sets_lost = 0;

UPDATE public.double_team_ratings
SET sets_won = 0, sets_lost = 0;

-- ============================================================================
-- STEP 2: REBUILD sets_won/sets_lost from completed matches
-- ============================================================================
-- Aggregate all sets from all matches for each player/team, then update once
-- This ensures we correctly sum sets across all matches a player/team has played

-- ----------------------------------------------------------------------------
-- 2.1: Singles Matches
-- ----------------------------------------------------------------------------
-- For each completed singles match:
-- - Player 1: sets_won += team1_score, sets_lost += team2_score
-- - Player 2: sets_won += team2_score, sets_lost += team1_score
-- Aggregate all matches per player, then update

UPDATE public.player_ratings pr
SET 
    sets_won = COALESCE(aggregated_sets.total_sets_won, 0),
    sets_lost = COALESCE(aggregated_sets.total_sets_lost, 0)
FROM (
    SELECT 
        player_id,
        SUM(sets_won) AS total_sets_won,
        SUM(sets_lost) AS total_sets_lost
    FROM (
        -- Player 1 in each match
        SELECT 
            (m.player_ids->>0)::UUID AS player_id,
            m.team1_score AS sets_won,
            m.team2_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'singles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND jsonb_array_length(m.player_ids) >= 2
        
        UNION ALL
        
        -- Player 2 in each match
        SELECT 
            (m.player_ids->>1)::UUID AS player_id,
            m.team2_score AS sets_won,
            m.team1_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'singles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND jsonb_array_length(m.player_ids) >= 2
    ) AS all_player_sets
    GROUP BY player_id
) AS aggregated_sets
WHERE pr.player_id = aggregated_sets.player_id;

-- ----------------------------------------------------------------------------
-- 2.2: Doubles Team Matches
-- ----------------------------------------------------------------------------
-- For each completed doubles match:
-- - Team 1: sets_won += team1_score, sets_lost += team2_score
-- - Team 2: sets_won += team2_score, sets_lost += team1_score
-- Aggregate all matches per team, then update

UPDATE public.double_team_ratings dtr
SET 
    sets_won = COALESCE(aggregated_sets.total_sets_won, 0),
    sets_lost = COALESCE(aggregated_sets.total_sets_lost, 0)
FROM (
    SELECT 
        team_id,
        SUM(sets_won) AS total_sets_won,
        SUM(sets_lost) AS total_sets_lost
    FROM (
        -- Team 1 in each match
        SELECT 
            m.team_1_id AS team_id,
            m.team1_score AS sets_won,
            m.team2_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'doubles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND m.team_1_id IS NOT NULL
        
        UNION ALL
        
        -- Team 2 in each match
        SELECT 
            m.team_2_id AS team_id,
            m.team2_score AS sets_won,
            m.team1_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'doubles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND m.team_2_id IS NOT NULL
    ) AS all_team_sets
    GROUP BY team_id
) AS aggregated_sets
WHERE dtr.team_id = aggregated_sets.team_id;

-- ----------------------------------------------------------------------------
-- 2.3: Doubles Player Matches
-- ----------------------------------------------------------------------------
-- For each completed doubles match:
-- - Team 1 players (player_ids[0] and player_ids[1]): 
--   sets_won += team1_score, sets_lost += team2_score
-- - Team 2 players (player_ids[2] and player_ids[3]): 
--   sets_won += team2_score, sets_lost += team1_score
-- Aggregate all matches per player, then update

UPDATE public.player_double_ratings pdr
SET 
    sets_won = COALESCE(aggregated_sets.total_sets_won, 0),
    sets_lost = COALESCE(aggregated_sets.total_sets_lost, 0)
FROM (
    SELECT 
        player_id,
        SUM(sets_won) AS total_sets_won,
        SUM(sets_lost) AS total_sets_lost
    FROM (
        -- Team 1, Player 1
        SELECT 
            (m.player_ids->>0)::UUID AS player_id,
            m.team1_score AS sets_won,
            m.team2_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'doubles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND jsonb_array_length(m.player_ids) >= 4
        
        UNION ALL
        
        -- Team 1, Player 2
        SELECT 
            (m.player_ids->>1)::UUID AS player_id,
            m.team1_score AS sets_won,
            m.team2_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'doubles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND jsonb_array_length(m.player_ids) >= 4
        
        UNION ALL
        
        -- Team 2, Player 1
        SELECT 
            (m.player_ids->>2)::UUID AS player_id,
            m.team2_score AS sets_won,
            m.team1_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'doubles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND jsonb_array_length(m.player_ids) >= 4
        
        UNION ALL
        
        -- Team 2, Player 2
        SELECT 
            (m.player_ids->>3)::UUID AS player_id,
            m.team2_score AS sets_won,
            m.team1_score AS sets_lost
        FROM public.session_matches m
        WHERE m.match_type = 'doubles'
            AND m.status = 'completed'
            AND m.team1_score IS NOT NULL
            AND m.team2_score IS NOT NULL
            AND jsonb_array_length(m.player_ids) >= 4
    ) AS all_player_sets
    GROUP BY player_id
) AS aggregated_sets
WHERE pdr.player_id = aggregated_sets.player_id;

-- ============================================================================
-- Verification Query (optional - uncomment to run after migration)
-- ============================================================================
-- This query helps verify the migration worked correctly by showing:
-- - Players/teams where sets_won != wins (expected after fix)
-- - Total sets won/lost across all entities
-- 
-- Uncomment to run:
/*
SELECT 
    'player_ratings' AS table_name,
    COUNT(*) AS total_players,
    SUM(sets_won) AS total_sets_won,
    SUM(sets_lost) AS total_sets_lost,
    COUNT(*) FILTER (WHERE sets_won != wins) AS players_with_different_sets_won,
    COUNT(*) FILTER (WHERE sets_lost != losses) AS players_with_different_sets_lost
FROM public.player_ratings
UNION ALL
SELECT 
    'player_double_ratings' AS table_name,
    COUNT(*) AS total_players,
    SUM(sets_won) AS total_sets_won,
    SUM(sets_lost) AS total_sets_lost,
    COUNT(*) FILTER (WHERE sets_won != wins) AS players_with_different_sets_won,
    COUNT(*) FILTER (WHERE sets_lost != losses) AS players_with_different_sets_lost
FROM public.player_double_ratings
UNION ALL
SELECT 
    'double_team_ratings' AS table_name,
    COUNT(*) AS total_teams,
    SUM(sets_won) AS total_sets_won,
    SUM(sets_lost) AS total_sets_lost,
    COUNT(*) FILTER (WHERE sets_won != wins) AS teams_with_different_sets_won,
    COUNT(*) FILTER (WHERE sets_lost != losses) AS teams_with_different_sets_lost
FROM public.double_team_ratings;
*/

COMMIT;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- 
-- After this migration:
-- - sets_won and sets_lost now correctly reflect actual sets won/lost
-- - sets_won ≠ wins (unless player/team always wins with exactly 1 set)
-- - sets_lost ≠ losses (unless player/team always loses with exactly 1 set)
-- - Statistics like total sets won, set difference, and dominance are now meaningful
-- 
-- Forward-looking: All new matches will use the corrected calculation logic
-- in lib/elo/updates.ts and app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts
-- 
-- ============================================================================

