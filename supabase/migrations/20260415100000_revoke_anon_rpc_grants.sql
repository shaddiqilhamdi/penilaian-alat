-- ============================================================================
-- Migration: 20260415100000_revoke_anon_rpc_grants.sql
-- Purpose: Revoke EXECUTE permission from anon role on all dashboard RPC
--          functions. These functions return sensitive business data and must
--          only be callable by authenticated users.
--
-- Background: Multiple SECURITY DEFINER functions were inadvertently granted
--             to the anon role, allowing unauthenticated callers to read
--             assessment data, equipment issues, and vendor reports using
--             only the public anon key.
-- ============================================================================

-- fn_dashboard_stats (multiple signatures from iterative migrations)
REVOKE EXECUTE ON FUNCTION fn_dashboard_stats(DATE) FROM anon;

-- fn_equipment_issues (multiple signatures)
DO $$ BEGIN
    BEGIN REVOKE EXECUTE ON FUNCTION fn_equipment_issues() FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN REVOKE EXECUTE ON FUNCTION fn_equipment_issues(DATE) FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN REVOKE EXECUTE ON FUNCTION fn_equipment_issues(DATE, DATE) FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

-- fn_trend_monthly
REVOKE EXECUTE ON FUNCTION fn_trend_monthly(INTEGER) FROM anon;

-- fn_entry_realization
REVOKE EXECUTE ON FUNCTION fn_entry_realization(DATE) FROM anon;

-- fn_unit_recap
REVOKE EXECUTE ON FUNCTION fn_unit_recap(DATE) FROM anon;

-- fn_unit_report
REVOKE EXECUTE ON FUNCTION fn_unit_report(TEXT, DATE) FROM anon;

-- fn_daily_entry_per_unit
REVOKE EXECUTE ON FUNCTION fn_daily_entry_per_unit(DATE) FROM anon;

-- fn_up3_stats
REVOKE EXECUTE ON FUNCTION fn_up3_stats(TEXT, UUID, DATE) FROM anon;

-- fn_up3_vendor_recap (multiple signatures)
DO $$ BEGIN
    BEGIN REVOKE EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID, DATE) FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN REVOKE EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID) FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

-- fn_up3_equipment_issues
REVOKE EXECUTE ON FUNCTION fn_up3_equipment_issues(TEXT, UUID, INTEGER) FROM anon;

-- fn_up3_daily_chart
REVOKE EXECUTE ON FUNCTION fn_up3_daily_chart(TEXT, UUID) FROM anon;

-- fn_up3_unfulfilled_contracts (multiple signatures)
DO $$ BEGIN
    BEGIN REVOKE EXECUTE ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, DATE, INTEGER) FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN REVOKE EXECUTE ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, INTEGER) FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;
