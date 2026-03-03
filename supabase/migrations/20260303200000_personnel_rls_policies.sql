-- =============================================
-- Migration: personnel_rls_policies
-- Purpose: Add RLS policies for personnel table so authenticated users can CRUD
-- Problem: RLS was enabled but no policies existed, blocking all non-service-role access
-- =============================================

-- 1. Ensure RLS is enabled
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;

-- 2. SELECT: Any authenticated user can read all personnel
CREATE POLICY "Authenticated users can read personnel"
    ON personnel FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- 3. INSERT: Any authenticated user can create personnel
CREATE POLICY "Authenticated users can insert personnel"
    ON personnel FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 4. UPDATE: Any authenticated user can update personnel
CREATE POLICY "Authenticated users can update personnel"
    ON personnel FOR UPDATE
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- 5. DELETE: Any authenticated user can delete personnel
CREATE POLICY "Authenticated users can delete personnel"
    ON personnel FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- 6. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON personnel TO authenticated;
