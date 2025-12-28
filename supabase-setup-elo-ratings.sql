-- ============================================================================
-- Elo Rating System Setup
-- ============================================================================
-- 
-- This script creates the Elo rating tables for tracking player performance.
-- 
-- Tables created:
-- 1. player_ratings - Singles performance per player
-- 2. player_double_ratings - Individual doubles performance per player
-- 3. double_teams - Unique pairs of players
-- 4. double_team_ratings - Performance of specific pairs
-- 
-- ============================================================================

-- Step 1: Create player_ratings table (singles only)
CREATE TABLE IF NOT EXISTS public.player_ratings (
    player_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    elo INTEGER NOT NULL DEFAULT 1500,
    matches_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    sets_won INTEGER NOT NULL DEFAULT 0,
    sets_lost INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Create player_double_ratings table (individual doubles performance)
CREATE TABLE IF NOT EXISTS public.player_double_ratings (
    player_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    elo INTEGER NOT NULL DEFAULT 1500,
    matches_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    sets_won INTEGER NOT NULL DEFAULT 0,
    sets_lost INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Create double_teams table (unique pairs)
CREATE TABLE IF NOT EXISTS public.double_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (player_1_id < player_2_id) -- Ensures unique ordering (smaller ID always first)
);

-- Step 4: Create double_team_ratings table (specific pair performance)
CREATE TABLE IF NOT EXISTS public.double_team_ratings (
    team_id UUID PRIMARY KEY REFERENCES public.double_teams(id) ON DELETE CASCADE,
    elo INTEGER NOT NULL DEFAULT 1500,
    matches_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    sets_won INTEGER NOT NULL DEFAULT 0,
    sets_lost INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 5: Create indexes for performance

-- Player ratings indexes
CREATE INDEX IF NOT EXISTS idx_player_ratings_elo ON public.player_ratings(elo DESC);
CREATE INDEX IF NOT EXISTS idx_player_ratings_updated_at ON public.player_ratings(updated_at DESC);

-- Player double ratings indexes
CREATE INDEX IF NOT EXISTS idx_player_double_ratings_elo ON public.player_double_ratings(elo DESC);
CREATE INDEX IF NOT EXISTS idx_player_double_ratings_updated_at ON public.player_double_ratings(updated_at DESC);

-- Double teams indexes
CREATE INDEX IF NOT EXISTS idx_double_teams_player_1_id ON public.double_teams(player_1_id);
CREATE INDEX IF NOT EXISTS idx_double_teams_player_2_id ON public.double_teams(player_2_id);
-- Unique index to prevent duplicate teams (regardless of order)
CREATE UNIQUE INDEX IF NOT EXISTS idx_double_teams_unique_pair ON public.double_teams(player_1_id, player_2_id);

-- Double team ratings indexes
CREATE INDEX IF NOT EXISTS idx_double_team_ratings_elo ON public.double_team_ratings(elo DESC);
CREATE INDEX IF NOT EXISTS idx_double_team_ratings_updated_at ON public.double_team_ratings(updated_at DESC);

-- Step 6: Enable Row Level Security (RLS)
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_double_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.double_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.double_team_ratings ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies

-- Player ratings policies
-- All authenticated users can view ratings
CREATE POLICY "Users can view player ratings"
    ON public.player_ratings
    FOR SELECT
    TO authenticated
    USING (true);

-- Service role can update ratings (for system updates after match results)
-- Note: This will be handled server-side with service role key

-- Player double ratings policies
-- All authenticated users can view double ratings
CREATE POLICY "Users can view player double ratings"
    ON public.player_double_ratings
    FOR SELECT
    TO authenticated
    USING (true);

-- Double teams policies
-- All authenticated users can view teams
CREATE POLICY "Users can view double teams"
    ON public.double_teams
    FOR SELECT
    TO authenticated
    USING (true);

-- Service role can insert teams (for system when creating sessions)
-- Note: This will be handled server-side with service role key

-- Double team ratings policies
-- All authenticated users can view team ratings
CREATE POLICY "Users can view double team ratings"
    ON public.double_team_ratings
    FOR SELECT
    TO authenticated
    USING (true);

-- Step 8: Create helper functions for upserting ratings

-- Upsert player rating (singles)
-- For new players: inserts with 1500 + delta
-- For existing players: updates existing elo + delta
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
        1500 + p_elo_delta, -- New player starts at 1500, then add delta
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
        elo = player_ratings.elo + p_elo_delta, -- Existing player: add delta to current elo
        matches_played = player_ratings.matches_played + 1,
        wins = player_ratings.wins + p_wins,
        losses = player_ratings.losses + p_losses,
        draws = player_ratings.draws + p_draws,
        sets_won = player_ratings.sets_won + p_sets_won,
        sets_lost = player_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Upsert player double rating (individual doubles performance)
-- For new players: inserts with 1500 + delta
-- For existing players: updates existing elo + delta
CREATE OR REPLACE FUNCTION public.upsert_player_double_rating(
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
    INSERT INTO public.player_double_ratings (
        player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, updated_at
    )
    VALUES (
        p_player_id,
        1500 + p_elo_delta, -- New player starts at 1500, then add delta
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (player_id) DO UPDATE SET
        elo = player_double_ratings.elo + p_elo_delta, -- Existing player: add delta to current elo
        matches_played = player_double_ratings.matches_played + 1,
        wins = player_double_ratings.wins + p_wins,
        losses = player_double_ratings.losses + p_losses,
        draws = player_double_ratings.draws + p_draws,
        sets_won = player_double_ratings.sets_won + p_sets_won,
        sets_lost = player_double_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Upsert double team rating (specific pair performance)
-- For new teams: inserts with 1500 + delta
-- For existing teams: updates existing elo + delta
CREATE OR REPLACE FUNCTION public.upsert_double_team_rating(
    p_team_id UUID,
    p_elo_delta INTEGER,
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
        1500 + p_elo_delta, -- New team starts at 1500, then add delta
        1,
        p_wins,
        p_losses,
        p_draws,
        p_sets_won,
        p_sets_lost,
        NOW()
    )
    ON CONFLICT (team_id) DO UPDATE SET
        elo = double_team_ratings.elo + p_elo_delta, -- Existing team: add delta to current elo
        matches_played = double_team_ratings.matches_played + 1,
        wins = double_team_ratings.wins + p_wins,
        losses = double_team_ratings.losses + p_losses,
        draws = double_team_ratings.draws + p_draws,
        sets_won = double_team_ratings.sets_won + p_sets_won,
        sets_lost = double_team_ratings.sets_lost + p_sets_lost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

