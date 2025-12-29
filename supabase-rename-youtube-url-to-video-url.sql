-- ============================================================================
-- Rename youtube_url column to video_url in session_matches
-- ============================================================================
-- 
-- This migration renames the youtube_url column to video_url to generalize
-- video support for future providers (Vimeo, etc.).
-- 
-- This preserves all existing data - it's just a column rename.
-- 
-- ============================================================================

-- Rename the column
ALTER TABLE public.session_matches
RENAME COLUMN youtube_url TO video_url;

-- Rename the index (optional but good practice for consistency)
DROP INDEX IF EXISTS idx_session_matches_youtube_url;
CREATE INDEX IF NOT EXISTS idx_session_matches_video_url ON public.session_matches(video_url) WHERE video_url IS NOT NULL;

