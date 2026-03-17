-- Move authorization checks to app_metadata so user-editable metadata is never
-- trusted in RLS or server-side role checks.

-- Backfill app metadata roles from existing user metadata roles where needed.
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
	COALESCE(raw_app_meta_data, '{}'::jsonb),
	'{role}',
	to_jsonb(raw_user_meta_data ->> 'role'),
	true
)
WHERE raw_user_meta_data ? 'role'
	AND COALESCE(raw_app_meta_data ->> 'role', '') = '';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
	SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins can read all events" ON public.analytics_events;
CREATE POLICY "Admins can read all events"
	ON public.analytics_events
	FOR SELECT
	TO authenticated
	USING (public.is_admin());

DROP POLICY IF EXISTS "polls_insert_admin_only" ON public.polls;
CREATE POLICY "polls_insert_admin_only"
	ON public.polls
	FOR INSERT
	TO authenticated
	WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "polls_update_admin_only" ON public.polls;
CREATE POLICY "polls_update_admin_only"
	ON public.polls
	FOR UPDATE
	TO authenticated
	USING (public.is_admin());

DROP POLICY IF EXISTS "polls_delete_admin_only" ON public.polls;
CREATE POLICY "polls_delete_admin_only"
	ON public.polls
	FOR DELETE
	TO authenticated
	USING (public.is_admin());

DROP POLICY IF EXISTS "poll_options_insert_admin_only" ON public.poll_options;
CREATE POLICY "poll_options_insert_admin_only"
	ON public.poll_options
	FOR INSERT
	TO authenticated
	WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "poll_options_update_admin_only" ON public.poll_options;
CREATE POLICY "poll_options_update_admin_only"
	ON public.poll_options
	FOR UPDATE
	TO authenticated
	USING (public.is_admin());

DROP POLICY IF EXISTS "poll_options_delete_admin_only" ON public.poll_options;
CREATE POLICY "poll_options_delete_admin_only"
	ON public.poll_options
	FOR DELETE
	TO authenticated
	USING (public.is_admin());

DO $$
BEGIN
	IF to_regclass('public.no_shows') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "Admins can insert no-shows" ON public.no_shows';
		EXECUTE '
			CREATE POLICY "Admins can insert no-shows"
				ON public.no_shows
				FOR INSERT
				TO authenticated
				WITH CHECK (public.is_admin())
		';
	END IF;
END;
$$;
