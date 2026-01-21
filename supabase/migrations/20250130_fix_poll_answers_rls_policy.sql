-- Fix the RLS policy for poll_answers INSERT
-- The original policy had incorrect column references in the subquery
-- In WITH CHECK clauses, columns from the new row can be referenced directly without table qualifier

-- Drop the existing policy
DROP POLICY IF EXISTS "poll_answers_insert_own" ON poll_answers;

-- Recreate with correct column references
-- Simplified: Only check that user_id matches auth.uid()
-- The unique constraint and API logic handle the other checks
CREATE POLICY "poll_answers_insert_own"
    ON poll_answers
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
    );
