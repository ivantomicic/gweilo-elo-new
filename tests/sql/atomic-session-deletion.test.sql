\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		CREATE ROLE anon;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role;
	END IF;
END;
$$;

CREATE TABLE public.sessions (
	id uuid PRIMARY KEY,
	status text NOT NULL,
	created_at timestamptz NOT NULL,
	completed_at timestamptz,
	recalc_status text
);

CREATE TABLE public.session_players (
	session_id uuid NOT NULL REFERENCES public.sessions(id),
	player_id uuid NOT NULL,
	PRIMARY KEY (session_id, player_id)
);

CREATE TABLE public.session_placeholders (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES public.sessions(id)
);

CREATE TABLE public.session_matches (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES public.sessions(id),
	round_number integer NOT NULL,
	match_order integer NOT NULL,
	match_type text NOT NULL,
	player_ids jsonb NOT NULL,
	team_1_id uuid,
	team_2_id uuid,
	status text NOT NULL,
	is_rated boolean NOT NULL DEFAULT true,
	team1_score integer,
	team2_score integer
);

CREATE TABLE public.player_ratings (
	player_id uuid PRIMARY KEY,
	elo numeric(10,2) NOT NULL,
	matches_played integer NOT NULL,
	wins integer NOT NULL,
	losses integer NOT NULL,
	draws integer NOT NULL,
	sets_won integer NOT NULL,
	sets_lost integer NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.player_double_ratings (LIKE public.player_ratings INCLUDING ALL);

CREATE TABLE public.double_team_ratings (
	team_id uuid PRIMARY KEY,
	elo numeric(10,2) NOT NULL,
	matches_played integer NOT NULL,
	wins integer NOT NULL,
	losses integer NOT NULL,
	draws integer NOT NULL,
	sets_won integer NOT NULL,
	sets_lost integer NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.match_elo_history (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	match_id uuid NOT NULL UNIQUE REFERENCES public.session_matches(id),
	player1_id uuid,
	player2_id uuid,
	team1_id uuid,
	team2_id uuid
);

CREATE TABLE public.elo_snapshots (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	match_id uuid NOT NULL REFERENCES public.session_matches(id),
	player_id uuid NOT NULL,
	elo numeric(10,2) NOT NULL,
	matches_played integer NOT NULL,
	wins integer NOT NULL,
	losses integer NOT NULL,
	draws integer NOT NULL,
	sets_won integer NOT NULL,
	sets_lost integer NOT NULL,
	UNIQUE (match_id, player_id)
);

CREATE TABLE public.elo_round_submissions (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES public.sessions(id)
);

CREATE TABLE public.session_rating_snapshots (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id uuid NOT NULL REFERENCES public.sessions(id),
	entity_type text NOT NULL,
	entity_id uuid NOT NULL,
	elo numeric(10,2) NOT NULL,
	matches_played integer NOT NULL,
	wins integer NOT NULL,
	losses integer NOT NULL,
	draws integer NOT NULL,
	sets_won integer NOT NULL,
	sets_lost integer NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (session_id, entity_type, entity_id)
);

CREATE TABLE public.rivalry_mission_snapshots (
	player_id uuid PRIMARY KEY,
	player_elo numeric NOT NULL
);

\ir ../../supabase/migrations/202608060001_atomic_latest_session_deletion.sql

INSERT INTO public.sessions (id, status, created_at, completed_at, recalc_status) VALUES
	('10000000-0000-0000-0000-000000000001', 'completed', '2026-01-01', '2026-01-01 20:00Z', 'done'),
	('10000000-0000-0000-0000-000000000002', 'completed', '2026-01-02', '2026-01-02 20:00Z', 'done');

INSERT INTO public.session_players (session_id, player_id) VALUES
	('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
	('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');

INSERT INTO public.session_placeholders (id, session_id) VALUES
	('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');

INSERT INTO public.session_matches (
	id, session_id, round_number, match_order, match_type, player_ids,
	team_1_id, team_2_id, status, is_rated, team1_score, team2_score
) VALUES
	('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 1, 0, 'singles', '["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000002"]', NULL, NULL, 'completed', true, 3, 1),
	('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 2, 0, 'doubles', '["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000002","40000000-0000-0000-0000-000000000003","40000000-0000-0000-0000-000000000004"]', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'completed', true, 3, 2),
	-- A deferred first-half result has no Elo history and must not affect restoration.
	('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000002', 1, 0, 'singles', '["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000005"]', NULL, NULL, 'completed', true, 2, 1),
	('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000002', 6, 0, 'singles', '["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000005"]', NULL, NULL, 'completed', true, 2, 2),
	('20000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000002', 7, 0, 'doubles', '["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000002","40000000-0000-0000-0000-000000000003","40000000-0000-0000-0000-000000000004"]', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 'completed', true, 3, 1),
	-- Exhibition results are deleted with the session but never enter Elo history.
	('20000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000002', 8, 0, 'singles', '["40000000-0000-0000-0000-000000000001","90000000-0000-0000-0000-000000000001"]', NULL, NULL, 'completed', false, 3, 0);

INSERT INTO public.match_elo_history (match_id, player1_id, player2_id, team1_id, team2_id) VALUES
	('20000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', NULL, NULL),
	('20000000-0000-0000-0000-000000000012', NULL, NULL, '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002'),
	('20000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', NULL, NULL),
	('20000000-0000-0000-0000-000000000023', NULL, NULL, '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004');

INSERT INTO public.elo_snapshots (
	match_id, player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost
) VALUES
	('20000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', 1510, 1, 1, 0, 0, 3, 1),
	('20000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', 1510, 1, 1, 0, 0, 3, 2),
	('20000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000002', 1510, 1, 1, 0, 0, 3, 2),
	('20000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000003', 1490, 1, 0, 1, 0, 2, 3),
	('20000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', 1490, 1, 0, 1, 0, 2, 3),
	('20000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000001', 1520, 2, 2, 0, 0, 7, 3),
	('20000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000001', 1520, 2, 2, 0, 0, 6, 3),
	('20000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000002', 1520, 2, 2, 0, 0, 6, 3),
	('20000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000003', 1480, 2, 0, 2, 0, 3, 6),
	('20000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000004', 1480, 2, 0, 2, 0, 3, 6);

INSERT INTO public.session_rating_snapshots (
	session_id, entity_type, entity_id, elo, matches_played, wins, losses,
	draws, sets_won, sets_lost
) VALUES
	('10000000-0000-0000-0000-000000000001', 'player_singles', '40000000-0000-0000-0000-000000000001', 1510, 1, 1, 0, 0, 3, 1),
	('10000000-0000-0000-0000-000000000001', 'player_singles', '40000000-0000-0000-0000-000000000002', 1490, 1, 0, 1, 0, 1, 3),
	('10000000-0000-0000-0000-000000000001', 'player_doubles', '40000000-0000-0000-0000-000000000001', 1510, 1, 1, 0, 0, 3, 2),
	('10000000-0000-0000-0000-000000000001', 'player_doubles', '40000000-0000-0000-0000-000000000002', 1510, 1, 1, 0, 0, 3, 2),
	('10000000-0000-0000-0000-000000000001', 'player_doubles', '40000000-0000-0000-0000-000000000003', 1490, 1, 0, 1, 0, 2, 3),
	('10000000-0000-0000-0000-000000000001', 'player_doubles', '40000000-0000-0000-0000-000000000004', 1490, 1, 0, 1, 0, 2, 3),
	('10000000-0000-0000-0000-000000000001', 'double_team', '50000000-0000-0000-0000-000000000001', 1510, 1, 1, 0, 0, 3, 2),
	('10000000-0000-0000-0000-000000000001', 'double_team', '50000000-0000-0000-0000-000000000002', 1490, 1, 0, 1, 0, 2, 3),
	('10000000-0000-0000-0000-000000000002', 'player_singles', '40000000-0000-0000-0000-000000000001', 1520, 2, 2, 0, 0, 7, 3),
	('10000000-0000-0000-0000-000000000002', 'player_singles', '40000000-0000-0000-0000-000000000002', 1490, 1, 0, 1, 0, 1, 3),
	('10000000-0000-0000-0000-000000000002', 'player_singles', '40000000-0000-0000-0000-000000000005', 1485, 1, 0, 1, 0, 2, 4),
	('10000000-0000-0000-0000-000000000002', 'player_doubles', '40000000-0000-0000-0000-000000000001', 1520, 2, 2, 0, 0, 6, 3),
	('10000000-0000-0000-0000-000000000002', 'player_doubles', '40000000-0000-0000-0000-000000000002', 1520, 2, 2, 0, 0, 6, 3),
	('10000000-0000-0000-0000-000000000002', 'player_doubles', '40000000-0000-0000-0000-000000000003', 1480, 2, 0, 2, 0, 3, 6),
	('10000000-0000-0000-0000-000000000002', 'player_doubles', '40000000-0000-0000-0000-000000000004', 1480, 2, 0, 2, 0, 3, 6),
	('10000000-0000-0000-0000-000000000002', 'double_team', '50000000-0000-0000-0000-000000000001', 1510, 1, 1, 0, 0, 3, 2),
	('10000000-0000-0000-0000-000000000002', 'double_team', '50000000-0000-0000-0000-000000000002', 1490, 1, 0, 1, 0, 2, 3),
	('10000000-0000-0000-0000-000000000002', 'double_team', '50000000-0000-0000-0000-000000000003', 1520, 1, 1, 0, 0, 3, 1),
	('10000000-0000-0000-0000-000000000002', 'double_team', '50000000-0000-0000-0000-000000000004', 1480, 1, 0, 1, 0, 1, 3);

INSERT INTO public.player_ratings
	(player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost)
SELECT entity_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost
FROM public.session_rating_snapshots
WHERE session_id = '10000000-0000-0000-0000-000000000002'
	AND entity_type = 'player_singles';

INSERT INTO public.player_double_ratings
	(player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost)
SELECT entity_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost
FROM public.session_rating_snapshots
WHERE session_id = '10000000-0000-0000-0000-000000000002'
	AND entity_type = 'player_doubles';

INSERT INTO public.double_team_ratings
	(team_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost)
SELECT entity_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost
FROM public.session_rating_snapshots
WHERE session_id = '10000000-0000-0000-0000-000000000002'
	AND entity_type = 'double_team';

INSERT INTO public.elo_round_submissions (id, session_id) VALUES
	('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');

INSERT INTO public.rivalry_mission_snapshots VALUES
	('40000000-0000-0000-0000-000000000001', 1520);

-- Older sessions, running recalculations, active results, rating drift, and
-- incomplete historical snapshots must all fail without mutation.
DO $$
DECLARE
	v_result jsonb;
BEGIN
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000001',
		'70000000-0000-0000-0000-000000000001',
		true
	);
	IF v_result->>'state' <> 'not_latest' THEN
		RAISE EXCEPTION 'older completed session should not be deletable: %', v_result;
	END IF;

	UPDATE public.sessions SET recalc_status = 'running'
	WHERE id = '10000000-0000-0000-0000-000000000002';
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000002',
		'70000000-0000-0000-0000-000000000001',
		true
	);
	IF v_result->>'state' <> 'recalculation_running' THEN
		RAISE EXCEPTION 'running recalculation should block deletion: %', v_result;
	END IF;
	UPDATE public.sessions SET recalc_status = 'done'
	WHERE id = '10000000-0000-0000-0000-000000000002';

	INSERT INTO public.sessions VALUES
		('10000000-0000-0000-0000-000000000003', 'active', '2026-01-03', NULL, 'idle');
	INSERT INTO public.session_matches VALUES
		('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 1, 0, 'singles', '["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000002"]', NULL, NULL, 'completed', true, 3, 1);
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000002',
		'70000000-0000-0000-0000-000000000001',
		true
	);
	IF v_result->>'state' <> 'active_session_has_results' THEN
		RAISE EXCEPTION 'active results should block deletion: %', v_result;
	END IF;
	DELETE FROM public.session_matches WHERE session_id = '10000000-0000-0000-0000-000000000003';
	DELETE FROM public.sessions WHERE id = '10000000-0000-0000-0000-000000000003';

	UPDATE public.player_ratings SET elo = elo + 1
	WHERE player_id = '40000000-0000-0000-0000-000000000001';
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000002',
		'70000000-0000-0000-0000-000000000001',
		true
	);
	IF v_result->>'state' <> 'rating_state_conflict' THEN
		RAISE EXCEPTION 'rating drift should block deletion: %', v_result;
	END IF;
	UPDATE public.player_ratings SET elo = elo - 1
	WHERE player_id = '40000000-0000-0000-0000-000000000001';

	DELETE FROM public.session_rating_snapshots
	WHERE session_id = '10000000-0000-0000-0000-000000000001'
		AND entity_type = 'player_doubles'
		AND entity_id = '40000000-0000-0000-0000-000000000004';
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000002',
		'70000000-0000-0000-0000-000000000001',
		true
	);
	IF v_result->>'state' <> 'snapshot_incomplete' THEN
		RAISE EXCEPTION 'incomplete previous snapshot should block deletion: %', v_result;
	END IF;
	INSERT INTO public.session_rating_snapshots (
		session_id, entity_type, entity_id, elo, matches_played, wins, losses,
		draws, sets_won, sets_lost
	) VALUES (
		'10000000-0000-0000-0000-000000000001', 'player_doubles',
		'40000000-0000-0000-0000-000000000004', 1490, 1, 0, 1, 0, 2, 3
	);
END;
$$;

-- Dry-run uses every guard but changes nothing.
DO $$
DECLARE
	v_result jsonb;
BEGIN
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000002',
		'70000000-0000-0000-0000-000000000001',
		false
	);
	IF v_result->>'state' <> 'deletable' THEN
		RAISE EXCEPTION 'valid dry-run was rejected: %', v_result;
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM public.sessions
		WHERE id = '10000000-0000-0000-0000-000000000002'
	) THEN
		RAISE EXCEPTION 'dry-run deleted the target';
	END IF;
