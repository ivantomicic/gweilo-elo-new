-- A completed submission doubles as a durable outbox for work that must not
-- keep the score-saving request open (notifications, Live Activities, metadata).
ALTER TABLE public.elo_round_submissions
	ADD COLUMN IF NOT EXISTS effects_status text,
	ADD COLUMN IF NOT EXISTS effects_payload jsonb,
	ADD COLUMN IF NOT EXISTS effects_claim_token uuid,
	ADD COLUMN IF NOT EXISTS effects_claimed_at timestamptz,
	ADD COLUMN IF NOT EXISTS effects_next_attempt_at timestamptz,
	ADD COLUMN IF NOT EXISTS effects_attempt_count integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS effects_error text;

ALTER TABLE public.elo_round_submissions
	ADD CONSTRAINT elo_round_submissions_effects_status_check
	CHECK (effects_status IS NULL OR effects_status IN ('pending', 'processing', 'done'));

CREATE INDEX IF NOT EXISTS elo_round_submissions_effects_pending_idx
	ON public.elo_round_submissions (effects_next_attempt_at, created_at)
	WHERE status = 'completed' AND effects_status = 'pending';

-- Calling the existing settlement function from this wrapper keeps the score,
-- next-round schedule, submission receipt, and outbox entry in one transaction.
-- An error in any future-match update rolls back the entire settlement.
CREATE OR REPLACE FUNCTION public.commit_atomic_elo_round_with_effects(
	p_session_id uuid,
	p_round_number integer,
	p_submission_id uuid,
	p_claim_token uuid,
	p_plan jsonb,
	p_response jsonb,
	p_complete_session boolean,
	p_effects_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_item jsonb;
	v_response jsonb;
	v_updated_count integer;
BEGIN
	IF jsonb_typeof(COALESCE(p_plan->'future_matches', '[]'::jsonb)) <> 'array'
		OR jsonb_typeof(p_effects_payload) <> 'object' THEN
		RAISE EXCEPTION 'INVALID_ROUND_EFFECTS_PLAN';
	END IF;

	IF jsonb_array_length(COALESCE(p_plan->'future_matches', '[]'::jsonb)) > 0
		AND p_round_number <> 5 THEN
		RAISE EXCEPTION 'FUTURE_MATCHES_ONLY_ALLOWED_AFTER_ROUND_FIVE';
	END IF;
	IF jsonb_array_length(COALESCE(p_plan->'future_matches', '[]'::jsonb)) NOT IN (0, 4) THEN
		RAISE EXCEPTION 'INVALID_FUTURE_MATCH_COUNT';
	END IF;

	v_response := public.commit_atomic_elo_round(
		p_session_id, p_round_number, p_submission_id, p_claim_token,
		p_plan, p_response, p_complete_session
	);

	FOR v_item IN
		SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'future_matches', '[]'::jsonb))
	LOOP
		IF (v_item->>'round_number')::integer NOT IN (6, 7)
			OR jsonb_typeof(v_item->'player_ids') <> 'array'
			OR jsonb_array_length(v_item->'player_ids') NOT IN (2, 4)
			OR jsonb_typeof(v_item->'is_rated') <> 'boolean' THEN
			RAISE EXCEPTION 'INVALID_FUTURE_MATCH_PLAN';
		END IF;

		UPDATE public.session_matches SET
			player_ids = v_item->'player_ids',
			team_1_id = NULLIF(v_item->>'team_1_id', '')::uuid,
			team_2_id = NULLIF(v_item->>'team_2_id', '')::uuid,
			is_rated = (v_item->>'is_rated')::boolean
		WHERE id = (v_item->>'match_id')::uuid
			AND session_id = p_session_id
			AND round_number = (v_item->>'round_number')::integer
			AND ((match_type = 'singles' AND jsonb_array_length(v_item->'player_ids') = 2)
				OR (match_type = 'doubles' AND jsonb_array_length(v_item->'player_ids') = 4))
			AND status = 'pending';
		GET DIAGNOSTICS v_updated_count = ROW_COUNT;
		IF v_updated_count <> 1 THEN
			RAISE EXCEPTION 'FUTURE_MATCH_STATE_CONFLICT %', v_item->>'match_id';
		END IF;
	END LOOP;

	UPDATE public.elo_round_submissions SET
		effects_status = 'pending',
		effects_payload = p_effects_payload,
		effects_next_attempt_at = now(),
		effects_error = NULL
	WHERE id = p_submission_id
		AND claim_token = p_claim_token
		AND status = 'completed';
	IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_EFFECTS_STATE_CONFLICT'; END IF;

	RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_atomic_elo_round_with_effects(
	uuid, integer, uuid, uuid, jsonb, jsonb, boolean, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_atomic_elo_round_with_effects(
	uuid, integer, uuid, uuid, jsonb, jsonb, boolean, jsonb
) TO service_role;

-- Multiple Vercel invocations may overlap. Claim one due row transactionally,
-- and allow a timed-out worker to be reclaimed after five minutes.
CREATE OR REPLACE FUNCTION public.claim_next_round_effects(p_submission_id uuid DEFAULT NULL)
RETURNS TABLE(submission_id uuid, effects_token uuid, payload jsonb, attempt_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
	WITH candidate AS (
		SELECT id
		FROM public.elo_round_submissions
		WHERE status = 'completed'
			AND (p_submission_id IS NULL OR id = p_submission_id)
			AND (
				(effects_status = 'pending' AND effects_next_attempt_at <= now())
				OR (effects_status = 'processing' AND effects_claimed_at < now() - interval '5 minutes')
			)
		ORDER BY created_at
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	), claimed AS (
		UPDATE public.elo_round_submissions ledger SET
			effects_status = 'processing',
			effects_claim_token = gen_random_uuid(),
			effects_claimed_at = now(),
			effects_attempt_count = effects_attempt_count + 1
		FROM candidate
		WHERE ledger.id = candidate.id
		RETURNING ledger.id, ledger.effects_claim_token,
			ledger.effects_payload, ledger.effects_attempt_count
	)
	SELECT id, effects_claim_token, effects_payload, effects_attempt_count FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_next_round_effects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_round_effects(uuid) TO service_role;
