-- Production briefly had a partially updated version of this RPC: it validated
-- guest metadata but still inserted every participant into session_players.
-- Reinstall the complete guest-aware function under a unique migration version.

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
AS $$
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
		RAISE EXCEPTION 'Guest names must be between 1 and 80 characters';
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
$$;
