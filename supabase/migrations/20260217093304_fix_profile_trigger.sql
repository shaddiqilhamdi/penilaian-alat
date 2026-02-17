-- Fix profile trigger for registration
-- Handle case when NIP might be null and avoid unique constraint issues

-- 1. Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. Make sure is_active column exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE profiles SET is_active = true WHERE is_active IS NULL;

-- 3. Drop unique constraint on nip (allow null duplicates)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_nip_key;

-- 4. Create simpler trigger function that won't fail
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only insert basic profile, let the app update the rest
    INSERT INTO public.profiles (id, email, nama, role, is_active)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nama', 'New User'),
        'uid_user',
        false
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Don't fail signup if profile creation fails
    RAISE WARNING 'Profile creation failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Ensure RLS policies are correct
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;

CREATE POLICY "Users can manage own profile" ON profiles
    FOR ALL 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Anyone can read profiles" ON profiles
    FOR SELECT 
    USING (true);

-- 7. Grant permissions
GRANT ALL ON profiles TO authenticated;
GRANT SELECT ON profiles TO anon;
