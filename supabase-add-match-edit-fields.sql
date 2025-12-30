-- ============================================================================
-- Add match edit tracking fields to session_matches
-- ============================================================================
-- 
-- This migration adds fields to track when and why a match result was edited:
-- - is_edited: boolean flag
-- - edited_at: timestamp of edit
-- - edited_by: user who made the edit
-- - edit_reason: optional text reason for the edit
-- 
-- ============================================================================

-- Add is_edited column (default false for existing matches)
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false;

-- Add edited_at column (nullable, only set when match is edited)
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Add edited_by column (nullable, FK to auth.users)
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add edit_reason column (nullable text)
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS edit_reason TEXT;

-- Add index for querying edited matches
CREATE INDEX IF NOT EXISTS idx_session_matches_is_edited ON public.session_matches(session_id, is_edited);

-- Add index for edited_at (for audit queries)
CREATE INDEX IF NOT EXISTS idx_session_matches_edited_at ON public.session_matches(edited_at DESC);

