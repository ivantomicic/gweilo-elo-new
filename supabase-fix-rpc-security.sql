-- ============================================================================
-- Fix RPC Function Security for Elo Rating Updates
-- ============================================================================
-- 
-- This migration adds SECURITY DEFINER to RPC functions so they can
-- insert/update ratings even when called via service role client.
-- 
-- SECURITY DEFINER means the function runs with the permissions of the
-- function owner (typically postgres), bypassing RLS restrictions.
-- 
-- ============================================================================

-- ============================================================================
-- IMPORTANT: Choose the correct parameter type based on your migration status
-- ============================================================================
-- 
-- If you have NOT run the decimal migration yet:
--   - Use INTEGER for p_elo_delta
--   - Change NUMERIC(10, 2) to INTEGER in all function signatures below
-- 
-- If you HAVE run the decimal migration:
--   - Use NUMERIC(10, 2) for p_elo_delta
--   - Keep as shown below
-- 
-- ============================================================================

-- Update upsert_player_rating function
CREATE OR REPLACE FUNCTION public.upsert_player_rating(
    p_player_id UUID,
    p_elo_delta NUMERIC(10, 2),  -- Change to INTEGER if decimal migration not run yet
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
        1500.00 + p_elo_delta,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- Added SECURITY DEFINER

-- Update upsert_player_double_rating function
CREATE OR REPLACE FUNCTION public.upsert_player_double_rating(
    p_player_id UUID,
    p_elo_delta NUMERIC(10, 2),  -- Updated to NUMERIC if migration was run, otherwise INTEGER
    p_wins INTEGER,
    p_losses INTEGER,
    p_draws INTEGER,
    p_sets_won INTEGER,
    p_sets_lost INTEGER
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.player_double_ratings (
        player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, updated_at
    )
    VALUES (
        p_player_id,
        1500.00 + p_elo_delta,
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
        elo = player_double_ratings.elo + p_elo_delta,
        matches_played = player_double_ratings.matches_played + 1,
        wins = player_double_ratings.wins + p_wins,
        losses = player_double_ratings.losses + p_losses,
        draws = player_double_ratings.draws + p_draws,
        sets_won = player_double_ratings.sets_won + p_sets_won,
        sets_lost = player_double_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- Added SECURITY DEFINER

-- Update upsert_double_team_rating function
CREATE OR REPLACE FUNCTION public.upsert_double_team_rating(
    p_team_id UUID,
    p_elo_delta NUMERIC(10, 2),  -- Change to INTEGER if decimal migration not run yet
    p_wins INTEGER,
    p_losses INTEGER,
    p_draws INTEGER,
    p_sets_won INTEGER,
    p_sets_lost INTEGER
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.double_team_ratings (
        team_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, updated_at
    )
    VALUES (
        p_team_id,
        1500.00 + p_elo_delta,
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (team_id) DO UPDATE SET
        elo = double_team_ratings.elo + p_elo_delta,
        matches_played = double_team_ratings.matches_played + 1,
        wins = double_team_ratings.wins + p_wins,
        losses = double_team_ratings.losses + p_losses,
        draws = double_team_ratings.draws + p_draws,
        sets_won = double_team_ratings.sets_won + p_sets_won,
        sets_lost = double_team_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- Added SECURITY DEFINER

-- ============================================================================
-- Note on Parameter Type
-- ============================================================================
-- 
-- If you have NOT run the decimal migration yet:
-- - Change NUMERIC(10, 2) back to INTEGER in the function signatures above
-- - The code will work with integers until you run the decimal migration
-- 
-- If you HAVE run the decimal migration:
-- - Keep NUMERIC(10, 2) as shown above
-- - This matches the migrated column types
-- 
-- ============================================================================

