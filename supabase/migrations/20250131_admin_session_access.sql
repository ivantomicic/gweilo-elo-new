-- Migration: Allow admins to access all sessions
-- Admins should be able to view and manage sessions created by any user (including mods)

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- SESSIONS TABLE
-- ===========================================

-- Drop existing policies on sessions table
DROP POLICY IF EXISTS "Users can view their own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON sessions;
DROP POLICY IF EXISTS "Admins can view all sessions" ON sessions;
DROP POLICY IF EXISTS "Admins can update all sessions" ON sessions;
DROP POLICY IF EXISTS "Admins can delete all sessions" ON sessions;
DROP POLICY IF EXISTS "Users can view own sessions, admins can view all" ON sessions;
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON sessions;
DROP POLICY IF EXISTS "Users can update own sessions, admins can update all" ON sessions;
DROP POLICY IF EXISTS "Users can delete own sessions, admins can delete all" ON sessions;

-- Policy: Users can view their own sessions OR admins can view all
CREATE POLICY "Users can view own sessions, admins can view all"
ON sessions FOR SELECT
USING (
  created_by = auth.uid() OR is_admin()
);

-- Policy: Authenticated users can create sessions (they become the owner)
CREATE POLICY "Authenticated users can create sessions"
ON sessions FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND created_by = auth.uid()
);

-- Policy: Users can update their own sessions OR admins can update all
CREATE POLICY "Users can update own sessions, admins can update all"
ON sessions FOR UPDATE
USING (
  created_by = auth.uid() OR is_admin()
);

-- Policy: Users can delete their own sessions OR admins can delete all
CREATE POLICY "Users can delete own sessions, admins can delete all"
ON sessions FOR DELETE
USING (
  created_by = auth.uid() OR is_admin()
);

-- ===========================================
-- SESSION_PLAYERS TABLE
-- ===========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view players in their sessions" ON session_players;
DROP POLICY IF EXISTS "Users can insert players in their sessions" ON session_players;
DROP POLICY IF EXISTS "Users can insert session players" ON session_players;
DROP POLICY IF EXISTS "Admins can view all session players" ON session_players;
DROP POLICY IF EXISTS "Users can view session players, admins can view all" ON session_players;

-- Policy: Users can view players in their sessions OR admins can view all
CREATE POLICY "Users can view session players, admins can view all"
ON session_players FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = session_players.session_id
    AND (s.created_by = auth.uid() OR is_admin())
  )
);

-- Policy: Users can insert players in their sessions
CREATE POLICY "Users can insert session players"
ON session_players FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = session_players.session_id
    AND (s.created_by = auth.uid() OR is_admin())
  )
);

-- ===========================================
-- SESSION_MATCHES TABLE
-- ===========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view matches in their sessions" ON session_matches;
DROP POLICY IF EXISTS "Users can insert matches in their sessions" ON session_matches;
DROP POLICY IF EXISTS "Users can update matches in their sessions" ON session_matches;
DROP POLICY IF EXISTS "Users can insert session matches" ON session_matches;
DROP POLICY IF EXISTS "Admins can view all session matches" ON session_matches;
DROP POLICY IF EXISTS "Admins can update all session matches" ON session_matches;
DROP POLICY IF EXISTS "Users can view session matches, admins can view all" ON session_matches;
DROP POLICY IF EXISTS "Users can update session matches, admins can update all" ON session_matches;

-- Policy: Users can view matches in their sessions OR admins can view all
CREATE POLICY "Users can view session matches, admins can view all"
ON session_matches FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = session_matches.session_id
    AND (s.created_by = auth.uid() OR is_admin())
  )
);

-- Policy: Users can insert matches in their sessions OR admins can insert
CREATE POLICY "Users can insert session matches"
ON session_matches FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = session_matches.session_id
    AND (s.created_by = auth.uid() OR is_admin())
  )
);

-- Policy: Users can update matches in their sessions OR admins can update all
CREATE POLICY "Users can update session matches, admins can update all"
ON session_matches FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = session_matches.session_id
    AND (s.created_by = auth.uid() OR is_admin())
  )
);

-- Grant execute on is_admin function
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
