-- Polls System Migration
-- Creates tables for polls, poll options, and poll answers
-- Similar structure to no_shows: admin creates, all users can read/answer

-- ============================================================================
-- TABLES
-- ============================================================================

-- Main polls table
CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    description TEXT, -- Optional description/explanation of the poll
    end_date TIMESTAMP WITH TIME ZONE, -- NULL = no end date (poll stays open)
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT polls_question_not_empty CHECK (char_length(trim(question)) > 0)
);

-- Poll options (answers users can select)
CREATE TABLE IF NOT EXISTS poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0, -- For ordering options
    
    -- Constraints
    CONSTRAINT poll_options_text_not_empty CHECK (char_length(trim(option_text)) > 0),
    CONSTRAINT poll_options_unique_order UNIQUE (poll_id, display_order)
);

-- User answers to polls (one answer per user per poll)
CREATE TABLE IF NOT EXISTS poll_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Enforce one answer per user per poll
    CONSTRAINT poll_answers_one_per_user UNIQUE (poll_id, user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Polls indexes
CREATE INDEX IF NOT EXISTS idx_polls_created_by ON polls(created_by);
CREATE INDEX IF NOT EXISTS idx_polls_created_at ON polls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_polls_end_date ON polls(end_date) WHERE end_date IS NOT NULL;

-- Poll options indexes
CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_display_order ON poll_options(poll_id, display_order);

-- Poll answers indexes
CREATE INDEX IF NOT EXISTS idx_poll_answers_poll_id ON poll_answers(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_answers_user_id ON poll_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_poll_answers_option_id ON poll_answers(option_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_answers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLLS TABLE POLICIES
-- ============================================================================

-- All authenticated users can read polls
CREATE POLICY "polls_read_all_authenticated"
    ON polls
    FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can create polls
CREATE POLICY "polls_insert_admin_only"
    ON polls
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Only admins can update polls (for editing question/end_date)
CREATE POLICY "polls_update_admin_only"
    ON polls
    FOR UPDATE
    TO authenticated
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Only admins can delete polls
CREATE POLICY "polls_delete_admin_only"
    ON polls
    FOR DELETE
    TO authenticated
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- ============================================================================
-- POLL_OPTIONS TABLE POLICIES
-- ============================================================================

-- All authenticated users can read poll options
CREATE POLICY "poll_options_read_all_authenticated"
    ON poll_options
    FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can create poll options
CREATE POLICY "poll_options_insert_admin_only"
    ON poll_options
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Only admins can update poll options
CREATE POLICY "poll_options_update_admin_only"
    ON poll_options
    FOR UPDATE
    TO authenticated
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Only admins can delete poll options
CREATE POLICY "poll_options_delete_admin_only"
    ON poll_options
    FOR DELETE
    TO authenticated
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- ============================================================================
-- POLL_ANSWERS TABLE POLICIES
-- ============================================================================

-- Users can read all poll answers (for seeing results)
CREATE POLICY "poll_answers_read_all_authenticated"
    ON poll_answers
    FOR SELECT
    TO authenticated
    USING (true);

-- Users can insert their own answers (one per poll, enforced by unique constraint)
-- Additional check: poll must not be closed (end_date check)
CREATE POLICY "poll_answers_insert_own"
    ON poll_answers
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND NOT EXISTS (
            -- Check if poll has ended
            SELECT 1 FROM polls
            WHERE polls.id = poll_id
            AND polls.end_date IS NOT NULL
            AND polls.end_date < NOW()
        )
        AND NOT EXISTS (
            -- Check if user already answered this poll (double-check, constraint also enforces)
            SELECT 1 FROM poll_answers existing
            WHERE existing.poll_id = poll_id
            AND existing.user_id = auth.uid()
        )
    );

-- Users cannot update their answers (immutable)
-- No UPDATE policy = no updates allowed

-- Users cannot delete answers (immutable)
-- No DELETE policy = no deletes allowed

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a poll is active (not closed)
-- Returns true if poll has no end_date or end_date is in the future
CREATE OR REPLACE FUNCTION is_poll_active(poll_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM polls
        WHERE id = poll_uuid
        AND (end_date IS NULL OR end_date > NOW())
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if a user has answered a poll
CREATE OR REPLACE FUNCTION has_user_answered_poll(poll_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM poll_answers
        WHERE poll_id = poll_uuid
        AND user_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get poll answer counts (for results)
CREATE OR REPLACE FUNCTION get_poll_results(poll_uuid UUID)
RETURNS TABLE (
    option_id UUID,
    option_text TEXT,
    answer_count BIGINT,
    display_order INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        po.id AS option_id,
        po.option_text,
        COUNT(pa.id) AS answer_count,
        po.display_order
    FROM poll_options po
    LEFT JOIN poll_answers pa ON pa.option_id = po.id
    WHERE po.poll_id = poll_uuid
    GROUP BY po.id, po.option_text, po.display_order
    ORDER BY po.display_order;
END;
$$ LANGUAGE plpgsql STABLE;
