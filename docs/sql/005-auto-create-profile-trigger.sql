-- =============================================
-- Script: 005-auto-create-profile-trigger.sql
-- Purpose: Auto-create profile when user signs up (works with email confirmation)
-- Author: System
-- Date: 2026-02-17
-- Description: 
--   - Trigger creates basic profile immediately when auth user is created
--   - Uses SECURITY DEFINER to bypass RLS (user has no session yet)
--   - Registration page then updates profile with additional data via upsert
--   - Supports both email confirmation ON and OFF configurations
-- =============================================

-- =============================================
-- 1. ADD is_active COLUMN IF NOT EXISTS
-- =============================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Set existing users to active
UPDATE profiles SET is_active = true WHERE is_active IS NULL;

COMMENT ON COLUMN profiles.is_active IS 'Account status. New users: false (pending approval). Admin activates by setting true.';

-- =============================================
-- 2. CREATE TRIGGER FUNCTION (SECURITY DEFINER bypasses RLS)
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert basic profile - registration page will update with full data
    INSERT INTO public.profiles (
        id, 
        email, 
        nama, 
        nip,
        role, 
        is_active, 
        created_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nama', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'nip',
        'uid_user',  -- Default role, will be updated by registration page
        false,       -- Not active until admin approves
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        nama = COALESCE(EXCLUDED.nama, profiles.nama),
        nip = COALESCE(EXCLUDED.nip, profiles.nip),
        updated_at = NOW();
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the signup
        RAISE WARNING 'handle_new_user: Failed to create profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. CREATE TRIGGER ON auth.users
-- =============================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 4. ENABLE RLS ON PROFILES
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 5. CREATE RLS POLICIES
-- =============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Allow upsert for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Service role full access" ON profiles;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT 
    USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Authenticated users can insert/upsert their own profile
CREATE POLICY "Allow upsert for authenticated users" ON profiles
    FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- Policy: Admins (uid_admin, up3_admin) can view all profiles
CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('uid_admin', 'up3_admin')
        )
    );

-- Policy: Admins can update all profiles (for activating users, changing roles)
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('uid_admin', 'up3_admin')
        )
    );

-- =============================================
-- 6. GRANT PERMISSIONS
-- =============================================

GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON profiles TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- =============================================
-- 7. VERIFICATION QUERIES
-- =============================================

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'profiles';

-- Check policies
SELECT policyname, cmd, permissive
FROM pg_policies 
WHERE tablename = 'profiles';

-- Check trigger
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';

-- Check is_active column
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'is_active';
