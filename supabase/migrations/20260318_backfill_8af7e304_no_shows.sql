INSERT INTO public.player_schedule_settings (user_id, sessions_per_week)
VALUES ('8af7e304-da40-4cef-b874-9a53ab7074e3'::UUID, 2::SMALLINT)
ON CONFLICT (user_id) DO UPDATE
SET
    sessions_per_week = EXCLUDED.sessions_per_week,
    updated_at = now();

UPDATE public.no_shows
SET
    sessions_per_week_snapshot = 2,
    points = 0.5000
WHERE user_id = '8af7e304-da40-4cef-b874-9a53ab7074e3'::UUID;
