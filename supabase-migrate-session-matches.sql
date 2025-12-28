-- ============================================================================
-- Migration: Update session_matches table structure
-- ============================================================================
-- 
-- This script migrates session_matches from the old schema (with round_id)
-- to the new schema (with session_id and round_number directly).
-- 
-- Run this if you're getting "column session_matches.session_id does not exist"
-- 
-- ============================================================================

-- Step 1: Check if table exists with old schema (round_id column)
-- If round_id exists, we need to migrate data

DO $$
BEGIN
    -- Check if round_id column exists (old schema)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'session_matches' 
        AND column_name = 'round_id'
    ) THEN
        -- Old schema exists - need to migrate
        
        -- Step 1a: Add new columns
        ALTER TABLE public.session_matches
        ADD COLUMN IF NOT EXISTS session_id UUID,
        ADD COLUMN IF NOT EXISTS round_number INTEGER;

        -- Step 1b: Populate session_id and round_number from session_rounds
        UPDATE public.session_matches sm
        SET 
            session_id = sr.session_id,
            round_number = sr.round_number
        FROM public.session_rounds sr
        WHERE sm.round_id = sr.id;

        -- Step 1c: Make columns NOT NULL after data migration
        ALTER TABLE public.session_matches
        ALTER COLUMN session_id SET NOT NULL,
        ALTER COLUMN round_number SET NOT NULL;

        -- Step 1d: Add foreign key constraint
        ALTER TABLE public.session_matches
        ADD CONSTRAINT session_matches_session_id_fkey 
        FOREIGN KEY (session_id) 
        REFERENCES public.sessions(id) 
        ON DELETE CASCADE;

        -- Step 1e: Add unique constraint
        ALTER TABLE public.session_matches
        ADD CONSTRAINT session_matches_session_round_order_unique 
        UNIQUE (session_id, round_number, match_order);

        -- Step 1f: Drop old foreign key and column
        ALTER TABLE public.session_matches
        DROP CONSTRAINT IF EXISTS session_matches_round_id_fkey,
        DROP COLUMN IF EXISTS round_id;

        -- Step 1g: Drop old indexes if they exist
        DROP INDEX IF EXISTS idx_session_matches_round_id;

        -- Step 1h: Create new indexes
        CREATE INDEX IF NOT EXISTS idx_session_matches_session_id 
        ON public.session_matches(session_id);
        
        CREATE INDEX IF NOT EXISTS idx_session_matches_round_number 
        ON public.session_matches(session_id, round_number);

        RAISE NOTICE 'Migrated session_matches from old schema (round_id) to new schema (session_id, round_number)';
        
    ELSIF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'session_matches' 
        AND column_name = 'session_id'
    ) THEN
        -- Table doesn't have session_id - might be missing entirely or completely different
        -- Check if table exists at all
        IF EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'session_matches'
        ) THEN
            RAISE EXCEPTION 'session_matches table exists but has unexpected schema. Please check table structure.';
        ELSE
            RAISE NOTICE 'session_matches table does not exist. Please run supabase-setup-sessions.sql first.';
        END IF;
    ELSE
        RAISE NOTICE 'session_matches table already has correct schema (session_id exists). No migration needed.';
    END IF;
END $$;

