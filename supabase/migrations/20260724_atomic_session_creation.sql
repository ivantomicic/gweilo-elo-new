-- Session creation must be safe across web, iOS, retries, and concurrent devices.
-- One club can have only one active session, and the session plus all of its
-- players and matches are inserted in a single transaction.

DO $active_session_guard$
BEGIN
	IF (
		SELECT count(*)
		FROM public.sessions
		WHERE status = 'active'
	) > 1 THEN
		RAISE EXCEPTION
			'Cannot install the single-active-session guard while multiple active sessions exist';
	END IF;
END;
$active_session_guard$;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_single_active_idx
	ON public.sessions (status)
	WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.session_creation_requests (
	created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	idempotency_key uuid NOT NULL,
	session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (created_by, idempotency_key),
	UNIQUE (session_id)
);

ALTER TABLE public.session_creation_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.session_creation_requests FROM anon, authenticated;

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

	IF jsonb_array_length(p_matches) = 0 THEN
		RAISE EXCEPTION 'At least one match is required';
	END IF;

	-- Serialize retries for the same operation, then serialize all attempts to
	-- claim the club-wide active-session slot.
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
		RETURN jsonb_build_object(
			'state', 'replayed',
			'sessionId', v_session_id
		);
	END IF;

	SELECT session.id
	INTO v_active_session_id
	FROM public.sessions AS session
	WHERE session.status = 'active'
	ORDER BY session.created_at DESC
	LIMIT 1;

	IF v_active_session_id IS NOT NULL THEN
		RETURN jsonb_build_object(
			'state', 'active_exists',
			'sessionId', v_active_session_id
		);
	END IF;

	INSERT INTO public.sessions (player_count, created_by)
	VALUES (v_player_count, p_created_by)
	RETURNING id INTO v_session_id;

	INSERT INTO public.session_players (session_id, player_id, team)
	SELECT
		v_session_id,
		(player->>'id')::uuid,
		NULLIF(player->>'team', '')
	FROM jsonb_array_elements(p_players) AS player;

	INSERT INTO public.session_matches (
		session_id,
		round_number,
		match_type,
		match_order,
		player_ids,
		team_1_id,
		team_2_id
	)
	SELECT
		v_session_id,
		(match->>'roundNumber')::integer,
		match->>'matchType',
		(match->>'matchOrder')::integer,
		ARRAY(
			SELECT jsonb_array_elements_text(match->'playerIds')
		)::uuid[],
		NULLIF(match->>'team1Id', '')::uuid,
		NULLIF(match->>'team2Id', '')::uuid
	FROM jsonb_array_elements(p_matches) AS match;

	INSERT INTO public.session_creation_requests (
		created_by,
		idempotency_key,
		session_id
	)
	VALUES (p_created_by, p_idempotency_key, v_session_id);

	RETURN jsonb_build_object(
		'state', 'created',
		'sessionId', v_session_id
	);
END;
$create_session$;

CREATE OR REPLACE FUNCTION public.cancel_active_session_atomic(
	p_session_id uuid,
	p_requested_by uuid,
	p_is_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $cancel_session$
DECLARE
	v_created_by uuid;
	v_status text;
	v_completed_match_count integer;
BEGIN
	SELECT session.created_by, session.status
	INTO v_created_by, v_status
	FROM public.sessions AS session
	WHERE session.id = p_session_id
	FOR UPDATE;

	IF v_created_by IS NULL THEN
		RETURN jsonb_build_object('state', 'not_found');
	END IF;

	IF v_created_by <> p_requested_by AND NOT p_is_admin THEN
		RETURN jsonb_build_object('state', 'forbidden');
	END IF;

	IF v_status <> 'active' THEN
		RETURN jsonb_build_object('state', 'not_active');
	END IF;

	SELECT count(*)
	INTO v_completed_match_count
	FROM public.session_matches
	WHERE session_id = p_session_id
		AND status = 'completed';

	IF v_completed_match_count > 0 THEN
		RETURN jsonb_build_object(
			'state', 'has_results',
			'completedMatchCount', v_completed_match_count
		);
	END IF;

	DELETE FROM public.sessions
	WHERE id = p_session_id;

	RETURN jsonb_build_object(
		'state', 'cancelled',
		'sessionId', p_session_id
	);
END;
$cancel_session$;

REVOKE ALL ON FUNCTION public.create_session_atomic(uuid, uuid, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_active_session_atomic(uuid, uuid, boolean)
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_session_atomic(uuid, uuid, jsonb, jsonb)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_active_session_atomic(uuid, uuid, boolean)
	TO service_role;
