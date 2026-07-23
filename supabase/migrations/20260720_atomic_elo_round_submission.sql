-- Commits a pre-calculated round plan as one PostgreSQL transaction.
-- Any validation or write failure aborts the function and rolls back every
-- rating, score, history, snapshot, and submission-ledger change.
ALTER TABLE public.elo_round_submissions
	ADD COLUMN IF NOT EXISTS claim_token UUID DEFAULT gen_random_uuid();
UPDATE public.elo_round_submissions SET claim_token=gen_random_uuid() WHERE claim_token IS NULL;
ALTER TABLE public.elo_round_submissions ALTER COLUMN claim_token SET NOT NULL;

CREATE OR REPLACE FUNCTION public.commit_atomic_elo_round(
	p_session_id UUID,
	p_round_number INTEGER,
	p_submission_id UUID,
	p_claim_token UUID,
	p_plan JSONB,
	p_response JSONB,
	p_complete_session BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_item JSONB;
	v_kind TEXT;
	v_entity_id UUID;
	v_exists BOOLEAN;
	v_current_elo NUMERIC;
	v_current_matches INTEGER;
	v_expected_exists BOOLEAN;
	v_planned_match_count INTEGER;
	v_pending_match_count INTEGER;
BEGIN
	IF p_round_number < 1 OR jsonb_typeof(p_plan) <> 'object' THEN
		RAISE EXCEPTION 'INVALID_ATOMIC_ELO_PLAN';
	END IF;

	-- Serialize every ELO settlement. Planning happens before this call, so the
	-- expected-state checks below reject a stale plan instead of overwriting it.
	PERFORM pg_advisory_xact_lock(hashtextextended('gweilo:elo:settlement', 0));

	PERFORM 1
	FROM public.elo_round_submissions
	WHERE id = p_submission_id
		AND session_id = p_session_id
		AND round_number = p_round_number
		AND claim_token = p_claim_token
		AND status = 'processing'
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ELO_SUBMISSION_NOT_CLAIMED';
	END IF;

	v_planned_match_count := jsonb_array_length(COALESCE(p_plan->'matches', '[]'::jsonb));
	PERFORM 1
	FROM public.session_matches
	WHERE session_id = p_session_id
		AND round_number = p_round_number
	FOR UPDATE;
	SELECT count(*) INTO v_pending_match_count
	FROM public.session_matches
	WHERE session_id = p_session_id
		AND round_number = p_round_number
		AND status = 'pending';
	IF v_planned_match_count = 0 OR v_pending_match_count <> v_planned_match_count THEN
		RAISE EXCEPTION 'ROUND_STATE_CONFLICT expected %, found % pending',
			v_planned_match_count, v_pending_match_count;
	END IF;

	-- Validate all rating starting points while holding the global settlement
	-- lock. Missing rows are a meaningful starting state (1500, zero matches).
	FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'ratings', '[]'::jsonb))
	LOOP
		v_kind := v_item->>'kind';
		v_entity_id := (v_item->>'entity_id')::uuid;
		v_expected_exists := (v_item->>'expected_exists')::boolean;
		v_exists := false;
		v_current_elo := NULL;
		v_current_matches := NULL;

		IF v_kind = 'player_singles' THEN
			SELECT elo, matches_played INTO v_current_elo, v_current_matches
			FROM public.player_ratings WHERE player_id = v_entity_id FOR UPDATE;
			v_exists := FOUND;
		ELSIF v_kind = 'player_doubles' THEN
			SELECT elo, matches_played INTO v_current_elo, v_current_matches
			FROM public.player_double_ratings WHERE player_id = v_entity_id FOR UPDATE;
			v_exists := FOUND;
		ELSIF v_kind = 'double_team' THEN
			SELECT elo, matches_played INTO v_current_elo, v_current_matches
			FROM public.double_team_ratings WHERE team_id = v_entity_id FOR UPDATE;
			v_exists := FOUND;
		ELSE
			RAISE EXCEPTION 'UNKNOWN_RATING_KIND %', v_kind;
		END IF;

		IF v_exists IS DISTINCT FROM v_expected_exists OR
			(v_exists AND (
				v_current_elo IS DISTINCT FROM (v_item->>'expected_elo')::numeric OR
				v_current_matches IS DISTINCT FROM (v_item->>'expected_matches_played')::integer
			)) THEN
			RAISE EXCEPTION 'ELO_STATE_CONFLICT % %', v_kind, v_entity_id;
		END IF;
	END LOOP;

	-- Persist absolute final states. Validation above guarantees that these are
	-- based on the exact state currently in the database.
	FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'ratings', '[]'::jsonb))
	LOOP
		v_kind := v_item->>'kind';
		v_entity_id := (v_item->>'entity_id')::uuid;
		IF v_kind = 'player_singles' THEN
			INSERT INTO public.player_ratings
				(player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, updated_at)
			VALUES (v_entity_id, (v_item#>>'{after,elo}')::numeric,
				(v_item#>>'{after,matches_played}')::integer, (v_item#>>'{after,wins}')::integer,
				(v_item#>>'{after,losses}')::integer, (v_item#>>'{after,draws}')::integer,
				(v_item#>>'{after,sets_won}')::integer, (v_item#>>'{after,sets_lost}')::integer, now())
			ON CONFLICT (player_id) DO UPDATE SET
				elo = EXCLUDED.elo, matches_played = EXCLUDED.matches_played,
				wins = EXCLUDED.wins, losses = EXCLUDED.losses, draws = EXCLUDED.draws,
				sets_won = EXCLUDED.sets_won, sets_lost = EXCLUDED.sets_lost, updated_at = now();
		ELSIF v_kind = 'player_doubles' THEN
			INSERT INTO public.player_double_ratings
				(player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, updated_at)
			VALUES (v_entity_id, (v_item#>>'{after,elo}')::numeric,
				(v_item#>>'{after,matches_played}')::integer, (v_item#>>'{after,wins}')::integer,
				(v_item#>>'{after,losses}')::integer, (v_item#>>'{after,draws}')::integer,
				(v_item#>>'{after,sets_won}')::integer, (v_item#>>'{after,sets_lost}')::integer, now())
			ON CONFLICT (player_id) DO UPDATE SET
				elo = EXCLUDED.elo, matches_played = EXCLUDED.matches_played,
				wins = EXCLUDED.wins, losses = EXCLUDED.losses, draws = EXCLUDED.draws,
				sets_won = EXCLUDED.sets_won, sets_lost = EXCLUDED.sets_lost, updated_at = now();
		ELSE
			INSERT INTO public.double_team_ratings
				(team_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, updated_at)
			VALUES (v_entity_id, (v_item#>>'{after,elo}')::numeric,
				(v_item#>>'{after,matches_played}')::integer, (v_item#>>'{after,wins}')::integer,
				(v_item#>>'{after,losses}')::integer, (v_item#>>'{after,draws}')::integer,
				(v_item#>>'{after,sets_won}')::integer, (v_item#>>'{after,sets_lost}')::integer, now())
			ON CONFLICT (team_id) DO UPDATE SET
				elo = EXCLUDED.elo, matches_played = EXCLUDED.matches_played,
				wins = EXCLUDED.wins, losses = EXCLUDED.losses, draws = EXCLUDED.draws,
				sets_won = EXCLUDED.sets_won, sets_lost = EXCLUDED.sets_lost, updated_at = now();
		END IF;
	END LOOP;

	FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'history', '[]'::jsonb))
	LOOP
		INSERT INTO public.match_elo_history (
			match_id, player1_id, player2_id, player1_elo_before, player1_elo_after,
			player1_elo_delta, player2_elo_before, player2_elo_after, player2_elo_delta,
			team1_id, team2_id, team1_elo_before, team1_elo_after, team1_elo_delta,
			team2_elo_before, team2_elo_after, team2_elo_delta
		) VALUES (
			(v_item->>'match_id')::uuid, (v_item->>'player1_id')::uuid, (v_item->>'player2_id')::uuid,
			(v_item->>'player1_elo_before')::numeric, (v_item->>'player1_elo_after')::numeric,
			(v_item->>'player1_elo_delta')::numeric, (v_item->>'player2_elo_before')::numeric,
			(v_item->>'player2_elo_after')::numeric, (v_item->>'player2_elo_delta')::numeric,
			(v_item->>'team1_id')::uuid, (v_item->>'team2_id')::uuid,
			(v_item->>'team1_elo_before')::numeric, (v_item->>'team1_elo_after')::numeric,
			(v_item->>'team1_elo_delta')::numeric, (v_item->>'team2_elo_before')::numeric,
			(v_item->>'team2_elo_after')::numeric, (v_item->>'team2_elo_delta')::numeric
		);
	END LOOP;

	FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'snapshots', '[]'::jsonb))
	LOOP
		INSERT INTO public.elo_snapshots
			(match_id, player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost)
		VALUES ((v_item->>'match_id')::uuid, (v_item->>'player_id')::uuid,
			(v_item->>'elo')::numeric, (v_item->>'matches_played')::integer,
			(v_item->>'wins')::integer, (v_item->>'losses')::integer,
			(v_item->>'draws')::integer, (v_item->>'sets_won')::integer,
			(v_item->>'sets_lost')::integer);
	END LOOP;

	FOR v_item IN SELECT value FROM jsonb_array_elements(p_plan->'matches')
	LOOP
		UPDATE public.session_matches SET
			team1_score = (v_item->>'team1_score')::integer,
			team2_score = (v_item->>'team2_score')::integer,
			status = 'completed'
		WHERE id = (v_item->>'match_id')::uuid
			AND session_id = p_session_id
			AND round_number = p_round_number
			AND status = 'pending';
		IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_STATE_CONFLICT %', v_item->>'match_id'; END IF;
	END LOOP;

	IF p_complete_session THEN
		INSERT INTO public.session_rating_snapshots
			(session_id, entity_type, entity_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, created_at)
		SELECT p_session_id, 'player_singles', player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, now()
		FROM public.player_ratings
		ON CONFLICT (session_id, entity_type, entity_id) DO UPDATE SET
			elo=EXCLUDED.elo, matches_played=EXCLUDED.matches_played, wins=EXCLUDED.wins,
			losses=EXCLUDED.losses, draws=EXCLUDED.draws, sets_won=EXCLUDED.sets_won,
			sets_lost=EXCLUDED.sets_lost, created_at=EXCLUDED.created_at;
		INSERT INTO public.session_rating_snapshots
			(session_id, entity_type, entity_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, created_at)
		SELECT p_session_id, 'player_doubles', player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, now()
		FROM public.player_double_ratings
		ON CONFLICT (session_id, entity_type, entity_id) DO UPDATE SET
			elo=EXCLUDED.elo, matches_played=EXCLUDED.matches_played, wins=EXCLUDED.wins,
			losses=EXCLUDED.losses, draws=EXCLUDED.draws, sets_won=EXCLUDED.sets_won,
			sets_lost=EXCLUDED.sets_lost, created_at=EXCLUDED.created_at;
		INSERT INTO public.session_rating_snapshots
			(session_id, entity_type, entity_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, created_at)
		SELECT p_session_id, 'double_team', team_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost, now()
		FROM public.double_team_ratings
		ON CONFLICT (session_id, entity_type, entity_id) DO UPDATE SET
			elo=EXCLUDED.elo, matches_played=EXCLUDED.matches_played, wins=EXCLUDED.wins,
			losses=EXCLUDED.losses, draws=EXCLUDED.draws, sets_won=EXCLUDED.sets_won,
			sets_lost=EXCLUDED.sets_lost, created_at=EXCLUDED.created_at;

		UPDATE public.sessions SET status='completed', completed_at=now()
		WHERE id=p_session_id AND status='active';
		IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_STATE_CONFLICT'; END IF;
	END IF;

	UPDATE public.elo_round_submissions SET
		status = 'completed', response = p_response, error_message = NULL,
		completed_at = now(), updated_at = now()
	WHERE id = p_submission_id
		AND claim_token = p_claim_token
		AND status = 'processing';
	IF NOT FOUND THEN RAISE EXCEPTION 'ELO_SUBMISSION_STATE_CONFLICT'; END IF;

	RETURN p_response;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_atomic_elo_round(UUID, INTEGER, UUID, UUID, JSONB, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_atomic_elo_round(UUID, INTEGER, UUID, UUID, JSONB, JSONB, BOOLEAN) TO service_role;
