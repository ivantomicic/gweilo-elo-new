-- ============================================================================
-- Fix: Recreate session_matches table with correct schema
-- ============================================================================
-- 
-- This script drops and recreates session_matches with the correct schema.
-- 
-- WARNING: This will delete all existing match data!
-- Only run this if you don't have important data in session_matches yet.
-- 
-- ============================================================================

-- Drop existing table (this will also drop dependent objects like indexes and constraints)
DROP TABLE IF EXISTS public.session_matches CASCADE;

-- Recreate table with correct schema
CREATE TABLE public.session_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    match_type TEXT NOT NULL CHECK (match_type IN ('singles', 'doubles')),
    match_order INTEGER NOT NULL,
    player_ids JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, round_number, match_order)
);

-- Create indexes
CREATE INDEX idx_session_matches_session_id ON public.session_matches(session_id);
CREATE INDEX idx_session_matches_round_number ON public.session_matches(session_id, round_number);

-- Enable RLS
ALTER TABLE public.session_matches ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policy for viewing
CREATE POLICY "Users can view session matches"
    ON public.session_matches
    FOR SELECT
    TO authenticated
    USING (true);

-- Recreate RLS policy for inserting
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

