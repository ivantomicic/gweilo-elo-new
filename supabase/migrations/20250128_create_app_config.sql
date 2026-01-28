-- Create app_config table for storing application settings like maintenance mode
-- This table uses a simple key-value pattern for flexibility

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_config_key ON app_config(key);

-- Enable RLS
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read config (needed for maintenance check)
CREATE POLICY "Anyone can read app_config"
    ON app_config
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- Policy: Only admins can update config (enforced via API, this is a safety net)
-- Note: Admin check is done in API route since role is in user_metadata
CREATE POLICY "Service role can update app_config"
    ON app_config
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Insert default maintenance mode setting (disabled by default)
INSERT INTO app_config (key, value)
VALUES ('maintenance_mode', '{"enabled": false, "message": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_app_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on changes
DROP TRIGGER IF EXISTS app_config_updated_at ON app_config;
CREATE TRIGGER app_config_updated_at
    BEFORE UPDATE ON app_config
    FOR EACH ROW
    EXECUTE FUNCTION update_app_config_updated_at();
