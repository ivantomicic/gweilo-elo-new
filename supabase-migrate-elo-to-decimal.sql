-- ============================================================================
-- Migrate Elo columns from INTEGER to NUMERIC(10,2) for decimal precision
-- ============================================================================
-- 
-- This migration converts all Elo-related columns to NUMERIC(10,2) to preserve
-- decimal precision throughout the system.
-- 
-- Existing integer values (e.g., 1500) will become decimals (e.g., 1500.00)
-- 
-- ============================================================================

-- ============================================================================
-- 1. Main Rating Tables
-- ============================================================================

-- player_ratings.elo
ALTER TABLE public.player_ratings 
    ALTER COLUMN elo TYPE NUMERIC(10, 2) USING elo::NUMERIC(10, 2);

-- player_double_ratings.elo
ALTER TABLE public.player_double_ratings 
    ALTER COLUMN elo TYPE NUMERIC(10, 2) USING elo::NUMERIC(10, 2);

-- double_team_ratings.elo
ALTER TABLE public.double_team_ratings 
    ALTER COLUMN elo TYPE NUMERIC(10, 2) USING elo::NUMERIC(10, 2);

-- ============================================================================
-- 2. Snapshot Tables
-- ============================================================================

-- elo_snapshots.elo
ALTER TABLE public.elo_snapshots 
    ALTER COLUMN elo TYPE NUMERIC(10, 2) USING elo::NUMERIC(10, 2);

-- session_rating_snapshots.elo
ALTER TABLE public.session_rating_snapshots 
    ALTER COLUMN elo TYPE NUMERIC(10, 2) USING elo::NUMERIC(10, 2);

-- ============================================================================
-- 3. History Table (match_elo_history)
-- ============================================================================

-- Singles match Elo fields
ALTER TABLE public.match_elo_history 
    ALTER COLUMN player1_elo_before TYPE NUMERIC(10, 2) USING player1_elo_before::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN player1_elo_after TYPE NUMERIC(10, 2) USING player1_elo_after::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN player1_elo_delta TYPE NUMERIC(10, 2) USING player1_elo_delta::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN player2_elo_before TYPE NUMERIC(10, 2) USING player2_elo_before::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN player2_elo_after TYPE NUMERIC(10, 2) USING player2_elo_after::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN player2_elo_delta TYPE NUMERIC(10, 2) USING player2_elo_delta::NUMERIC(10, 2);

-- Doubles match Elo fields
ALTER TABLE public.match_elo_history 
    ALTER COLUMN team1_elo_before TYPE NUMERIC(10, 2) USING team1_elo_before::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN team1_elo_after TYPE NUMERIC(10, 2) USING team1_elo_after::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN team1_elo_delta TYPE NUMERIC(10, 2) USING team1_elo_delta::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN team2_elo_before TYPE NUMERIC(10, 2) USING team2_elo_before::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN team2_elo_after TYPE NUMERIC(10, 2) USING team2_elo_after::NUMERIC(10, 2);

ALTER TABLE public.match_elo_history 
    ALTER COLUMN team2_elo_delta TYPE NUMERIC(10, 2) USING team2_elo_delta::NUMERIC(10, 2);

-- ============================================================================
-- 4. Update RPC Functions
-- ============================================================================

-- Update upsert_player_rating function
CREATE OR REPLACE FUNCTION public.upsert_player_rating(
    p_player_id UUID,
    p_elo_delta NUMERIC(10, 2),  -- Changed from INTEGER
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
        matches_played = player_ratings.matches_played + 1,
        wins = player_ratings.wins + p_wins,
        losses = player_ratings.losses + p_losses,
        draws = player_ratings.draws + p_draws,
        sets_won = player_ratings.sets_won + p_sets_won,
        sets_lost = player_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Update upsert_player_double_rating function
CREATE OR REPLACE FUNCTION public.upsert_player_double_rating(
    p_player_id UUID,
    p_elo_delta NUMERIC(10, 2),  -- Changed from INTEGER
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
        elo = player_double_ratings.elo + p_elo_delta,  -- NUMERIC addition preserves precision
        matches_played = player_double_ratings.matches_played + 1,
        wins = player_double_ratings.wins + p_wins,
        losses = player_double_ratings.losses + p_losses,
        draws = player_double_ratings.draws + p_draws,
        sets_won = player_double_ratings.sets_won + p_sets_won,
        sets_lost = player_double_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Update upsert_double_team_rating function
CREATE OR REPLACE FUNCTION public.upsert_double_team_rating(
    p_team_id UUID,
    p_elo_delta NUMERIC(10, 2),  -- Changed from INTEGER
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
        1500.00 + p_elo_delta,  -- NUMERIC addition preserves precision
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (team_id) DO UPDATE SET
        elo = double_team_ratings.elo + p_elo_delta,  -- NUMERIC addition preserves precision
        matches_played = double_team_ratings.matches_played + 1,
        wins = double_team_ratings.wins + p_wins,
        losses = double_team_ratings.losses + p_losses,
        draws = double_team_ratings.draws + p_draws,
        sets_won = double_team_ratings.sets_won + p_sets_won,
        sets_lost = double_team_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

