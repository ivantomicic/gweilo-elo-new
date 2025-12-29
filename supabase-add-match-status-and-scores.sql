-- ============================================================================
-- Add match status and score columns to session_matches
-- ============================================================================
-- 
-- This script adds:
-- 1. status column (pending/completed) to track match lifecycle
-- 2. team1_score and team2_score columns to store match results
-- 
-- ============================================================================

-- Add status column (pending by default for existing matches)
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed'));

-- Add score columns (nullable, only set when match is completed)
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS team1_score INTEGER,
ADD COLUMN IF NOT EXISTS team2_score INTEGER;

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_session_matches_status ON public.session_matches(session_id, status);

-- Add RLS policy for UPDATE (users can update matches in sessions they created)
CREATE POLICY "Users can update session matches"
    ON public.session_matches
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE sessions.id = session_matches.session_id
            AND sessions.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE sessions.id = session_matches.session_id
            AND sessions.created_by = auth.uid()
        )
    );

