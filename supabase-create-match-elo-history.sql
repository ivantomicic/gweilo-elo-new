-- ============================================================================
-- Create match_elo_history table for Elo audit trail
-- ============================================================================
-- 
-- This table stores Elo changes per match to:
-- 1. Prevent duplicate Elo application (unique constraint on match_id)
-- 2. Enable displaying "+X / -Y Elo" per match
-- 3. Allow future debugging and audit
-- 
-- ============================================================================

-- Create match_elo_history table
CREATE TABLE IF NOT EXISTS public.match_elo_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.session_matches(id) ON DELETE CASCADE,
    
    -- For singles matches
    player1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    player2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    player1_elo_before INTEGER,
    player1_elo_after INTEGER,
    player1_elo_delta INTEGER,
    player2_elo_before INTEGER,
    player2_elo_after INTEGER,
    player2_elo_delta INTEGER,
    
    -- For doubles matches (team ratings)
    team1_id UUID REFERENCES public.double_teams(id) ON DELETE CASCADE,
    team2_id UUID REFERENCES public.double_teams(id) ON DELETE CASCADE,
    team1_elo_before INTEGER,
    team1_elo_after INTEGER,
    team1_elo_delta INTEGER,
    team2_elo_before INTEGER,
    team2_elo_after INTEGER,
    team2_elo_delta INTEGER,
    
    -- For doubles matches (individual player ratings)
    -- We store deltas for all 4 players (they get the same delta as their team)
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure each match can only be processed once
    UNIQUE(match_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_elo_history_match_id ON public.match_elo_history(match_id);
CREATE INDEX IF NOT EXISTS idx_match_elo_history_player1_id ON public.match_elo_history(player1_id);
CREATE INDEX IF NOT EXISTS idx_match_elo_history_player2_id ON public.match_elo_history(player2_id);
CREATE INDEX IF NOT EXISTS idx_match_elo_history_team1_id ON public.match_elo_history(team1_id);
CREATE INDEX IF NOT EXISTS idx_match_elo_history_team2_id ON public.match_elo_history(team2_id);
CREATE INDEX IF NOT EXISTS idx_match_elo_history_created_at ON public.match_elo_history(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.match_elo_history ENABLE ROW LEVEL SECURITY;

-- RLS policy: All authenticated users can view Elo history
CREATE POLICY "Users can view match Elo history"
    ON public.match_elo_history
    FOR SELECT
    TO authenticated
    USING (true);

-- Service role can insert Elo history (for system updates after match results)
-- Note: This will be handled server-side with service role key

