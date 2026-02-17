-- =============================================
-- Migration: delete_user_function
-- Purpose: Create function to delete user from both profiles and auth.users
-- Only admins (uid_admin, uid_user, up3_admin) can delete users
-- =============================================

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role TEXT;
    target_email TEXT;
    result JSON;
BEGIN
    -- Check if caller is admin
    SELECT role INTO caller_role
    FROM profiles
    WHERE id = auth.uid();
    
    IF caller_role IS NULL OR caller_role NOT IN ('uid_admin', 'uid_user', 'up3_admin') THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: Only admins can delete users');
    END IF;
    
    -- Prevent self-deletion
    IF target_user_id = auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Cannot delete your own account');
    END IF;
    
    -- Get target user email for logging
    SELECT email INTO target_email
    FROM profiles
    WHERE id = target_user_id;
    
    IF target_email IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Delete from profiles first (foreign key constraint)
    DELETE FROM profiles WHERE id = target_user_id;
    
    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = target_user_id;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'User deleted successfully',
        'deleted_email', target_email
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_user IS 'Deletes user from both profiles and auth.users. Only admins can call this function.';
