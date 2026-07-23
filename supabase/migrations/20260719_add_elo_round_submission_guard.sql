-- A single row represents one attempt to settle a round. The unique key is
-- the database-level idempotency guard: a retry cannot create another rating
-- application for the same session and round.
CREATE TABLE IF NOT EXISTS public.elo_round_submissions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	claim_token UUID NOT NULL DEFAULT gen_random_uuid(),
	session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
	round_number INTEGER NOT NULL CHECK (round_number > 0),
	status TEXT NOT NULL DEFAULT 'processing'
		CHECK (status IN ('processing', 'completed', 'failed')),
	response JSONB,
	error_message TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	completed_at TIMESTAMPTZ,
	CONSTRAINT elo_round_submissions_session_round_key UNIQUE (session_id, round_number)
);

CREATE INDEX IF NOT EXISTS elo_round_submissions_processing_idx
	ON public.elo_round_submissions (updated_at)
	WHERE status = 'processing';

-- The application uses the service-role client for this table. Keep it out of
-- normal client access; a participant must never be able to mark a rating
-- submission complete themselves.
ALTER TABLE public.elo_round_submissions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.elo_round_submissions TO service_role;
