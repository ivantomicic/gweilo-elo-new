\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE sessions (
	id uuid PRIMARY KEY,
	status text NOT NULL DEFAULT 'active',
	completed_at timestamptz
);
CREATE TABLE session_matches (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES sessions(id),
	round_number integer NOT NULL,
	status text NOT NULL DEFAULT 'pending',
	team1_score integer,
	team2_score integer
);
CREATE TABLE player_ratings (
	player_id uuid PRIMARY KEY, elo numeric(10,2) NOT NULL DEFAULT 1500,
	matches_played integer NOT NULL DEFAULT 0, wins integer NOT NULL DEFAULT 0,
	losses integer NOT NULL DEFAULT 0, draws integer NOT NULL DEFAULT 0,
	sets_won integer NOT NULL DEFAULT 0, sets_lost integer NOT NULL DEFAULT 0,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE player_double_ratings (LIKE player_ratings INCLUDING ALL);
CREATE TABLE double_team_ratings (
	team_id uuid PRIMARY KEY, elo numeric(10,2) NOT NULL DEFAULT 1500,
	matches_played integer NOT NULL DEFAULT 0, wins integer NOT NULL DEFAULT 0,
	losses integer NOT NULL DEFAULT 0, draws integer NOT NULL DEFAULT 0,
	sets_won integer NOT NULL DEFAULT 0, sets_lost integer NOT NULL DEFAULT 0,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE match_elo_history (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL UNIQUE REFERENCES session_matches(id),
	player1_id uuid, player2_id uuid, player1_elo_before numeric(10,2), player1_elo_after numeric(10,2),
	player1_elo_delta numeric(10,2), player2_elo_before numeric(10,2), player2_elo_after numeric(10,2),
	player2_elo_delta numeric(10,2), team1_id uuid, team2_id uuid, team1_elo_before numeric(10,2),
	team1_elo_after numeric(10,2), team1_elo_delta numeric(10,2), team2_elo_before numeric(10,2),
	team2_elo_after numeric(10,2), team2_elo_delta numeric(10,2), created_at timestamptz DEFAULT now()
);
CREATE TABLE elo_snapshots (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL REFERENCES session_matches(id),
	player_id uuid NOT NULL, elo numeric(10,2) NOT NULL, matches_played integer NOT NULL,
	wins integer NOT NULL, losses integer NOT NULL, draws integer NOT NULL,
	sets_won integer NOT NULL, sets_lost integer NOT NULL, UNIQUE(match_id, player_id)
);
CREATE TABLE elo_round_submissions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_token uuid NOT NULL DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES sessions(id), round_number integer NOT NULL,
	status text NOT NULL DEFAULT 'processing', response jsonb, error_message text, completed_at timestamptz, updated_at timestamptz DEFAULT now(),
	UNIQUE(session_id, round_number)
);
CREATE TABLE session_rating_snapshots (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES sessions(id),
	entity_type text NOT NULL, entity_id uuid NOT NULL, elo numeric(10,2) NOT NULL,
	matches_played integer NOT NULL, wins integer NOT NULL, losses integer NOT NULL,
	draws integer NOT NULL, sets_won integer NOT NULL, sets_lost integer NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id, entity_type, entity_id)
);
CREATE ROLE service_role;

\ir ../../supabase/migrations/20260720_atomic_elo_round_submission.sql

