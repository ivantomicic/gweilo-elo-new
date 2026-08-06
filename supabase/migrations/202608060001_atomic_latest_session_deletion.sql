-- Delete the latest completed session and restore the exact rating state that
-- existed after the preceding completed session. Everything runs in one
-- PostgreSQL transaction: validation failures return without changing data,
-- and any write failure rolls the whole operation back.

CREATE TABLE IF NOT EXISTS public.session_deletion_audit (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	deleted_session_id uuid NOT NULL,
	previous_session_id uuid,
	deleted_by uuid NOT NULL,
	deleted_at timestamptz NOT NULL DEFAULT now(),
	deleted_match_count integer NOT NULL,
	restored_singles_count integer NOT NULL,
	restored_doubles_player_count integer NOT NULL,
	restored_doubles_team_count integer NOT NULL
);

ALTER TABLE public.session_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_deletion_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.session_deletion_audit TO service_role;

CREATE OR REPLACE FUNCTION public.delete_latest_completed_session_atomic(
	p_session_id uuid,
	p_deleted_by uuid,
	p_execute boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $delete_session$
DECLARE
	v_target_status text;
	v_target_recalc_status text;
	v_latest_session_id uuid;
	v_previous_session_id uuid;
	v_deleted_match_count integer := 0;
	v_restored_singles_count integer := 0;
	v_restored_doubles_player_count integer := 0;
	v_restored_doubles_team_count integer := 0;
	v_rating_state_conflict boolean := false;
	v_snapshot_incomplete boolean := false;
BEGIN
	IF p_session_id IS NULL OR p_deleted_by IS NULL THEN
		RETURN jsonb_build_object('state', 'invalid_request');
	END IF;

	-- Round settlement uses this same lock. The active-session lock prevents a
	-- new session from appearing between the safety checks and the delete.
	PERFORM pg_advisory_xact_lock(hashtextextended('gweilo:elo:settlement', 0));
	PERFORM pg_advisory_xact_lock(hashtextextended('gweilo:active-session', 0));

	SELECT session.status, session.recalc_status
	INTO v_target_status, v_target_recalc_status
	FROM public.sessions AS session
	WHERE session.id = p_session_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN jsonb_build_object('state', 'not_found');
	END IF;

	IF v_target_status <> 'completed' THEN
		RETURN jsonb_build_object('state', 'not_completed');
	END IF;

	IF v_target_recalc_status = 'running' THEN
		RETURN jsonb_build_object('state', 'recalculation_running');
	END IF;

	SELECT session.id
	INTO v_latest_session_id
	FROM public.sessions AS session
	WHERE session.status = 'completed'
	ORDER BY
		session.completed_at DESC NULLS LAST,
		session.created_at DESC,
		session.id DESC
	LIMIT 1;

	IF v_latest_session_id IS DISTINCT FROM p_session_id THEN
		RETURN jsonb_build_object(
			'state', 'not_latest',
			'latestSessionId', v_latest_session_id
		);
	END IF;

	-- A partially played active session may already depend on the target's Elo
	-- state. Refuse deletion instead of silently erasing or rebasing those results.
	IF EXISTS (
		SELECT 1
		FROM public.sessions AS active_session
		JOIN public.session_matches AS active_match
			ON active_match.session_id = active_session.id
		WHERE active_session.status = 'active'
			AND active_match.status = 'completed'
	) THEN
		RETURN jsonb_build_object('state', 'active_session_has_results');
	END IF;

	SELECT session.id
	INTO v_previous_session_id
	FROM public.sessions AS session
	WHERE session.status = 'completed'
		AND session.id <> p_session_id
	ORDER BY
		session.completed_at DESC NULLS LAST,
		session.created_at DESC,
		session.id DESC
	LIMIT 1;

	-- The real delete protects the validation snapshot as well as the writes.
	-- Dry-run checks remain non-mutating and intentionally avoid table locks.
	IF p_execute THEN
		LOCK TABLE
			public.player_ratings,
			public.player_double_ratings,
			public.double_team_ratings,
			public.match_elo_history,
			public.elo_snapshots,
			public.session_rating_snapshots
		IN SHARE ROW EXCLUSIVE MODE;
	END IF;

	-- A completed-session snapshot is a full copy of all three rating tables.
	-- The current tables must still equal the target snapshot; otherwise another
	-- mutation or an earlier data problem makes automatic restoration unsafe.
	WITH current_state AS (
		SELECT
			'player_singles'::text AS entity_type,
			player.player_id AS entity_id,
			player.elo,
			player.matches_played,
			player.wins,
			player.losses,
			player.draws,
			player.sets_won,
			player.sets_lost
		FROM public.player_ratings AS player
		UNION ALL
		SELECT
			'player_doubles'::text,
			player.player_id,
			player.elo,
			player.matches_played,
			player.wins,
			player.losses,
			player.draws,
			player.sets_won,
			player.sets_lost
		FROM public.player_double_ratings AS player
		UNION ALL
		SELECT
			'double_team'::text,
			team.team_id,
			team.elo,
			team.matches_played,
			team.wins,
			team.losses,
			team.draws,
			team.sets_won,
			team.sets_lost
		FROM public.double_team_ratings AS team
	), target_state AS (
		SELECT
			snapshot.entity_type,
			snapshot.entity_id,
			snapshot.elo,
			snapshot.matches_played,
			snapshot.wins,
			snapshot.losses,
			snapshot.draws,
			snapshot.sets_won,
			snapshot.sets_lost
		FROM public.session_rating_snapshots AS snapshot
		WHERE snapshot.session_id = p_session_id
	), differences AS (
		(SELECT * FROM current_state EXCEPT SELECT * FROM target_state)
		UNION ALL
		(SELECT * FROM target_state EXCEPT SELECT * FROM current_state)
	)
	SELECT EXISTS (SELECT 1 FROM differences)
	INTO v_rating_state_conflict;

	IF v_rating_state_conflict THEN
		RETURN jsonb_build_object('state', 'rating_state_conflict');
	END IF;

	-- Prove that the preceding snapshot contains every entity with rated history
	-- before the target. Deferred first-half and exhibition matches correctly do
	-- not appear in these source sets because they never changed Elo.
	IF v_previous_session_id IS NOT NULL THEN
		WITH required_state AS (
			SELECT 'player_singles'::text AS entity_type, history.player1_id AS entity_id
			FROM public.match_elo_history AS history
			JOIN public.session_matches AS match ON match.id = history.match_id
			JOIN public.sessions AS session ON session.id = match.session_id
			WHERE session.status = 'completed'
				AND session.id <> p_session_id
				AND history.player1_id IS NOT NULL
			UNION
			SELECT 'player_singles'::text, history.player2_id
			FROM public.match_elo_history AS history
			JOIN public.session_matches AS match ON match.id = history.match_id
			JOIN public.sessions AS session ON session.id = match.session_id
			WHERE session.status = 'completed'
				AND session.id <> p_session_id
				AND history.player2_id IS NOT NULL
			UNION
			SELECT 'double_team'::text, history.team1_id
			FROM public.match_elo_history AS history
			JOIN public.session_matches AS match ON match.id = history.match_id
			JOIN public.sessions AS session ON session.id = match.session_id
			WHERE session.status = 'completed'
				AND session.id <> p_session_id
				AND history.team1_id IS NOT NULL
			UNION
			SELECT 'double_team'::text, history.team2_id
			FROM public.match_elo_history AS history
			JOIN public.session_matches AS match ON match.id = history.match_id
			JOIN public.sessions AS session ON session.id = match.session_id
			WHERE session.status = 'completed'
				AND session.id <> p_session_id
				AND history.team2_id IS NOT NULL
			UNION
			SELECT
				'player_doubles'::text,
				(player_id.value)::uuid
			FROM public.match_elo_history AS history
			JOIN public.session_matches AS match ON match.id = history.match_id
			JOIN public.sessions AS session ON session.id = match.session_id
			CROSS JOIN LATERAL jsonb_array_elements_text(match.player_ids) AS player_id(value)
			WHERE session.status = 'completed'
				AND session.id <> p_session_id
				AND match.match_type = 'doubles'
		), previous_state AS (
			SELECT snapshot.entity_type, snapshot.entity_id
			FROM public.session_rating_snapshots AS snapshot
			WHERE snapshot.session_id = v_previous_session_id
		), missing_state AS (
			SELECT * FROM required_state
			EXCEPT
			SELECT * FROM previous_state
		)
		SELECT EXISTS (SELECT 1 FROM missing_state)
		INTO v_snapshot_incomplete;

		IF v_snapshot_incomplete THEN
			RETURN jsonb_build_object(
				'state', 'snapshot_incomplete',
				'previousSessionId', v_previous_session_id
			);
		END IF;
	END IF;

	IF NOT p_execute THEN
		RETURN jsonb_build_object(
			'state', 'deletable',
			'previousSessionId', v_previous_session_id
		);
	END IF;

	SELECT count(*)
	INTO v_deleted_match_count
	FROM public.session_matches
	WHERE session_id = p_session_id;

	-- Replace live ratings with the exact state captured immediately before the
	-- target session. This handles singles, doubles players, doubles teams, and
	-- entities first introduced by the deleted session without replaying history.
	DELETE FROM public.player_ratings;
	DELETE FROM public.player_double_ratings;
	DELETE FROM public.double_team_ratings;

	IF v_previous_session_id IS NOT NULL THEN
		INSERT INTO public.player_ratings (
			player_id, elo, matches_played, wins, losses, draws,
			sets_won, sets_lost, updated_at
		)
		SELECT
			snapshot.entity_id,
			snapshot.elo,
			snapshot.matches_played,
			snapshot.wins,
			snapshot.losses,
			snapshot.draws,
			snapshot.sets_won,
			snapshot.sets_lost,
			now()
		FROM public.session_rating_snapshots AS snapshot
		WHERE snapshot.session_id = v_previous_session_id
			AND snapshot.entity_type = 'player_singles';
		GET DIAGNOSTICS v_restored_singles_count = ROW_COUNT;

		INSERT INTO public.player_double_ratings (
			player_id, elo, matches_played, wins, losses, draws,
			sets_won, sets_lost, updated_at
		)
		SELECT
			snapshot.entity_id,
			snapshot.elo,
			snapshot.matches_played,
			snapshot.wins,
			snapshot.losses,
			snapshot.draws,
			snapshot.sets_won,
			snapshot.sets_lost,
			now()
		FROM public.session_rating_snapshots AS snapshot
		WHERE snapshot.session_id = v_previous_session_id
			AND snapshot.entity_type = 'player_doubles';
		GET DIAGNOSTICS v_restored_doubles_player_count = ROW_COUNT;

		INSERT INTO public.double_team_ratings (
			team_id, elo, matches_played, wins, losses, draws,
			sets_won, sets_lost, updated_at
		)
		SELECT
			snapshot.entity_id,
			snapshot.elo,
			snapshot.matches_played,
			snapshot.wins,
			snapshot.losses,
			snapshot.draws,
			snapshot.sets_won,
			snapshot.sets_lost,
			now()
		FROM public.session_rating_snapshots AS snapshot
		WHERE snapshot.session_id = v_previous_session_id
			AND snapshot.entity_type = 'double_team';
		GET DIAGNOSTICS v_restored_doubles_team_count = ROW_COUNT;
	END IF;

	DELETE FROM public.match_elo_history
	WHERE match_id IN (
		SELECT match.id
		FROM public.session_matches AS match
		WHERE match.session_id = p_session_id
	);

	DELETE FROM public.elo_snapshots
	WHERE match_id IN (
		SELECT match.id
		FROM public.session_matches AS match
		WHERE match.session_id = p_session_id
	);

	DELETE FROM public.session_rating_snapshots
	WHERE session_id = p_session_id;

	DELETE FROM public.elo_round_submissions
	WHERE session_id = p_session_id;

	DELETE FROM public.session_matches
	WHERE session_id = p_session_id;

	DELETE FROM public.session_players
	WHERE session_id = p_session_id;

	DELETE FROM public.session_placeholders
	WHERE session_id = p_session_id;

	-- Mission snapshots embed live ranks and Elo. Clear them inside the same
	-- transaction; the normal read path regenerates them from restored ratings.
	DELETE FROM public.rivalry_mission_snapshots;

	DELETE FROM public.sessions
	WHERE id = p_session_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'SESSION_DELETE_LOST_TARGET';
	END IF;

	INSERT INTO public.session_deletion_audit (
		deleted_session_id,
		previous_session_id,
		deleted_by,
		deleted_match_count,
		restored_singles_count,
		restored_doubles_player_count,
		restored_doubles_team_count
	) VALUES (
		p_session_id,
		v_previous_session_id,
		p_deleted_by,
		v_deleted_match_count,
		v_restored_singles_count,
		v_restored_doubles_player_count,
		v_restored_doubles_team_count
	);

	RETURN jsonb_build_object(
		'state', 'deleted',
		'deletedSessionId', p_session_id,
		'previousSessionId', v_previous_session_id,
		'deletedMatchCount', v_deleted_match_count,
		'restoredSinglesCount', v_restored_singles_count,
		'restoredDoublesPlayerCount', v_restored_doubles_player_count,
		'restoredDoublesTeamCount', v_restored_doubles_team_count
	);
END;
$delete_session$;

REVOKE ALL ON FUNCTION public.delete_latest_completed_session_atomic(uuid, uuid, boolean)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_latest_completed_session_atomic(uuid, uuid, boolean)
	TO service_role;
