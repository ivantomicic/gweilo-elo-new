WITH target_players AS (
    SELECT *
    FROM (
        VALUES
            ('1333b539-0442-4563-9a06-c190f864f7db'::UUID, 2::SMALLINT),
            ('0f3eca1e-ab0c-4b11-9a30-c0622a2521c4'::UUID, 2::SMALLINT)
    ) AS player_schedule(user_id, sessions_per_week)
)
INSERT INTO public.player_schedule_settings (user_id, sessions_per_week)
SELECT
    user_id,
    sessions_per_week
FROM target_players
ON CONFLICT (user_id) DO UPDATE
SET
    sessions_per_week = EXCLUDED.sessions_per_week,
    updated_at = now();

WITH target_players AS (
    SELECT *
    FROM (
        VALUES
            ('1333b539-0442-4563-9a06-c190f864f7db'::UUID, 2::SMALLINT),
            ('0f3eca1e-ab0c-4b11-9a30-c0622a2521c4'::UUID, 2::SMALLINT)
    ) AS player_schedule(user_id, sessions_per_week)
)
UPDATE public.no_shows AS no_show
SET
    sessions_per_week_snapshot = target_players.sessions_per_week,
    points = ROUND((1.0 / target_players.sessions_per_week)::NUMERIC, 4)
FROM target_players
WHERE no_show.user_id = target_players.user_id;
