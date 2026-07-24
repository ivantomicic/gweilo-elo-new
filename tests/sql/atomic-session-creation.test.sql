\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS dblink;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

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
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	player_count integer NOT NULL,
	created_by uuid NOT NULL REFERENCES auth.users(id),
	status text NOT NULL DEFAULT 'active',
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.session_players (
	session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
	player_id uuid NOT NULL REFERENCES auth.users(id),
	team text,
	PRIMARY KEY (session_id, player_id)
);

CREATE TABLE public.session_matches (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
	round_number integer NOT NULL,
	match_type text NOT NULL,
	match_order integer NOT NULL,
	player_ids jsonb NOT NULL,
	team_1_id uuid,
	team_2_id uuid,
	status text NOT NULL DEFAULT 'pending'
);

\ir ../../supabase/migrations/20260724_atomic_session_creation.sql
\ir ../../supabase/migrations/20260725_fix_atomic_session_player_ids.sql

INSERT INTO auth.users (id) VALUES
	('10000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000002'),
	('20000000-0000-4000-8000-000000000001'),
	('20000000-0000-4000-8000-000000000002');

SELECT dblink_connect('create_one', 'dbname=' || current_database());
SELECT dblink_connect('create_two', 'dbname=' || current_database());

-- Two devices with different operations race for the one active-session slot.
SELECT dblink_send_query(
	'create_one',
	$query$
		SELECT public.create_session_atomic(
			'10000000-0000-4000-8000-000000000001',
			'30000000-0000-4000-8000-000000000001',
			'[{"id":"20000000-0000-4000-8000-000000000001","team":null},{"id":"20000000-0000-4000-8000-000000000002","team":null}]',
			'[{"roundNumber":1,"matchType":"singles","matchOrder":0,"playerIds":["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"],"team1Id":null,"team2Id":null}]'
		)
	$query$
);
SELECT dblink_send_query(
	'create_two',
	$query$
		SELECT public.create_session_atomic(
			'10000000-0000-4000-8000-000000000002',
			'30000000-0000-4000-8000-000000000002',
			'[{"id":"20000000-0000-4000-8000-000000000001","team":null},{"id":"20000000-0000-4000-8000-000000000002","team":null}]',
			'[{"roundNumber":1,"matchType":"singles","matchOrder":0,"playerIds":["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"],"team1Id":null,"team2Id":null}]'
		)
	$query$
);

CREATE TEMP TABLE concurrency_results (
	attempt text NOT NULL,
	result jsonb NOT NULL
);
INSERT INTO concurrency_results
SELECT 'one', result
FROM dblink_get_result('create_one') AS response(result jsonb);
INSERT INTO concurrency_results
SELECT 'two', result
FROM dblink_get_result('create_two') AS response(result jsonb);
-- Drain each asynchronous connection completely before reusing it.
SELECT *
FROM dblink_get_result('create_one') AS response(result jsonb);
SELECT *
FROM dblink_get_result('create_two') AS response(result jsonb);

DO $$
BEGIN
	IF (SELECT count(*) FROM public.sessions WHERE status = 'active') <> 1 THEN
		RAISE EXCEPTION 'concurrent requests created more than one active session';
	END IF;
	IF (
		SELECT count(*)
		FROM concurrency_results
		WHERE result->>'state' = 'created'
	) <> 1 THEN
		RAISE EXCEPTION 'exactly one concurrent request should create a session';
	END IF;
	IF (
		SELECT count(*)
		FROM concurrency_results
		WHERE result->>'state' = 'active_exists'
	) <> 1 THEN
		RAISE EXCEPTION 'the losing concurrent request should see the active session';
	END IF;
	IF (
		SELECT count(*)
		FROM public.session_matches
		WHERE player_ids = '[
			"20000000-0000-4000-8000-000000000001",
			"20000000-0000-4000-8000-000000000002"
		]'::jsonb
	) <> 1 THEN
		RAISE EXCEPTION 'match player IDs were not stored as the expected JSON array';
	END IF;
END;
$$;

DELETE FROM public.sessions;
TRUNCATE concurrency_results;