END;
$$;

-- A failure at the final session delete must roll back restored ratings and all
-- child-row removals.
CREATE TABLE public.deletion_blockers (
	session_id uuid PRIMARY KEY REFERENCES public.sessions(id)
);
INSERT INTO public.deletion_blockers VALUES
	('10000000-0000-0000-0000-000000000002');

DO $$
BEGIN
	BEGIN
		PERFORM public.delete_latest_completed_session_atomic(
			'10000000-0000-0000-0000-000000000002',
			'70000000-0000-0000-0000-000000000001',
			true
		);
		RAISE EXCEPTION 'expected forced session-delete failure';
	EXCEPTION WHEN foreign_key_violation THEN
		NULL;
	END;

	IF (SELECT elo FROM public.player_ratings WHERE player_id = '40000000-0000-0000-0000-000000000001') <> 1520 THEN
		RAISE EXCEPTION 'failed deletion did not roll ratings back';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM public.match_elo_history WHERE match_id = '20000000-0000-0000-0000-000000000023') THEN
		RAISE EXCEPTION 'failed deletion did not roll history back';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = '10000000-0000-0000-0000-000000000002') THEN
		RAISE EXCEPTION 'failed deletion removed the session';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM public.rivalry_mission_snapshots) THEN
		RAISE EXCEPTION 'failed deletion did not roll mission invalidation back';
	END IF;
	IF EXISTS (SELECT 1 FROM public.session_deletion_audit) THEN
		RAISE EXCEPTION 'failed deletion created an audit record';
	END IF;
