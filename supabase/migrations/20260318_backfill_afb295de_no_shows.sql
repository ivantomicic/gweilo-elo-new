INSERT INTO public.player_schedule_settings (user_id, sessions_per_week)
VALUES ('afb295de-1098-428a-954d-187ab9cfbc37'::UUID, 1::SMALLINT)
ON CONFLICT (user_id) DO UPDATE
SET
    sessions_per_week = EXCLUDED.sessions_per_week,
    updated_at = now();

WITH ranked_no_shows AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            ORDER BY date ASC, created_at ASC, id ASC
        ) AS row_number
    FROM public.no_shows
    WHERE user_id = 'afb295de-1098-428a-954d-187ab9cfbc37'::UUID
)
UPDATE public.no_shows AS no_show
SET
    sessions_per_week_snapshot =
        CASE
            WHEN ranked_no_shows.row_number <= 2 THEN 2
            ELSE 1
        END,
    points =
        CASE
            WHEN ranked_no_shows.row_number <= 2 THEN 0.5000
            ELSE 1.0000
        END
FROM ranked_no_shows
WHERE no_show.id = ranked_no_shows.id;
