-- Restores the guest-player schema after a database backup restore rolled the
-- production schema back to a point before the original guest migrations.
-- Safe to run more than once.

BEGIN;

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

DROP POLICY IF EXISTS "Users can view session placeholders, admins can view all"
	ON public.session_placeholders;
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
$create_session$;

REVOKE ALL ON FUNCTION public.create_session_atomic(uuid, uuid, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_atomic(uuid, uuid, jsonb, jsonb)
	TO service_role;

CREATE OR REPLACE FUNCTION public.get_rivalry_pair_stats(
	recent_session_limit INTEGER DEFAULT 4
)
RETURNS TABLE (
	player_a_id UUID,
	player_b_id UUID,
	total_matches BIGINT,
	player_a_wins BIGINT,
	player_b_wins BIGINT,
	draws BIGINT,
	last_played_at TIMESTAMPTZ,
	latest_winner_id UUID,
	current_streak BIGINT,
	close_loss_in_current_streak BOOLEAN,
	recent_shared_session_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $rivalry_stats$
	WITH recent_sessions AS MATERIALIZED (
		SELECT s.id
		FROM public.sessions s
		WHERE s.status = 'completed' AND s.completed_at IS NOT NULL
		ORDER BY s.completed_at DESC NULLS LAST, s.created_at DESC, s.id DESC
		LIMIT GREATEST(recent_session_limit, 0)
	),
	raw_matches AS (
		SELECT
			sm.id AS match_id,
			sm.session_id,
			COALESCE(NULLIF(sm.player_ids ->> 0, '')::UUID, meh.player1_id) AS player1_id,
			COALESCE(NULLIF(sm.player_ids ->> 1, '')::UUID, meh.player2_id) AS player2_id,
			CASE
				WHEN COALESCE(sm.team1_score, 0) = COALESCE(sm.team2_score, 0) THEN NULL
				WHEN COALESCE(sm.team1_score, 0) > COALESCE(sm.team2_score, 0)
					THEN COALESCE(NULLIF(sm.player_ids ->> 0, '')::UUID, meh.player1_id)
				ELSE COALESCE(NULLIF(sm.player_ids ->> 1, '')::UUID, meh.player2_id)
			END AS winner_id,
			ABS(COALESCE(sm.team1_score, 0) - COALESCE(sm.team2_score, 0)) AS set_margin,
			COALESCE(s.completed_at, s.created_at, sm.created_at) AS played_at,
			COALESCE(sm.round_number, 0) AS round_number,
			COALESCE(sm.match_order, 0) AS match_order,
			sm.created_at AS match_created_at,
			(rs.id IS NOT NULL) AS is_recent_session
		FROM public.session_matches sm
		JOIN public.sessions s ON s.id = sm.session_id
		LEFT JOIN LATERAL (
			SELECT history.player1_id, history.player2_id
			FROM public.match_elo_history history
			WHERE history.match_id = sm.id
			ORDER BY history.created_at DESC, history.id DESC
			LIMIT 1
		) meh ON TRUE
		LEFT JOIN recent_sessions rs ON rs.id = sm.session_id
		WHERE sm.status = 'completed'
			AND sm.match_type = 'singles'
			AND sm.is_rated = true
	),
	normalized_matches AS (
		SELECT
			rm.*,
			LEAST(rm.player1_id, rm.player2_id) AS player_a_id,
			GREATEST(rm.player1_id, rm.player2_id) AS player_b_id
		FROM raw_matches rm
		WHERE rm.player1_id IS NOT NULL
			AND rm.player2_id IS NOT NULL
			AND rm.player1_id <> rm.player2_id
	),
	ordered_matches AS (
		SELECT
			nm.*,
			FIRST_VALUE(nm.winner_id) OVER (
				PARTITION BY nm.player_a_id, nm.player_b_id
				ORDER BY nm.played_at DESC, nm.round_number DESC,
					nm.match_order DESC, nm.match_created_at DESC, nm.match_id DESC
			) AS latest_winner_id
		FROM normalized_matches nm
	),
	streak_marked AS (
		SELECT
			om.*,
			COUNT(*) FILTER (WHERE om.winner_id IS DISTINCT FROM om.latest_winner_id)
				OVER (
					PARTITION BY om.player_a_id, om.player_b_id
					ORDER BY om.played_at DESC, om.round_number DESC,
						om.match_order DESC, om.match_created_at DESC, om.match_id DESC
					ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
				) AS streak_breaks
		FROM ordered_matches om
	)
	SELECT
		sm.player_a_id,
		sm.player_b_id,
		COUNT(*) AS total_matches,
		COUNT(*) FILTER (WHERE sm.winner_id = sm.player_a_id) AS player_a_wins,
		COUNT(*) FILTER (WHERE sm.winner_id = sm.player_b_id) AS player_b_wins,
		COUNT(*) FILTER (WHERE sm.winner_id IS NULL) AS draws,
		MAX(sm.played_at) AS last_played_at,
		sm.latest_winner_id,
		COUNT(*) FILTER (
			WHERE sm.latest_winner_id IS NOT NULL AND sm.streak_breaks = 0
		) AS current_streak,
		COALESCE(
			BOOL_OR(sm.set_margin <= 1) FILTER (
				WHERE sm.latest_winner_id IS NOT NULL AND sm.streak_breaks = 0
			),
			FALSE
		) AS close_loss_in_current_streak,
		COUNT(DISTINCT sm.session_id) FILTER (WHERE sm.is_recent_session)
			AS recent_shared_session_count
	FROM streak_marked sm
	GROUP BY sm.player_a_id, sm.player_b_id, sm.latest_winner_id;
$rivalry_stats$;

REVOKE ALL ON FUNCTION public.get_rivalry_pair_stats(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rivalry_pair_stats(INTEGER) TO service_role;

-- Mission snapshots are derived data and will be regenerated on demand.
DELETE FROM public.rivalry_mission_snapshots;

COMMIT;

NOTIFY pgrst, 'reload schema';
