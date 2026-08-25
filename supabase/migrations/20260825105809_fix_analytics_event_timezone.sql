-- Analytics timestamps were historically stored as UTC clock values in a
-- timestamp-without-time-zone column. Preserve those instants while making the
-- timezone explicit so PostgREST returns an offset-aware ISO timestamp.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'analytics_events'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.analytics_events
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'UTC';
  END IF;
END
$$;

ALTER TABLE public.analytics_events
  ALTER COLUMN created_at SET DEFAULT now();

COMMENT ON COLUMN public.analytics_events.created_at IS
  'UTC instant when the activity event was recorded; rendered in Europe/Belgrade in the admin UI.';
