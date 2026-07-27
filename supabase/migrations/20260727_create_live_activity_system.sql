-- ActivityKit token registry and per-user preference.
-- Push-to-start tokens create an activity while update tokens address one
-- existing session activity. Tokens are different from regular APNs tokens.

ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS live_activities_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.live_activity_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    token_type TEXT NOT NULL,
    activity_type TEXT NOT NULL DEFAULT 'session',
    activity_id TEXT,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    environment TEXT NOT NULL,
    bundle_id TEXT NOT NULL,
    device_identifier TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT live_activity_tokens_token_not_empty
        CHECK (char_length(trim(token)) > 0),
    CONSTRAINT live_activity_tokens_type_supported
        CHECK (token_type IN ('push_to_start', 'update')),
    CONSTRAINT live_activity_tokens_activity_supported
        CHECK (activity_type IN ('session')),
    CONSTRAINT live_activity_tokens_environment_supported
        CHECK (environment IN ('development', 'production')),
    CONSTRAINT live_activity_tokens_token_environment_bundle_unique
        UNIQUE (token, environment, bundle_id)
);

CREATE TABLE IF NOT EXISTS public.live_activity_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_id UUID NOT NULL REFERENCES public.live_activity_tokens(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    status TEXT NOT NULL,
    apns_id TEXT,
    apns_status INTEGER,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT live_activity_deliveries_event_supported
        CHECK (event IN ('start', 'update', 'end')),
    CONSTRAINT live_activity_deliveries_status_supported
        CHECK (status IN ('sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS live_activity_tokens_user_type_idx
    ON public.live_activity_tokens(user_id, token_type);
CREATE INDEX IF NOT EXISTS live_activity_tokens_session_idx
    ON public.live_activity_tokens(session_id)
    WHERE enabled = TRUE AND invalidated_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS live_activity_tokens_update_activity_unique
    ON public.live_activity_tokens(user_id, device_identifier, activity_id)
    WHERE token_type = 'update' AND activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS live_activity_deliveries_session_idx
    ON public.live_activity_deliveries(session_id, created_at DESC);

ALTER TABLE public.live_activity_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_activity_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_activity_tokens_select_own"
    ON public.live_activity_tokens;
CREATE POLICY "live_activity_tokens_select_own"
    ON public.live_activity_tokens FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "live_activity_tokens_insert_own"
    ON public.live_activity_tokens;
CREATE POLICY "live_activity_tokens_insert_own"
    ON public.live_activity_tokens FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "live_activity_tokens_update_own"
    ON public.live_activity_tokens;
CREATE POLICY "live_activity_tokens_update_own"
    ON public.live_activity_tokens FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "live_activity_tokens_delete_own"
    ON public.live_activity_tokens;
CREATE POLICY "live_activity_tokens_delete_own"
    ON public.live_activity_tokens FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Delivery audit rows are server-only, like normal notification deliveries.
