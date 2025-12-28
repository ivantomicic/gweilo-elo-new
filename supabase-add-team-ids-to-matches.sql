-- ============================================================================
-- Add team_id columns to session_matches for doubles matches
-- ============================================================================
-- 
-- This script adds team_1_id and team_2_id columns to session_matches
-- to store which double teams are playing in each doubles match.
-- 
-- These columns are nullable because singles matches don't have teams.
-- 
-- ============================================================================

-- Add team_id columns for doubles matches
ALTER TABLE public.session_matches
ADD COLUMN IF NOT EXISTS team_1_id UUID REFERENCES public.double_teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS team_2_id UUID REFERENCES public.double_teams(id) ON DELETE SET NULL;

-- Add index for team lookups
CREATE INDEX IF NOT EXISTS idx_session_matches_team_1_id ON public.session_matches(team_1_id);
CREATE INDEX IF NOT EXISTS idx_session_matches_team_2_id ON public.session_matches(team_2_id);

