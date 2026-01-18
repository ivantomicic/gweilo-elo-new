-- Add best/worst player columns to sessions table
-- These are pre-computed when session completes for fast retrieval

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS best_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS best_player_display_name TEXT,
ADD COLUMN IF NOT EXISTS best_player_delta NUMERIC,
ADD COLUMN IF NOT EXISTS worst_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS worst_player_display_name TEXT,
ADD COLUMN IF NOT EXISTS worst_player_delta NUMERIC;

-- Column explanations:
-- best_player_id: UUID of player with highest singles Elo change in this session
-- best_player_display_name: Display name of best player (cached for fast display)
-- best_player_delta: Singles Elo change for best player
-- worst_player_id: UUID of player with lowest singles Elo change in this session
-- worst_player_display_name: Display name of worst player (cached for fast display)
-- worst_player_delta: Singles Elo change for worst player
--
-- All columns are nullable:
-- - NULL for active sessions (not yet computed)
-- - NULL if no singles matches were played in the session
-- - NULL if all players have same Elo change (extremely rare)

-- Index on best_player_id for queries filtering by best player
CREATE INDEX IF NOT EXISTS idx_sessions_best_player_id ON sessions(best_player_id);

-- Index on worst_player_id for queries filtering by worst player
CREATE INDEX IF NOT EXISTS idx_sessions_worst_player_id ON sessions(worst_player_id);
