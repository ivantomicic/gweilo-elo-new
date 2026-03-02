-- Add commitment-based weighting for no-shows
--
-- Goal:
-- 1) Keep existing no-show data intact (non-destructive)
-- 2) Track effective-dated weekly commitment per user
-- 3) Snapshot commitment + weight on each no-show entry for auditability

-- ============================================================================
-- COMMITMENTS TABLE (effective-dated history)
-- ============================================================================

CREATE TABLE IF NOT EXISTS no_show_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    days_per_week INTEGER NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT no_show_commitments_days_per_week_check CHECK (days_per_week >= 1 AND days_per_week <= 7),
    CONSTRAINT no_show_commitments_valid_range_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT no_show_commitments_unique_start UNIQUE (user_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_no_show_commitments_user_valid_from
    ON no_show_commitments(user_id, valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_no_show_commitments_user_active
    ON no_show_commitments(user_id, valid_from, valid_to);

-- Keep updated_at current on edits
CREATE OR REPLACE FUNCTION set_no_show_commitments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_show_commitments_updated_at ON no_show_commitments;
CREATE TRIGGER trg_no_show_commitments_updated_at
    BEFORE UPDATE ON no_show_commitments
    FOR EACH ROW
    EXECUTE FUNCTION set_no_show_commitments_updated_at();

-- RLS
ALTER TABLE no_show_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_show_commitments_read_authenticated" ON no_show_commitments;
CREATE POLICY "no_show_commitments_read_authenticated"
    ON no_show_commitments
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "no_show_commitments_insert_admin_only" ON no_show_commitments;
CREATE POLICY "no_show_commitments_insert_admin_only"
    ON no_show_commitments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role',
            'user'
        ) = 'admin'
    );

DROP POLICY IF EXISTS "no_show_commitments_update_admin_only" ON no_show_commitments;
CREATE POLICY "no_show_commitments_update_admin_only"
    ON no_show_commitments
    FOR UPDATE
    TO authenticated
    USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role',
            'user'
        ) = 'admin'
    )
    WITH CHECK (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role',
            'user'
        ) = 'admin'
    );

DROP POLICY IF EXISTS "no_show_commitments_delete_admin_only" ON no_show_commitments;
CREATE POLICY "no_show_commitments_delete_admin_only"
    ON no_show_commitments
    FOR DELETE
    TO authenticated
    USING (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'role',
            auth.jwt() -> 'app_metadata' ->> 'role',
            'user'
        ) = 'admin'
    );

-- ============================================================================
-- NO_SHOWS SNAPSHOT COLUMNS
-- ============================================================================

ALTER TABLE no_shows
    ADD COLUMN IF NOT EXISTS days_per_week_at_time INTEGER;

ALTER TABLE no_shows
    ADD COLUMN IF NOT EXISTS weight_applied NUMERIC(8,4);

-- Backfill existing rows safely:
-- - Use active commitment if one exists for that date
-- - Otherwise default to 1 day/week and weight 1.0
UPDATE no_shows ns
SET
    days_per_week_at_time = COALESCE(
        (
            SELECT c.days_per_week
            FROM no_show_commitments c
            WHERE c.user_id = ns.user_id
              AND c.valid_from <= ns.date::date
              AND (c.valid_to IS NULL OR c.valid_to >= ns.date::date)
            ORDER BY c.valid_from DESC
            LIMIT 1
        ),
        ns.days_per_week_at_time,
        1
    ),
    weight_applied = COALESCE(
        ROUND(
            1.0 / NULLIF(
                COALESCE(
                    (
                        SELECT c.days_per_week
                        FROM no_show_commitments c
                        WHERE c.user_id = ns.user_id
                          AND c.valid_from <= ns.date::date
                          AND (c.valid_to IS NULL OR c.valid_to >= ns.date::date)
                        ORDER BY c.valid_from DESC
                        LIMIT 1
                    ),
                    ns.days_per_week_at_time,
                    1
                ),
                0
            )::NUMERIC,
            4
        ),
        ns.weight_applied,
        1.0
    )
WHERE ns.days_per_week_at_time IS NULL
   OR ns.weight_applied IS NULL;

ALTER TABLE no_shows
    ALTER COLUMN days_per_week_at_time SET DEFAULT 1,
    ALTER COLUMN days_per_week_at_time SET NOT NULL,
    ALTER COLUMN weight_applied SET DEFAULT 1.0,
    ALTER COLUMN weight_applied SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'no_shows_days_per_week_at_time_check'
    ) THEN
        ALTER TABLE no_shows
            ADD CONSTRAINT no_shows_days_per_week_at_time_check
            CHECK (days_per_week_at_time >= 1 AND days_per_week_at_time <= 7);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'no_shows_weight_applied_check'
    ) THEN
        ALTER TABLE no_shows
            ADD CONSTRAINT no_shows_weight_applied_check
            CHECK (weight_applied > 0);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_no_shows_user_date
    ON no_shows(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_no_shows_weight_applied
    ON no_shows(weight_applied);

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_no_show_days_per_week(target_user_id UUID, target_date DATE)
RETURNS INTEGER AS $$
DECLARE
    resolved_days INTEGER;
BEGIN
    SELECT c.days_per_week
    INTO resolved_days
    FROM no_show_commitments c
    WHERE c.user_id = target_user_id
      AND c.valid_from <= target_date
      AND (c.valid_to IS NULL OR c.valid_to >= target_date)
    ORDER BY c.valid_from DESC
    LIMIT 1;

    RETURN COALESCE(resolved_days, 1);
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_no_show_days_per_week(UUID, DATE) TO authenticated;