-- Two retries of the same operation race; one creates and one replays.
SELECT dblink_send_query(
	'create_one',
	$query$
		SELECT public.create_session_atomic(
			'10000000-0000-4000-8000-000000000001',
			'30000000-0000-4000-8000-000000000003',
			'[{"id":"20000000-0000-4000-8000-000000000001","team":null},{"id":"20000000-0000-4000-8000-000000000002","team":null}]',
			'[{"roundNumber":1,"matchType":"singles","matchOrder":0,"playerIds":["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"],"team1Id":null,"team2Id":null}]'
		)
	$query$
);
SELECT dblink_send_query(
	'create_two',
	$query$
		SELECT public.create_session_atomic(
			'10000000-0000-4000-8000-000000000001',
			'30000000-0000-4000-8000-000000000003',
			'[{"id":"20000000-0000-4000-8000-000000000001","team":null},{"id":"20000000-0000-4000-8000-000000000002","team":null}]',
			'[{"roundNumber":1,"matchType":"singles","matchOrder":0,"playerIds":["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"],"team1Id":null,"team2Id":null}]'
		)
	$query$
);
INSERT INTO concurrency_results
SELECT 'one', result
FROM dblink_get_result('create_one') AS response(result jsonb);
INSERT INTO concurrency_results
SELECT 'two', result
FROM dblink_get_result('create_two') AS response(result jsonb);
SELECT *
FROM dblink_get_result('create_one') AS response(result jsonb);
SELECT *
FROM dblink_get_result('create_two') AS response(result jsonb);

DO $$
BEGIN
	IF (SELECT count(*) FROM public.sessions) <> 1 THEN
		RAISE EXCEPTION 'idempotent retries created duplicate sessions';
	END IF;
	IF (
		SELECT count(*)
		FROM concurrency_results
		WHERE result->>'state' = 'created'
	) <> 1 OR (
		SELECT count(*)
		FROM concurrency_results
		WHERE result->>'state' = 'replayed'
	) <> 1 THEN
		RAISE EXCEPTION 'idempotent retry did not replay the original session';
	END IF;
END;
$$;

-- Only the creator/admin may cancel, and cancellation is blocked after results.
DO $$
DECLARE
	v_session_id uuid := (SELECT id FROM public.sessions LIMIT 1);
	v_result jsonb;
BEGIN
	v_result := public.cancel_active_session_atomic(
		v_session_id,
		'10000000-0000-4000-8000-000000000002',
		false
	);
	IF v_result->>'state' <> 'forbidden' THEN
		RAISE EXCEPTION 'non-owner cancellation should be forbidden';
	END IF;

	UPDATE public.session_matches
	SET status = 'completed'
	WHERE session_id = v_session_id;
	v_result := public.cancel_active_session_atomic(
		v_session_id,
		'10000000-0000-4000-8000-000000000001',
		false
	);
	IF v_result->>'state' <> 'has_results' THEN
		RAISE EXCEPTION 'a session with results must not be deleted';
	END IF;
END;
$$;

DELETE FROM public.sessions;

-- Any failed child insert must roll the entire session creation back.
DO $$
BEGIN
	BEGIN
		PERFORM public.create_session_atomic(
			'10000000-0000-4000-8000-000000000001',
			'30000000-0000-4000-8000-000000000004',
			'[{"id":"90000000-0000-4000-8000-000000000001","team":null},{"id":"90000000-0000-4000-8000-000000000002","team":null}]',
			'[{"roundNumber":1,"matchType":"singles","matchOrder":0,"playerIds":["90000000-0000-4000-8000-000000000001","90000000-0000-4000-8000-000000000002"],"team1Id":null,"team2Id":null}]'
		);
		RAISE EXCEPTION 'expected foreign-key failure';
	EXCEPTION WHEN foreign_key_violation THEN
		NULL;
	END;

	IF (SELECT count(*) FROM public.sessions) <> 0 THEN
		RAISE EXCEPTION 'failed creation left a partial session behind';
	END IF;
	IF (SELECT count(*) FROM public.session_players) <> 0
		OR (SELECT count(*) FROM public.session_matches) <> 0 THEN
		RAISE EXCEPTION 'failed creation left child rows behind';
	END IF;
END;
$$;

-- A scoreless active session can be removed cleanly.
DO $$
DECLARE
	v_result jsonb;
	v_session_id uuid;
BEGIN
	v_result := public.create_session_atomic(
		'10000000-0000-4000-8000-000000000001',
		'30000000-0000-4000-8000-000000000005',
		'[{"id":"20000000-0000-4000-8000-000000000001","team":null},{"id":"20000000-0000-4000-8000-000000000002","team":null}]',
		'[{"roundNumber":1,"matchType":"singles","matchOrder":0,"playerIds":["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"],"team1Id":null,"team2Id":null}]'
	);
	v_session_id := (v_result->>'sessionId')::uuid;
	v_result := public.cancel_active_session_atomic(
		v_session_id,
		'10000000-0000-4000-8000-000000000001',
		false
	);
	IF v_result->>'state' <> 'cancelled' THEN
		RAISE EXCEPTION 'scoreless session was not cancelled';
	END IF;
	IF EXISTS (SELECT 1 FROM public.sessions WHERE id = v_session_id) THEN
		RAISE EXCEPTION 'cancelled session still exists';
	END IF;
END;
$$;

SELECT dblink_disconnect('create_one');
SELECT dblink_disconnect('create_two');

SELECT 'atomic session creation SQL integration tests passed' AS result;
