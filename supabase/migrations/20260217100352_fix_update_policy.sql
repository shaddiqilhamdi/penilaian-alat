-- Fix UPDATE policies for admin approval functionality

-- Drop any existing update policies
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Admins can update any profile (for approval)
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());
