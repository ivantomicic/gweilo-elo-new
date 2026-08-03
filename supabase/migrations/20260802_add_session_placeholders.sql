-- Temporary participants belong to one session and never require an auth user.
-- Matches snapshot whether they are rated so later edits/rebuilds cannot change
-- history when participant data changes.

CREATE TABLE IF NOT EXISTS public.session_placeholders (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
	display_name text NOT NULL CHECK (
		char_length(btrim(display_name)) BETWEEN 1 AND 80
	),
	team text,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (session_id, id)
);

CREATE INDEX IF NOT EXISTS session_placeholders_session_id_idx
	ON public.session_placeholders (session_id);

ALTER TABLE public.session_placeholders ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.session_placeholders TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.session_placeholders FROM authenticated;

CREATE POLICY "Users can view session placeholders, admins can view all"
ON public.session_placeholders FOR SELECT
USING (
	EXISTS (
		SELECT 1 FROM public.sessions s
		WHERE s.id = session_placeholders.session_id
			AND (s.created_by = auth.uid() OR public.is_admin())
	)
);

ALTER TABLE public.session_matches
	ADD COLUMN IF NOT EXISTS is_rated boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS session_matches_rated_lookup_idx
	ON public.session_matches (status, match_type, is_rated, session_id);

CREATE OR REPLACE FUNCTION public.create_session_atomic(
	p_created_by uuid,
	p_idempotency_key uuid,
	p_players jsonb,
	p_matches jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $create_session$
DECLARE
	v_session_id uuid;
	v_active_session_id uuid;
	v_player_count integer;
	v_unique_player_count integer;
BEGIN
	IF p_created_by IS NULL OR p_idempotency_key IS NULL THEN
		RAISE EXCEPTION 'Creator and idempotency key are required';
	END IF;

	IF jsonb_typeof(p_players) <> 'array' OR jsonb_typeof(p_matches) <> 'array' THEN
		RAISE EXCEPTION 'Players and matches must be JSON arrays';
	END IF;

	v_player_count := jsonb_array_length(p_players);
	IF v_player_count < 2 OR v_player_count > 6 THEN
		RAISE EXCEPTION 'Player count must be between 2 and 6';
	END IF;

	SELECT count(DISTINCT (player->>'id')::uuid)
	INTO v_unique_player_count
	FROM jsonb_array_elements(p_players) AS player;

	IF v_unique_player_count <> v_player_count THEN
		RAISE EXCEPTION 'Each selected player must be unique';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_players) AS player
		WHERE COALESCE((player->>'isPlaceholder')::boolean, false)
			AND char_length(btrim(COALESCE(player->>'name', ''))) NOT BETWEEN 1 AND 80
	) THEN
		RAISE EXCEPTION 'Placeholder names must be between 1 and 80 characters';
	END IF;

	IF jsonb_array_length(p_matches) = 0 THEN
		RAISE EXCEPTION 'At least one match is required';
	END IF;

	PERFORM pg_advisory_xact_lock(
		hashtextextended(p_created_by::text || ':' || p_idempotency_key::text, 0)
	);
	PERFORM pg_advisory_xact_lock(hashtextextended('gweilo:active-session', 0));

	SELECT request.session_id
	INTO v_session_id
	FROM public.session_creation_requests AS request
	WHERE request.created_by = p_created_by
		AND request.idempotency_key = p_idempotency_key;

	IF v_session_id IS NOT NULL THEN
		RETURN jsonb_build_object('state', 'replayed', 'sessionId', v_session_id);
	END IF;

	SELECT session.id
	INTO v_active_session_id
	FROM public.sessions AS session
	WHERE session.status = 'active'
	ORDER BY session.created_at DESC
	LIMIT 1;

	IF v_active_session_id IS NOT NULL THEN
		RETURN jsonb_build_object('state', 'active_exists', 'sessionId', v_active_session_id);
	END IF;

	INSERT INTO public.sessions (player_count, created_by)
	VALUES (v_player_count, p_created_by)
	RETURNING id INTO v_session_id;

	INSERT INTO public.session_players (session_id, player_id, team)
	SELECT
		v_session_id,
		(player->>'id')::uuid,
		NULLIF(player->>'team', '')
	FROM jsonb_array_elements(p_players) AS player
	WHERE NOT COALESCE((player->>'isPlaceholder')::boolean, false);

	INSERT INTO public.session_placeholders (id, session_id, display_name, team)
	SELECT
		(player->>'id')::uuid,
		v_session_id,
		btrim(player->>'name'),
		NULLIF(player->>'team', '')
	FROM jsonb_array_elements(p_players) AS player
	WHERE COALESCE((player->>'isPlaceholder')::boolean, false);

	INSERT INTO public.session_matches (
		session_id,
		round_number,
		match_type,
		match_order,
		player_ids,
		team_1_id,
		team_2_id,
		is_rated
	)
	SELECT
		v_session_id,
		(match->>'roundNumber')::integer,
		match->>'matchType',
		(match->>'matchOrder')::integer,
		match->'playerIds',
		NULLIF(match->>'team1Id', '')::uuid,
		NULLIF(match->>'team2Id', '')::uuid,
		COALESCE((match->>'isRated')::boolean, true)
	FROM jsonb_array_elements(p_matches) AS match;

	INSERT INTO public.session_creation_requests (
		created_by,
		idempotency_key,
		session_id
	)
	VALUES (p_created_by, p_idempotency_key, v_session_id);

	RETURN jsonb_build_object('state', 'created', 'sessionId', v_session_id);
END;
$create_session$;

REVOKE ALL ON FUNCTION public.create_session_atomic(uuid, uuid, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_atomic(uuid, uuid, jsonb, jsonb)
	TO service_role;
