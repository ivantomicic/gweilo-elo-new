-- ============================================================================
-- Create session_rating_snapshots table for Elo replay
-- ============================================================================
-- 
-- This table stores the initial Elo state when a session starts.
-- It is used to restore the baseline Elo ratings before replaying matches
-- after a match edit.
-- 
-- Snapshots are created once when a session starts (before the first match).
-- 
-- ============================================================================

-- Create session_rating_snapshots table
CREATE TABLE IF NOT EXISTS public.session_rating_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    
    -- Entity type: 'player_singles', 'player_doubles', or 'double_team'
    entity_type TEXT NOT NULL CHECK (entity_type IN ('player_singles', 'player_doubles', 'double_team')),
    
    -- Entity ID: player_id (for singles/doubles) or team_id (for double_team)
    entity_id UUID NOT NULL,
    
    -- Elo rating at session start
    elo INTEGER NOT NULL,
    
    -- Statistics at session start
    matches_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    sets_won INTEGER NOT NULL DEFAULT 0,
    sets_lost INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one snapshot per session per entity
    UNIQUE(session_id, entity_type, entity_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_rating_snapshots_session_id ON public.session_rating_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_session_rating_snapshots_entity ON public.session_rating_snapshots(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_session_rating_snapshots_created_at ON public.session_rating_snapshots(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.session_rating_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy: All authenticated users can view snapshots
CREATE POLICY "Users can view session rating snapshots"
    ON public.session_rating_snapshots
    FOR SELECT
    TO authenticated
    USING (true);

-- Service role can insert snapshots (for system when creating sessions)
-- Note: This will be handled server-side with service role key

