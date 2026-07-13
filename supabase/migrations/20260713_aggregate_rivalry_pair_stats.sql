-- Aggregate rivalry history in Postgres so mission generation receives one row
-- per player pair instead of transferring every match and Elo-history row.

CREATE INDEX IF NOT EXISTS session_matches_rivalry_lookup_idx
	ON public.session_matches (status, match_type, session_id);

CREATE INDEX IF NOT EXISTS match_elo_history_match_id_idx
	ON public.match_elo_history (match_id);

CREATE INDEX IF NOT EXISTS sessions_completed_at_idx
	ON public.sessions (completed_at DESC)
	WHERE status = 'completed';

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
AS $$
	WITH recent_sessions AS MATERIALIZED (
		SELECT s.id
		FROM public.sessions s
		WHERE s.status = 'completed'
			AND s.completed_at IS NOT NULL
		ORDER BY s.completed_at DESC NULLS LAST, s.created_at DESC, s.id DESC
		LIMIT GREATEST(recent_session_limit, 0)
	),
	raw_matches AS (
		SELECT
			sm.id AS match_id,
			sm.session_id,
			COALESCE(meh.player1_id, NULLIF(sm.player_ids ->> 0, '')::UUID) AS player1_id,
			COALESCE(meh.player2_id, NULLIF(sm.player_ids ->> 1, '')::UUID) AS player2_id,
			CASE
				WHEN meh.match_id IS NOT NULL THEN
					CASE
						WHEN meh.player1_elo_delta IS NOT DISTINCT FROM meh.player2_elo_delta THEN NULL
						WHEN COALESCE(meh.player1_elo_delta, 0) > COALESCE(meh.player2_elo_delta, 0)
							THEN COALESCE(meh.player1_id, NULLIF(sm.player_ids ->> 0, '')::UUID)
						ELSE COALESCE(meh.player2_id, NULLIF(sm.player_ids ->> 1, '')::UUID)
					END
				WHEN COALESCE(sm.team1_score, 0) = COALESCE(sm.team2_score, 0) THEN NULL
				WHEN COALESCE(sm.team1_score, 0) > COALESCE(sm.team2_score, 0)
					THEN NULLIF(sm.player_ids ->> 0, '')::UUID
				ELSE NULLIF(sm.player_ids ->> 1, '')::UUID
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
			SELECT
				history.match_id,
				history.player1_id,
				history.player2_id,
				history.player1_elo_delta,
				history.player2_elo_delta
			FROM public.match_elo_history history
			WHERE history.match_id = sm.id
			ORDER BY history.created_at DESC, history.id DESC
			LIMIT 1
		) meh ON TRUE
		LEFT JOIN recent_sessions rs ON rs.id = sm.session_id
		WHERE sm.status = 'completed'
			AND sm.match_type = 'singles'
	),
	normalized_matches AS (
		SELECT
			rm.*,
			CASE
				WHEN rm.player1_id::TEXT <= rm.player2_id::TEXT THEN rm.player1_id
				ELSE rm.player2_id
			END AS player_a_id,
			CASE
				WHEN rm.player1_id::TEXT <= rm.player2_id::TEXT THEN rm.player2_id
				ELSE rm.player1_id
			END AS player_b_id
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
				ORDER BY
					nm.played_at DESC,
					nm.round_number DESC,
					nm.match_order DESC,
					nm.match_created_at DESC,
					nm.match_id DESC
			) AS latest_winner_id
		FROM normalized_matches nm
	),
	streak_marked AS (
		SELECT
			om.*,
			COUNT(*) FILTER (
				WHERE om.winner_id IS DISTINCT FROM om.latest_winner_id
			) OVER (
				PARTITION BY om.player_a_id, om.player_b_id
				ORDER BY
					om.played_at DESC,
					om.round_number DESC,
					om.match_order DESC,
					om.match_created_at DESC,
					om.match_id DESC
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
			WHERE sm.latest_winner_id IS NOT NULL
				AND sm.streak_breaks = 0
		) AS current_streak,
		COALESCE(
			BOOL_OR(sm.set_margin <= 1) FILTER (
				WHERE sm.latest_winner_id IS NOT NULL
					AND sm.streak_breaks = 0
			),
			FALSE
		) AS close_loss_in_current_streak,
		COUNT(DISTINCT sm.session_id) FILTER (
			WHERE sm.is_recent_session
		) AS recent_shared_session_count
	FROM streak_marked sm
	GROUP BY sm.player_a_id, sm.player_b_id, sm.latest_winner_id;
$$;

REVOKE ALL ON FUNCTION public.get_rivalry_pair_stats(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rivalry_pair_stats(INTEGER) TO service_role;
