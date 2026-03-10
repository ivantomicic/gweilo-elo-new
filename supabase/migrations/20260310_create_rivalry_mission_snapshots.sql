CREATE TABLE IF NOT EXISTS rivalry_mission_snapshots (
    player_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL DEFAULT 'User',
    player_avatar_url TEXT,
    player_elo NUMERIC NOT NULL DEFAULT 1500,
    player_rank INTEGER NOT NULL DEFAULT 0,
    matches_played INTEGER NOT NULL DEFAULT 0,
    player_tier TEXT NOT NULL CHECK (player_tier IN ('provisional', 'top', 'mid', 'bottom')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_reason TEXT NOT NULL DEFAULT 'manual',
    generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    missions JSONB NOT NULL DEFAULT '[]'::jsonb,
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rivalry_mission_snapshots_rank_idx
    ON rivalry_mission_snapshots(player_rank);

CREATE INDEX IF NOT EXISTS rivalry_mission_snapshots_tier_idx
    ON rivalry_mission_snapshots(player_tier);

CREATE INDEX IF NOT EXISTS rivalry_mission_snapshots_generated_at_idx
    ON rivalry_mission_snapshots(generated_at DESC);

ALTER TABLE rivalry_mission_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read their own rivalry mission snapshot"
    ON rivalry_mission_snapshots FOR SELECT
    TO authenticated
    USING (auth.uid() = player_id);
