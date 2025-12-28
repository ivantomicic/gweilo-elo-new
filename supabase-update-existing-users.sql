-- ============================================================================
-- Update Existing Users with Default Role
-- ============================================================================
-- 
-- This script updates all existing users who don't have a role set.
-- It sets their role to "user" (the default).
-- 
-- IMPORTANT: Run this AFTER running supabase-setup-roles.sql
-- 
-- ============================================================================

-- Update all users who don't have a role set
UPDATE auth.users
SET raw_user_meta_data = 
  COALESCE(raw_user_meta_data, '{}'::jsonb) || 
  '{"role": "user"}'::jsonb
WHERE raw_user_meta_data->>'role' IS NULL;

-- ============================================================================
-- Verify the Update
-- ============================================================================
-- 
-- Check how many users were updated:
-- SELECT COUNT(*) FROM auth.users WHERE raw_user_meta_data->>'role' = 'user';
-- 
-- Check users without role (should be 0 after running this):
-- SELECT COUNT(*) FROM auth.users WHERE raw_user_meta_data->>'role' IS NULL;
-- 
-- ============================================================================

