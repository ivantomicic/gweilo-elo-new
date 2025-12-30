-- ============================================================================
-- Add recalculation lock fields to sessions table
-- ============================================================================
-- 
-- This migration adds fields to prevent concurrent Elo recalculations:
-- - recalc_status: current recalculation state
-- - recalc_started_at: when recalculation started
-- - recalc_finished_at: when recalculation finished
-- - recalc_token: unique token for the current recalculation (prevents race conditions)
-- 
-- ============================================================================

-- Add recalc_status column (default 'idle' for existing sessions)
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS recalc_status TEXT NOT NULL DEFAULT 'idle'
CHECK (recalc_status IN ('idle', 'running', 'failed', 'done'));

-- Add recalc_started_at column (nullable, only set when recalculation starts)
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS recalc_started_at TIMESTAMPTZ;

-- Add recalc_finished_at column (nullable, only set when recalculation finishes)
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS recalc_finished_at TIMESTAMPTZ;

-- Add recalc_token column (nullable UUID, unique per active recalculation)
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS recalc_token UUID;

-- Add index for querying sessions by recalculation status
CREATE INDEX IF NOT EXISTS idx_sessions_recalc_status ON public.sessions(recalc_status);

-- Add index for recalc_started_at (for monitoring)
CREATE INDEX IF NOT EXISTS idx_sessions_recalc_started_at ON public.sessions(recalc_started_at DESC);