INSERT INTO sessions VALUES ('10000000-0000-0000-0000-000000000000', 'active');
INSERT INTO session_matches(id, session_id, round_number) VALUES
	('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 1),
	('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 2);
INSERT INTO elo_round_submissions(id, session_id, round_number, status) VALUES
	('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 1, 'processing'),
	('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 2, 'processing');

DO $$
BEGIN
	BEGIN
		INSERT INTO elo_round_submissions(session_id, round_number)
		VALUES ('10000000-0000-0000-0000-000000000000', 1);
		RAISE EXCEPTION 'expected duplicate submission rejection';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;
	IF (SELECT count(*) FROM elo_round_submissions) <> 2 THEN
		RAISE EXCEPTION 'duplicate submission changed the guard ledger';
	END IF;
END $$;

DO $$
BEGIN
	BEGIN
		PERFORM commit_atomic_elo_round(
			'10000000-0000-0000-0000-000000000000', 1,
			'30000000-0000-0000-0000-000000000001',
			'99999999-9999-9999-9999-999999999999',
			'{"matches":[{"match_id":"20000000-0000-0000-0000-000000000001","team1_score":3,"team2_score":1}],"ratings":[],"history":[],"snapshots":[]}'::jsonb,
			'{"success":true}'::jsonb
		);
		RAISE EXCEPTION 'expected claim-token failure';
	EXCEPTION WHEN raise_exception THEN
		IF SQLERRM NOT LIKE 'ELO_SUBMISSION_NOT_CLAIMED%' THEN RAISE; END IF;
	END;
	IF (SELECT status FROM session_matches WHERE id='20000000-0000-0000-0000-000000000001') <> 'pending' THEN RAISE EXCEPTION 'invalid token changed match'; END IF;
END $$;

SELECT commit_atomic_elo_round(
	'10000000-0000-0000-0000-000000000000', 1,
	'30000000-0000-0000-0000-000000000001',
	(SELECT claim_token FROM elo_round_submissions WHERE id='30000000-0000-0000-0000-000000000001'),
	'{
		"matches":[{"match_id":"20000000-0000-0000-0000-000000000001","team1_score":3,"team2_score":1}],
		"ratings":[
			{"kind":"player_singles","entity_id":"40000000-0000-0000-0000-000000000001","expected_exists":false,"expected_elo":1500,"expected_matches_played":0,"after":{"elo":1520,"matches_played":1,"wins":1,"losses":0,"draws":0,"sets_won":3,"sets_lost":1}},
			{"kind":"player_singles","entity_id":"40000000-0000-0000-0000-000000000002","expected_exists":false,"expected_elo":1500,"expected_matches_played":0,"after":{"elo":1480,"matches_played":1,"wins":0,"losses":1,"draws":0,"sets_won":1,"sets_lost":3}}
		],
		"history":[{"match_id":"20000000-0000-0000-0000-000000000001","player1_id":"40000000-0000-0000-0000-000000000001","player2_id":"40000000-0000-0000-0000-000000000002","player1_elo_before":1500,"player1_elo_after":1520,"player1_elo_delta":20,"player2_elo_before":1500,"player2_elo_after":1480,"player2_elo_delta":-20}],
		"snapshots":[
			{"match_id":"20000000-0000-0000-0000-000000000001","player_id":"40000000-0000-0000-0000-000000000001","elo":1520,"matches_played":1,"wins":1,"losses":0,"draws":0,"sets_won":3,"sets_lost":1},
			{"match_id":"20000000-0000-0000-0000-000000000001","player_id":"40000000-0000-0000-0000-000000000002","elo":1480,"matches_played":1,"wins":0,"losses":1,"draws":0,"sets_won":1,"sets_lost":3}
		]
	}'::jsonb,
	'{"success":true}'::jsonb,
	true
);

DO $$
BEGIN
	IF (SELECT elo FROM player_ratings WHERE player_id='40000000-0000-0000-0000-000000000001') <> 1520 THEN RAISE EXCEPTION 'winner rating missing'; END IF;
	IF (SELECT status FROM session_matches WHERE id='20000000-0000-0000-0000-000000000001') <> 'completed' THEN RAISE EXCEPTION 'match not completed'; END IF;
	IF (SELECT count(*) FROM match_elo_history) <> 1 OR (SELECT count(*) FROM elo_snapshots) <> 2 THEN RAISE EXCEPTION 'audit rows missing'; END IF;
	IF (SELECT status FROM elo_round_submissions WHERE id='30000000-0000-0000-0000-000000000001') <> 'completed' THEN RAISE EXCEPTION 'submission not completed'; END IF;
	IF (SELECT status FROM sessions WHERE id='10000000-0000-0000-0000-000000000000') <> 'completed' THEN RAISE EXCEPTION 'session not completed'; END IF;
	IF (SELECT count(*) FROM session_rating_snapshots WHERE session_id='10000000-0000-0000-0000-000000000000') <> 2 THEN RAISE EXCEPTION 'session snapshots missing'; END IF;
END $$;

DO $$
BEGIN
	BEGIN
		PERFORM commit_atomic_elo_round(
			'10000000-0000-0000-0000-000000000000', 2,
			'30000000-0000-0000-0000-000000000002',
			(SELECT claim_token FROM elo_round_submissions WHERE id='30000000-0000-0000-0000-000000000002'),
			'{
				"matches":[{"match_id":"20000000-0000-0000-0000-000000000002","team1_score":3,"team2_score":2}],
				"ratings":[{"kind":"player_singles","entity_id":"40000000-0000-0000-0000-000000000001","expected_exists":true,"expected_elo":1520,"expected_matches_played":1,"after":{"elo":1536,"matches_played":2,"wins":2,"losses":0,"draws":0,"sets_won":6,"sets_lost":3}}],
				"history":[],
				"snapshots":[{"match_id":"99999999-0000-0000-0000-000000000999","player_id":"40000000-0000-0000-0000-000000000001","elo":1536,"matches_played":2,"wins":2,"losses":0,"draws":0,"sets_won":6,"sets_lost":3}]
			}'::jsonb,
			'{"success":true}'::jsonb
		);
		RAISE EXCEPTION 'expected foreign key failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;
	IF (SELECT elo FROM player_ratings WHERE player_id='40000000-0000-0000-0000-000000000001') <> 1520 THEN RAISE EXCEPTION 'rating was not rolled back'; END IF;
	IF (SELECT status FROM session_matches WHERE id='20000000-0000-0000-0000-000000000002') <> 'pending' THEN RAISE EXCEPTION 'match was not rolled back'; END IF;
	IF (SELECT status FROM elo_round_submissions WHERE id='30000000-0000-0000-0000-000000000002') <> 'processing' THEN RAISE EXCEPTION 'ledger was not rolled back'; END IF;
END $$;

SELECT 'atomic ELO SQL integration tests passed' AS result;
