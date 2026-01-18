-- Fix RLS policy for admin read access
-- The original policy tried to query auth.users directly, which doesn't work in RLS
-- Use auth.jwt() to access user_metadata from JWT token instead

-- Drop the old policy
DROP POLICY IF EXISTS "Admins can read all events" ON analytics_events;

-- Create the corrected policy
-- Check role from user_metadata in JWT token (accessible via auth.jwt())
CREATE POLICY "Admins can read all events"
  ON analytics_events
  FOR SELECT
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );
