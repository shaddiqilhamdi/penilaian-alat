-- ============================================================================
-- Migration: 20260415110000_fix_personnel_rls.sql
-- Purpose: Replace overly permissive personnel RLS policies (any authenticated
--          user can read/update/delete ANY personnel record) with role-aware
--          policies that scope access to the user's own vendor or unit.
--
-- Role matrix:
--   uid_admin / uid_user  → full access across all vendors
--   up3_admin / up3_user  → access to personnel whose vendor is in their unit
--   vendor_k3 / petugas   → access to personnel in their own vendor only
-- ============================================================================

-- ── 1. Drop existing blanket policies ────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read personnel"   ON personnel;
DROP POLICY IF EXISTS "Authenticated users can insert personnel"  ON personnel;
DROP POLICY IF EXISTS "Authenticated users can update personnel"  ON personnel;
DROP POLICY IF EXISTS "Authenticated users can delete personnel"  ON personnel;

-- ── 2. Helper: resolve whether the calling user can access a given vendor_id ─
--    Returns TRUE if:
--      - user is uid_admin or uid_user (global), OR
--      - user is up3_admin/up3_user AND vendor.unit_code matches user's unit_code, OR
--      - user is vendor_k3/petugas AND vendor matches user's vendor_id
CREATE OR REPLACE FUNCTION personnel_access_check(target_vendor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
          AND (
            -- Global admins: full access
            p.role IN ('uid_admin', 'uid_user')
            -- Unit admins: vendor must be in their unit
            OR (p.role IN ('up3_admin', 'up3_user')
                AND EXISTS (
                    SELECT 1 FROM vendors v
                    WHERE v.id = target_vendor_id
                      AND v.unit_code = p.unit_code
                ))
            -- Vendor users: own vendor only
            OR (p.role IN ('vendor_k3', 'petugas')
                AND p.vendor_id = target_vendor_id)
          )
    );
$$;

-- ── 3. SELECT: scoped by role ─────────────────────────────────────────────────
CREATE POLICY "Personnel access by role (select)"
    ON personnel FOR SELECT
    USING (personnel_access_check(vendor_id));

-- ── 4. INSERT: scoped by role ─────────────────────────────────────────────────
CREATE POLICY "Personnel access by role (insert)"
    ON personnel FOR INSERT
    WITH CHECK (personnel_access_check(vendor_id));

-- ── 5. UPDATE: scoped by role ─────────────────────────────────────────────────
CREATE POLICY "Personnel access by role (update)"
    ON personnel FOR UPDATE
    USING (personnel_access_check(vendor_id))
    WITH CHECK (personnel_access_check(vendor_id));

-- ── 6. DELETE: scoped by role ─────────────────────────────────────────────────
CREATE POLICY "Personnel access by role (delete)"
    ON personnel FOR DELETE
    USING (personnel_access_check(vendor_id));
