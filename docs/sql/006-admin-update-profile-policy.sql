-- =============================================
-- Script: 006-admin-update-profile-policy.sql
-- Purpose: Fix RLS policy to allow admins (uid_admin, uid_user, up3_admin) to update other profiles
-- Date: 2026-02-17
-- Description:
--   - Creates SECURITY DEFINER function to check if current user is admin
--   - This avoids infinite recursion when checking role from profiles table
--   - Allows admins to approve new users by updating is_active field
-- =============================================

-- =============================================
-- 1. CREATE HELPER FUNCTION (SECURITY DEFINER to avoid recursion)
-- =============================================

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM profiles
    WHERE id = auth.uid();
    
    RETURN user_role IN ('uid_admin', 'uid_user', 'up3_admin');
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- =============================================
-- 2. DROP AND RECREATE POLICIES
-- =============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow upsert for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;

-- Policy 1: Users can read all profiles (needed for user lists)
CREATE POLICY "Anyone can read profiles" ON profiles
    FOR SELECT 
    USING (true);

-- Policy 2: Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- Policy 3: Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy 4: Admins can update any profile (for approval, role changes)
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());

-- =============================================
-- 3. VERIFY POLICIES
-- =============================================

SELECT policyname, cmd, permissive
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;
