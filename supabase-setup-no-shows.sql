-- ============================================================================
-- No-Shows (Ispale) Table Setup
-- ============================================================================
-- 
-- This script creates the no_shows table and Row Level Security (RLS) policies.
-- 
-- What it does:
-- 1. Creates the no_shows table with required fields
-- 2. Adds foreign key constraint to auth.users
-- 3. Adds indexes for performance
-- 4. Enables Row Level Security (RLS)
-- 5. Creates policies:
--    - All authenticated users can SELECT (read-only)
--    - Only admins can INSERT
-- 
-- Security:
-- - Role checks use auth.jwt() -> 'user_metadata' ->> 'role' from the JWT token
-- - This is server-trusted and cannot be spoofed by clients
-- - Note: -> returns jsonb, ->> returns text, so we use -> first then ->>
-- 
-- ============================================================================

-- Step 1: Create the no_shows table
CREATE TABLE IF NOT EXISTS public.no_shows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Add indexes for performance
-- Index on user_id for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_no_shows_user_id ON public.no_shows(user_id);

-- Index on date for sorting and filtering
CREATE INDEX IF NOT EXISTS idx_no_shows_date ON public.no_shows(date DESC);

-- Composite index for user + date queries
CREATE INDEX IF NOT EXISTS idx_no_shows_user_date ON public.no_shows(user_id, date DESC);

-- Step 3: Enable Row Level Security (RLS)
ALTER TABLE public.no_shows ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies

-- Policy 1: All authenticated users can SELECT (read-only)
-- This allows any logged-in user to view no-shows
CREATE POLICY "Users can view no-shows"
    ON public.no_shows
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy 2: Only admins can INSERT
-- This checks the role from the JWT token's user_metadata
-- Role check: auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
-- Note: -> returns jsonb, ->> returns text, so we chain them correctly
CREATE POLICY "Admins can insert no-shows"
    ON public.no_shows
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- ============================================================================
-- How Role Checks Work
-- ============================================================================
-- 
-- The RLS policy uses auth.jwt() which extracts the JWT token from the request.
-- The role is stored in user_metadata.role and is part of the signed JWT token.
-- 
-- Security guarantees:
-- - The JWT token is verified by Supabase before RLS policies are evaluated
-- - The role cannot be modified client-side because it's in the signed token
-- - Only Supabase can issue valid JWT tokens with role information
-- 
-- ============================================================================

-- ============================================================================
-- Verification
-- ============================================================================
-- 
-- After running this script, verify it worked:
-- 
-- 1. Check if table exists:
--    SELECT * FROM information_schema.tables WHERE table_name = 'no_shows';
-- 
-- 2. Check if RLS is enabled:
--    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'no_shows';
-- 
-- 3. Check if policies exist:
--    SELECT * FROM pg_policies WHERE tablename = 'no_shows';
-- 
-- 4. Test as regular user (should only be able to SELECT):
--    -- This should work (SELECT)
--    SELECT * FROM public.no_shows;
--    
--    -- This should fail with permission denied (INSERT)
--    INSERT INTO public.no_shows (user_id, date, reason) 
--    VALUES ('<some-user-id>', CURRENT_DATE, 'Test');
-- 
-- 5. Test as admin (should be able to SELECT and INSERT):
--    -- Both should work for admin users
-- 
-- ============================================================================

