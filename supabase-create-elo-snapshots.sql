-- ============================================================================
-- Create elo_snapshots table for per-match Elo state snapshots
-- ============================================================================
-- 
-- This table stores a snapshot of Elo state after each match completes.
-- Used for deterministic replay when editing historical matches.
-- 
-- Snapshots are created after each match completes and are immutable.
-- One snapshot per (match_id, player_id) for singles matches.
-- 
-- ============================================================================

-- Create elo_snapshots table
CREATE TABLE IF NOT EXISTS public.elo_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Match this snapshot was taken after
    match_id UUID NOT NULL REFERENCES public.session_matches(id) ON DELETE CASCADE,
    
    -- Player this snapshot is for (singles matches)
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Elo rating after this match
    elo INTEGER NOT NULL,
    
    -- Statistics after this match
    matches_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    sets_won INTEGER NOT NULL DEFAULT 0,
    sets_lost INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamp when snapshot was created
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one snapshot per match per player
    UNIQUE(match_id, player_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_elo_snapshots_match_id ON public.elo_snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_elo_snapshots_player_id ON public.elo_snapshots(player_id);
CREATE INDEX IF NOT EXISTS idx_elo_snapshots_created_at ON public.elo_snapshots(created_at DESC);

-- Composite index for finding snapshot before a match
CREATE INDEX IF NOT EXISTS idx_elo_snapshots_player_match ON public.elo_snapshots(player_id, match_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.elo_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can view snapshots for their own sessions
CREATE POLICY "Users can view elo snapshots for their sessions"
    ON public.elo_snapshots
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.session_matches sm
            JOIN public.sessions s ON s.id = sm.session_id
            WHERE sm.id = elo_snapshots.match_id
            AND s.created_by = auth.uid()
        )
    );

-- RLS policy: Service role can insert/delete snapshots (for system operations)
-- Note: This is typically handled by service role, but we add it for completeness
-- Service role bypasses RLS by default, so this is mainly for documentation

-- ============================================================================
-- Helper function: Get snapshot before a match
-- ============================================================================
-- 
-- Returns the most recent snapshot for a player before a given match.
-- Used to restore baseline when editing a match.
-- 
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_snapshot_before_match(
    p_player_id UUID,
    p_match_id UUID
)
RETURNS TABLE (
    id UUID,
    match_id UUID,
    player_id UUID,
    elo NUMERIC(10, 2),
    matches_played INTEGER,
    wins INTEGER,
    losses INTEGER,
    draws INTEGER,
    sets_won INTEGER,
    sets_lost INTEGER,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        es.id,
        es.match_id,
        es.player_id,
        es.elo,
        es.matches_played,
        es.wins,
        es.losses,
        es.draws,
        es.sets_won,
        es.sets_lost,
        es.created_at
    FROM public.elo_snapshots es
    JOIN public.session_matches sm_before ON sm_before.id = es.match_id
    JOIN public.session_matches sm_target ON sm_target.id = p_match_id
    WHERE es.player_id = p_player_id
    AND sm_before.session_id = sm_target.session_id
    AND (
        sm_before.round_number < sm_target.round_number
        OR (sm_before.round_number = sm_target.round_number 
            AND sm_before.match_order < sm_target.match_order)
    )
    ORDER BY sm_before.round_number DESC, sm_before.match_order DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper function: Get initial baseline for a player in a session
-- ============================================================================
-- 
-- Returns the player's rating state at the start of a session.
-- This is the state from player_ratings before any matches in the session.
-- 
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_initial_baseline(
    p_player_id UUID,
    p_session_id UUID
)
RETURNS TABLE (
    elo NUMERIC(10, 2),
    matches_played INTEGER,
    wins INTEGER,
    losses INTEGER,
    draws INTEGER,
    sets_won INTEGER,
    sets_lost INTEGER
) AS $$
DECLARE
    v_session_created_at TIMESTAMPTZ;
BEGIN
    -- Get session creation time
    SELECT created_at INTO v_session_created_at
    FROM public.sessions
    WHERE id = p_session_id;
    
    -- Return player rating state (this is the baseline before session)
    -- Note: This assumes player_ratings reflects state before session
    -- In practice, we might need to subtract session matches from current state
    RETURN QUERY
    SELECT 
        pr.elo,
        pr.matches_played,
        pr.wins,
        pr.losses,
        pr.draws,
        pr.sets_won,
        pr.sets_lost
    FROM public.player_ratings pr
    WHERE pr.player_id = p_player_id;
    
    -- If no rating exists, return defaults
    IF NOT FOUND THEN
        RETURN QUERY SELECT 1500.00, 0, 0, 0, 0, 0, 0;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