END;
$$;

DELETE FROM public.deletion_blockers;

-- Successful deletion restores all previous singles, doubles-player, and team
-- rows, removes target-only entities and children, and writes one audit record.
DO $$
DECLARE
	v_result jsonb;
BEGIN
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000002',
		'70000000-0000-0000-0000-000000000001',
		true
	);
	IF v_result->>'state' <> 'deleted' THEN
		RAISE EXCEPTION 'valid deletion failed: %', v_result;
	END IF;
	IF (v_result->>'restoredSinglesCount')::integer <> 2
		OR (v_result->>'restoredDoublesPlayerCount')::integer <> 4
		OR (v_result->>'restoredDoublesTeamCount')::integer <> 2 THEN
		RAISE EXCEPTION 'unexpected restore counts: %', v_result;
	END IF;

	IF EXISTS (SELECT 1 FROM public.sessions WHERE id = '10000000-0000-0000-0000-000000000002') THEN
		RAISE EXCEPTION 'target session still exists';
	END IF;
	IF (SELECT count(*) FROM public.session_matches) <> 2
		OR (SELECT count(*) FROM public.match_elo_history) <> 2
		OR (SELECT count(*) FROM public.elo_snapshots) <> 5 THEN
		RAISE EXCEPTION 'target child rows were not removed exactly';
	END IF;
	IF EXISTS (SELECT 1 FROM public.elo_round_submissions) THEN
		RAISE EXCEPTION 'target submission ledger still exists';
	END IF;
	IF EXISTS (SELECT 1 FROM public.rivalry_mission_snapshots) THEN
		RAISE EXCEPTION 'stale mission snapshots were not invalidated';
	END IF;
	IF (SELECT count(*) FROM public.player_ratings) <> 2
		OR (SELECT elo FROM public.player_ratings WHERE player_id = '40000000-0000-0000-0000-000000000001') <> 1510
		OR EXISTS (SELECT 1 FROM public.player_ratings WHERE player_id = '40000000-0000-0000-0000-000000000005') THEN
		RAISE EXCEPTION 'singles ratings were not restored exactly';
	END IF;
	IF (SELECT count(*) FROM public.player_double_ratings) <> 4
		OR (SELECT elo FROM public.player_double_ratings WHERE player_id = '40000000-0000-0000-0000-000000000003') <> 1490 THEN
		RAISE EXCEPTION 'doubles player ratings were not restored exactly';
	END IF;
	IF (SELECT count(*) FROM public.double_team_ratings) <> 2
		OR EXISTS (SELECT 1 FROM public.double_team_ratings WHERE team_id = '50000000-0000-0000-0000-000000000003') THEN
		RAISE EXCEPTION 'doubles team ratings were not restored exactly';
	END IF;
	IF (SELECT count(*) FROM public.session_deletion_audit) <> 1 THEN
		RAISE EXCEPTION 'successful deletion audit missing';
	END IF;
END;
$$;

-- Deleting the only remaining completed session restores the empty baseline.
DO $$
DECLARE
	v_result jsonb;
BEGIN
	v_result := public.delete_latest_completed_session_atomic(
		'10000000-0000-0000-0000-000000000001',
		'70000000-0000-0000-0000-000000000001',
		true
	);
	IF v_result->>'state' <> 'deleted' THEN
		RAISE EXCEPTION 'only-session deletion failed: %', v_result;
	END IF;
	IF EXISTS (SELECT 1 FROM public.player_ratings)
		OR EXISTS (SELECT 1 FROM public.player_double_ratings)
		OR EXISTS (SELECT 1 FROM public.double_team_ratings)
		OR EXISTS (SELECT 1 FROM public.match_elo_history)
		OR EXISTS (SELECT 1 FROM public.elo_snapshots)
		OR EXISTS (SELECT 1 FROM public.sessions) THEN
		RAISE EXCEPTION 'empty baseline was not restored';
	END IF;
	IF (SELECT count(*) FROM public.session_deletion_audit) <> 2 THEN
		RAISE EXCEPTION 'second deletion audit missing';
	END IF;
END;
$$;

SELECT 'atomic latest-session deletion SQL integration tests passed' AS result;
