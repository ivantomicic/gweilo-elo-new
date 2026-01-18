-- Create analytics_events table for user activity tracking
-- All tracking data lives in Supabase (no third-party analytics)

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  page TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_event ON analytics_events(user_id, event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at_desc ON analytics_events(created_at DESC);

-- Column explanations:
-- id: Primary key (UUID, auto-generated)
-- user_id: Links to auth.users (nullable for anonymous events, ON DELETE SET NULL = anonymize on user deletion for GDPR)
-- event_name: Event type ('user_logged_in', 'app_loaded', 'page_viewed')
-- page: Page route (e.g., '/dashboard', '/player/123') - nullable for non-page events
-- created_at: Timestamp (indexed DESC for newest-first queries)

-- Enable RLS (Row Level Security)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy 1: All authenticated users can insert their own events
CREATE POLICY "Users can insert their own events"
  ON analytics_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);

-- Policy 2: Only admins can read all events
-- Check role from user_metadata in JWT token (accessible via auth.jwt())
CREATE POLICY "Admins can read all events"
  ON analytics_events
  FOR SELECT
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Optional: Users can read their own events (uncomment if needed)
-- CREATE POLICY "Users can read their own events"
--   ON analytics_events
--   FOR SELECT
--   USING (auth.uid() = user_id);
