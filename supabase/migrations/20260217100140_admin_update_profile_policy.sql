-- =============================================
-- Migration: admin_update_profile_policy
-- Purpose: Fix RLS policy to allow admins to update other profiles
-- =============================================

-- 1. CREATE HELPER FUNCTION (SECURITY DEFINER to avoid recursion)
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

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- 2. DROP ALL EXISTING POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow upsert for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- 3. CREATE CLEAN POLICIES

-- Policy 1: Anyone can read profiles
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

-- Policy 4: Admins can update any profile
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());
