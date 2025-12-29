-- ============================================================================
-- Add youtube_url column to session_matches
-- ============================================================================
-- 
-- This script adds a nullable youtube_url column to session_matches
-- to allow admins to attach YouTube videos to specific matches.
-- 
-- ============================================================================

-- Add youtube_url column (nullable, only set when admin attaches a video)
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS youtube_url TEXT NULL;

-- Add index for potential future queries (optional, but useful if we want to find all matches with videos)
CREATE INDEX IF NOT EXISTS idx_session_matches_youtube_url ON public.session_matches(youtube_url) WHERE youtube_url IS NOT NULL;

-- Note: Admin-only access is enforced at the API level (see /api/sessions/[sessionId]/matches/[matchId]/youtube-url/route.ts)
-- The existing RLS policy "Users can update session matches" allows session owners to update matches,
-- but the API route requires admin role via verifyAdmin().

