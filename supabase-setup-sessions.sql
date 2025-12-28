-- ============================================================================
-- Sessions Table Setup
-- ============================================================================
-- 
-- This script creates the sessions, session_players, and session_matches 
-- tables for storing session data.
-- 
-- What it does:
-- 1. Creates sessions table (main session record)
-- 2. Creates session_players table (many-to-many relationship)
-- 3. Creates session_matches table (matches with round_number directly in the table)
-- 4. Adds foreign key constraints
-- 5. Adds indexes for performance
-- 6. Enables Row Level Security (RLS)
-- 7. Creates policies for authenticated users
-- 
-- Security:
-- - All authenticated users can CREATE sessions
-- - All authenticated users can VIEW sessions
-- - Row Level Security (RLS) is enabled
-- 
-- ============================================================================

-- Step 1: Create sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Step 2: Create session_players table (many-to-many relationship)
-- Stores which players are in each session
-- For doubles mode (6 players), team column stores 'A', 'B', or 'C'
CREATE TABLE IF NOT EXISTS public.session_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team TEXT CHECK (team IN ('A', 'B', 'C') OR team IS NULL), -- NULL for singles mode
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, player_id)
);

-- Step 3: Create session_matches table
-- Stores matches with round_number directly in the table (no separate rounds table)
-- player_ids is JSONB array to preserve order: ["player1_id", "player2_id"] or ["p1", "p2", "p3", "p4"]
CREATE TABLE IF NOT EXISTS public.session_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    match_type TEXT NOT NULL CHECK (match_type IN ('singles', 'doubles')),
    match_order INTEGER NOT NULL, -- Order within the round (0-indexed)
    player_ids JSONB NOT NULL, -- Array of player UUIDs: ["uuid1", "uuid2"] or ["uuid1", "uuid2", "uuid3", "uuid4"]
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, round_number, match_order)
);

-- Step 4: Add indexes for performance

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON public.sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at DESC);

-- Session players indexes
CREATE INDEX IF NOT EXISTS idx_session_players_session_id ON public.session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_session_players_player_id ON public.session_players(player_id);

-- Session matches indexes
CREATE INDEX IF NOT EXISTS idx_session_matches_session_id ON public.session_matches(session_id);
CREATE INDEX IF NOT EXISTS idx_session_matches_round_number ON public.session_matches(session_id, round_number);

-- Step 5: Enable Row Level Security (RLS)
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_matches ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies

-- Sessions policies
-- All authenticated users can view sessions
CREATE POLICY "Users can view sessions"
    ON public.sessions
    FOR SELECT
    TO authenticated
    USING (true);

-- All authenticated users can create sessions
CREATE POLICY "Users can create sessions"
    ON public.sessions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

-- Session players policies
-- Users can view session players for any session
CREATE POLICY "Users can view session players"
    ON public.session_players
    FOR SELECT
    TO authenticated
    USING (true);

-- Users can insert session players (only when creating a session they own)
CREATE POLICY "Users can insert session players"
    ON public.session_players
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE sessions.id = session_players.session_id
            AND sessions.created_by = auth.uid()
        )
    );

-- Session matches policies
-- Users can view session matches for any session
CREATE POLICY "Users can view session matches"
    ON public.session_matches
    FOR SELECT
    TO authenticated
    USING (true);

-- Users can insert session matches (only when creating a session they own)
CREATE POLICY "Users can insert session matches"
    ON public.session_matches
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE sessions.id = session_matches.session_id
            AND sessions.created_by = auth.uid()
        )
    );
