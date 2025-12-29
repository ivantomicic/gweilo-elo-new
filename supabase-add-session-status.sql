-- ============================================================================
-- Add session status and completed_at columns
-- ============================================================================
-- 
-- This migration adds:
-- 1. status column (active | completed) with default 'active'
-- 2. completed_at column (nullable timestamp)
-- 3. RLS policy for UPDATE operations on sessions
-- 
-- ============================================================================

-- Add status column to sessions table
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'completed'));

-- Add completed_at column to sessions table
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add index for querying active sessions
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);

-- Add index for querying completed sessions by date
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON public.sessions(completed_at DESC);

-- Add RLS policy for UPDATE operations
-- Users can only update sessions they created (for marking as completed)
CREATE POLICY "Users can update their own sessions"
    ON public.sessions
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

