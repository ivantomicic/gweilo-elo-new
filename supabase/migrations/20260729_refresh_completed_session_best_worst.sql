-- Recompute every completed session's cached best/worst singles metadata from
-- the authoritative Elo deltas committed in match_elo_history.
--
-- This intentionally overwrites existing values and clears stale values for
-- sessions without completed singles. Re-running it produces the same result.

WITH completed_sessions AS (
	SELECT id
	FROM public.sessions
	WHERE status = 'completed'
),
singles_players AS (
	SELECT DISTINCT
		sm.session_id,
		NULLIF(expanded_player.value, '')::UUID AS player_id
	FROM public.session_matches sm
	JOIN completed_sessions cs ON cs.id = sm.session_id
	CROSS JOIN LATERAL jsonb_array_elements_text(sm.player_ids)
		WITH ORDINALITY AS expanded_player(value, position)
	WHERE sm.status = 'completed'
		AND sm.match_type = 'singles'
		AND expanded_player.position <= 2
		AND NULLIF(expanded_player.value, '') IS NOT NULL
),
history_deltas AS (
	SELECT
		sm.session_id,
		meh.player1_id AS player_id,
		meh.player1_elo_delta AS elo_delta
	FROM public.session_matches sm
	JOIN completed_sessions cs ON cs.id = sm.session_id
	JOIN public.match_elo_history meh ON meh.match_id = sm.id
	WHERE sm.status = 'completed'
		AND sm.match_type = 'singles'
		AND meh.player1_id IS NOT NULL

	UNION ALL

	SELECT
		sm.session_id,
		meh.player2_id AS player_id,
		meh.player2_elo_delta AS elo_delta
	FROM public.session_matches sm
	JOIN completed_sessions cs ON cs.id = sm.session_id
	JOIN public.match_elo_history meh ON meh.match_id = sm.id
	WHERE sm.status = 'completed'
		AND sm.match_type = 'singles'
		AND meh.player2_id IS NOT NULL
),
player_totals AS (
	SELECT
		sp.session_id,
		sp.player_id,
		COALESCE(SUM(hd.elo_delta), 0)::NUMERIC AS total_delta
	FROM singles_players sp
	LEFT JOIN history_deltas hd
		ON hd.session_id = sp.session_id
		AND hd.player_id = sp.player_id
	GROUP BY sp.session_id, sp.player_id
),
best_ranked AS (
	SELECT
		session_id,
		player_id,
		total_delta,
		ROW_NUMBER() OVER (
			PARTITION BY session_id
			ORDER BY total_delta DESC, player_id ASC
		) AS rank
	FROM player_totals
),
worst_ranked AS (
	SELECT
		session_id,
		player_id,
		total_delta,
		ROW_NUMBER() OVER (
			PARTITION BY session_id
			ORDER BY total_delta ASC, player_id ASC
		) AS rank
	FROM player_totals
),
refreshed AS (
	SELECT
		cs.id AS session_id,
		best.player_id AS best_player_id,
		best.total_delta AS best_player_delta,
		best_profile.display_name AS best_player_display_name,
		worst.player_id AS worst_player_id,
		worst.total_delta AS worst_player_delta,
		worst_profile.display_name AS worst_player_display_name
	FROM completed_sessions cs
	LEFT JOIN best_ranked best
		ON best.session_id = cs.id
		AND best.rank = 1
	LEFT JOIN public.profiles best_profile ON best_profile.id = best.player_id
	LEFT JOIN worst_ranked worst
		ON worst.session_id = cs.id
		AND worst.rank = 1
	LEFT JOIN public.profiles worst_profile ON worst_profile.id = worst.player_id
)
UPDATE public.sessions s
SET
	best_player_id = refreshed.best_player_id,
	best_player_display_name = refreshed.best_player_display_name,
	best_player_delta = refreshed.best_player_delta,
	worst_player_id = refreshed.worst_player_id,
	worst_player_display_name = refreshed.worst_player_display_name,
	worst_player_delta = refreshed.worst_player_delta
FROM refreshed
WHERE s.id = refreshed.session_id;
