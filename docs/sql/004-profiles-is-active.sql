-- =============================================
-- Script: 004-profiles-is-active.sql
-- Purpose: Add is_active column to profiles table for user account approval
-- Author: System
-- Date: 2026-02-17
-- Description: 
--   - New users will be created with is_active = false
--   - Admin must set is_active = true to allow user login
-- =============================================

-- =============================================
-- 1. ADD is_active COLUMN TO PROFILES
-- =============================================

-- 1.1 Add is_active column (default true for existing users)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 1.2 Set existing users to active (they were already using the system)
UPDATE profiles SET is_active = true WHERE is_active IS NULL;

-- 1.3 Add comment for documentation
COMMENT ON COLUMN profiles.is_active IS 'User account status. New users start with false (pending approval). Admin sets to true to activate.';

-- =============================================
-- 2. VERIFICATION
-- =============================================

-- Check the column was added
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'is_active';

-- View sample data
SELECT id, nama, email, role, is_active 
FROM profiles 
ORDER BY created_at DESC 
LIMIT 10;
