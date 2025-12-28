-- ============================================================================
-- Simple Fix: Add session_id column if missing
-- ============================================================================
-- 
-- Quick fix if session_matches table exists but session_id column is missing
-- This assumes the table was created with an old/incomplete schema
-- 
-- ============================================================================

-- Add session_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'session_matches' 
        AND column_name = 'session_id'
    ) THEN
        -- Add session_id column
        ALTER TABLE public.session_matches
        ADD COLUMN session_id UUID;

        -- If round_id exists, populate session_id from it
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'session_matches' 
            AND column_name = 'round_id'
        ) THEN
            -- Populate from session_rounds
            UPDATE public.session_matches sm
            SET session_id = sr.session_id
            FROM public.session_rounds sr
            WHERE sm.round_id = sr.id;
        END IF;

        -- Make it NOT NULL and add constraint
        ALTER TABLE public.session_matches
        ALTER COLUMN session_id SET NOT NULL,
        ADD CONSTRAINT session_matches_session_id_fkey 
        FOREIGN KEY (session_id) 
        REFERENCES public.sessions(id) 
        ON DELETE CASCADE;

        -- Add index
        CREATE INDEX IF NOT EXISTS idx_session_matches_session_id 
        ON public.session_matches(session_id);

        RAISE NOTICE 'Added session_id column to session_matches';
    ELSE
        RAISE NOTICE 'session_id column already exists';
    END IF;
END $$;

