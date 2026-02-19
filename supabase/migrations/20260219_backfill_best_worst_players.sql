-- Backfill best/worst player fields for historical completed sessions
-- that are missing one or more best/worst columns.
--
-- Logic:
-- - Singles-only (matches existing best/worst definition)
-- - Uses match_elo_history deltas per player per session
-- - Best = highest total delta (tie-break: lowest UUID)
-- - Worst = lowest total delta (tie-break: lowest UUID)
-- - Only fills missing values (does not overwrite existing non-null values)

WITH target_sessions AS (
	SELECT id
	FROM sessions
	WHERE status = 'completed'
		AND (
			best_player_id IS NULL
			OR best_player_delta IS NULL
			OR worst_player_id IS NULL
			OR worst_player_delta IS NULL
		)
),
singles_history AS (
	SELECT
		sm.session_id,
		meh.player1_id AS player_id,
		meh.player1_elo_delta AS elo_delta
	FROM session_matches sm
	JOIN match_elo_history meh ON meh.match_id = sm.id
	JOIN target_sessions ts ON ts.id = sm.session_id
	WHERE sm.status = 'completed'
		AND sm.match_type = 'singles'
		AND meh.player1_id IS NOT NULL
		AND meh.player1_elo_delta IS NOT NULL

	UNION ALL

	SELECT
		sm.session_id,
		meh.player2_id AS player_id,
		meh.player2_elo_delta AS elo_delta
	FROM session_matches sm
	JOIN match_elo_history meh ON meh.match_id = sm.id
	JOIN target_sessions ts ON ts.id = sm.session_id
	WHERE sm.status = 'completed'
		AND sm.match_type = 'singles'
		AND meh.player2_id IS NOT NULL
		AND meh.player2_elo_delta IS NOT NULL
),
player_totals AS (
	SELECT
		session_id,
		player_id,
		SUM(elo_delta)::numeric AS total_delta
	FROM singles_history
	GROUP BY session_id, player_id
),
best_ranked AS (
	SELECT
		session_id,
		player_id,
		total_delta,
		ROW_NUMBER() OVER (
			PARTITION BY session_id
			ORDER BY total_delta DESC, player_id ASC
		) AS rn
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
		) AS rn
	FROM player_totals
),
session_best_worst AS (
	SELECT
		ts.id AS session_id,
		b.player_id AS best_player_id,
		b.total_delta AS best_player_delta,
		w.player_id AS worst_player_id,
		w.total_delta AS worst_player_delta
	FROM target_sessions ts
	LEFT JOIN best_ranked b
		ON b.session_id = ts.id
		AND b.rn = 1
	LEFT JOIN worst_ranked w
		ON w.session_id = ts.id
		AND w.rn = 1
)
UPDATE sessions s
SET
	best_player_id = COALESCE(s.best_player_id, sbw.best_player_id),
	best_player_delta = COALESCE(s.best_player_delta, sbw.best_player_delta),
	worst_player_id = COALESCE(s.worst_player_id, sbw.worst_player_id),
	worst_player_delta = COALESCE(s.worst_player_delta, sbw.worst_player_delta)
FROM session_best_worst sbw
WHERE s.id = sbw.session_id
	AND (
		sbw.best_player_id IS NOT NULL
		OR sbw.worst_player_id IS NOT NULL
	);

-- Optional cached display names: fill only where missing.
UPDATE sessions s
SET
	best_player_display_name = COALESCE(
		s.best_player_display_name,
		(SELECT p.display_name FROM profiles p WHERE p.id = s.best_player_id)
	),
	worst_player_display_name = COALESCE(
		s.worst_player_display_name,
		(SELECT p.display_name FROM profiles p WHERE p.id = s.worst_player_id)
	)
WHERE s.status = 'completed'
	AND (
		s.best_player_display_name IS NULL
		OR s.worst_player_display_name IS NULL
	)
	AND (
		s.best_player_id IS NOT NULL
		OR s.worst_player_id IS NOT NULL
	);
