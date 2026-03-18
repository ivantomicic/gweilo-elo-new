CREATE TABLE IF NOT EXISTS public.player_schedule_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    sessions_per_week SMALLINT NOT NULL CHECK (sessions_per_week BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.player_schedule_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Player schedule settings are viewable by admins" ON public.player_schedule_settings;
CREATE POLICY "Player schedule settings are viewable by admins"
    ON public.player_schedule_settings
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Player schedule settings insert admin only" ON public.player_schedule_settings;
CREATE POLICY "Player schedule settings insert admin only"
    ON public.player_schedule_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Player schedule settings update admin only" ON public.player_schedule_settings;
CREATE POLICY "Player schedule settings update admin only"
    ON public.player_schedule_settings
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Player schedule settings delete admin only" ON public.player_schedule_settings;
CREATE POLICY "Player schedule settings delete admin only"
    ON public.player_schedule_settings
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_player_schedule_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_player_schedule_settings_updated_at
    ON public.player_schedule_settings;
CREATE TRIGGER set_player_schedule_settings_updated_at
    BEFORE UPDATE ON public.player_schedule_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_player_schedule_settings_updated_at();

INSERT INTO public.player_schedule_settings (user_id, sessions_per_week)
SELECT
    id,
    (raw_user_meta_data->>'sessions_per_week')::SMALLINT
FROM auth.users
WHERE (raw_user_meta_data->>'sessions_per_week') ~ '^[1-4]$'
ON CONFLICT (user_id) DO UPDATE
SET
    sessions_per_week = EXCLUDED.sessions_per_week,
    updated_at = now();

DO $$
BEGIN
    IF to_regclass('public.no_shows') IS NOT NULL THEN
        ALTER TABLE public.no_shows
            ADD COLUMN IF NOT EXISTS sessions_per_week_snapshot SMALLINT,
            ADD COLUMN IF NOT EXISTS points NUMERIC(8,4);

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'no_shows_sessions_per_week_snapshot_valid'
        ) THEN
            ALTER TABLE public.no_shows
                ADD CONSTRAINT no_shows_sessions_per_week_snapshot_valid
                CHECK (
                    sessions_per_week_snapshot IS NULL
                    OR sessions_per_week_snapshot BETWEEN 1 AND 4
                );
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'no_shows_points_valid'
        ) THEN
            ALTER TABLE public.no_shows
                ADD CONSTRAINT no_shows_points_valid
                CHECK (
                    points IS NULL
                    OR (points > 0 AND points <= 1)
                );
        END IF;
    END IF;
END;
$$;
