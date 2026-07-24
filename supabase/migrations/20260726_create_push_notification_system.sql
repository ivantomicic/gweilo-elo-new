-- Push notification foundation
--
-- Notifications are created by the backend, regardless of whether the action
-- originated on the web or iOS. The backend resolves audiences, applies each
-- user's preferences, and records one delivery per registered device.

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sessions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    rounds_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    results_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    polls_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    announcements_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'ios',
    environment TEXT NOT NULL,
    bundle_id TEXT NOT NULL,
    app_version TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_devices_token_not_empty
        CHECK (char_length(trim(token)) > 0),
    CONSTRAINT notification_devices_platform_supported
        CHECK (platform IN ('ios')),
    CONSTRAINT notification_devices_environment_supported
        CHECK (environment IN ('development', 'production')),
    CONSTRAINT notification_devices_token_environment_bundle_unique
        UNIQUE (token, environment, bundle_id)
);

CREATE TABLE IF NOT EXISTS notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    audience_type TEXT NOT NULL,
    audience JSONB NOT NULL DEFAULT '{}'::JSONB,
    data JSONB NOT NULL DEFAULT '{}'::JSONB,
    dedupe_key TEXT UNIQUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    recipient_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at TIMESTAMPTZ,
    CONSTRAINT notification_events_category_supported
        CHECK (
            category IN (
                'sessions',
                'rounds',
                'results',
                'polls',
                'announcements'
            )
        ),
    CONSTRAINT notification_events_audience_supported
        CHECK (audience_type IN ('all', 'session', 'users')),
    CONSTRAINT notification_events_status_supported
        CHECK (
            status IN (
                'pending',
                'processing',
                'sent',
                'partial',
                'failed',
                'no_recipients',
                'configuration_required'
            )
        )
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES notification_devices(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    apns_id TEXT,
    apns_status INTEGER,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    CONSTRAINT notification_deliveries_status_supported
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    CONSTRAINT notification_deliveries_event_device_unique
        UNIQUE (event_id, device_id)
);

CREATE INDEX IF NOT EXISTS notification_devices_user_id_idx
    ON notification_devices(user_id);
CREATE INDEX IF NOT EXISTS notification_devices_active_idx
    ON notification_devices(user_id, environment)
    WHERE enabled = TRUE AND invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS notification_events_created_at_idx
    ON notification_events(created_at DESC);
CREATE INDEX IF NOT EXISTS notification_events_status_idx
    ON notification_events(status, created_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_event_id_idx
    ON notification_deliveries(event_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_user_id_idx
    ON notification_deliveries(user_id, created_at DESC);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select_own"
    ON notification_preferences;
CREATE POLICY "notification_preferences_select_own"
    ON notification_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences_insert_own"
    ON notification_preferences;
CREATE POLICY "notification_preferences_insert_own"
    ON notification_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences_update_own"
    ON notification_preferences;
CREATE POLICY "notification_preferences_update_own"
    ON notification_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_devices_select_own"
    ON notification_devices;
CREATE POLICY "notification_devices_select_own"
    ON notification_devices
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_devices_insert_own"
    ON notification_devices;
CREATE POLICY "notification_devices_insert_own"
    ON notification_devices
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_devices_update_own"
    ON notification_devices;
CREATE POLICY "notification_devices_update_own"
    ON notification_devices
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_devices_delete_own"
    ON notification_devices;
CREATE POLICY "notification_devices_delete_own"
    ON notification_devices
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Events and deliveries intentionally have no client policies. They contain
-- cross-user delivery metadata and are accessed only by server-side service
-- role code.

