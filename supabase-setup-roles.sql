-- ============================================================================
-- Supabase Role System Setup
-- ============================================================================
-- 
-- This script sets up the default role assignment system for new users.
-- 
-- What it does:
-- 1. Creates a function that sets default role="user" for new users
-- 2. Creates a trigger that runs this function on user creation
-- 
-- Security:
-- - Runs server-side in Supabase (cannot be bypassed by clients)
-- - Ensures all new users default to "user" role
-- - Admin role must be assigned manually via Supabase Dashboard
-- 
-- ============================================================================

-- Step 1: Create function to set default role on user creation
-- This function checks if role is missing and sets it to "user"
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Set default role to "user" if not already set
  IF NEW.raw_user_meta_data->>'role' IS NULL THEN
    NEW.raw_user_meta_data := 
      COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || 
      '{"role": "user"}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create trigger to run function on user creation
-- This trigger runs BEFORE a user is inserted into auth.users
-- It ensures the default role is set server-side
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- Verification
-- ============================================================================
-- 
-- After running this script, verify it worked:
-- 
-- 1. Check if trigger exists:
--    SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
-- 
-- 2. Check if function exists:
--    SELECT * FROM pg_proc WHERE proname = 'handle_new_user';
-- 
-- 3. Create a test user via your app signup
-- 4. Check in Supabase Dashboard → Authentication → Users
-- 5. Verify the user has user_metadata.role = "user"
-- 
-- ============================================================================

