-- ============================================================================
-- UP3 Dashboard RPC Functions
-- Migration: 20260304100000_up3_dashboard_rpc.sql
-- Description: Server-side aggregation functions for the UP3 dashboard.
--              Replaces multiple client-side queries (incl. .range(0,9999))
--              with efficient single-call RPCs.
-- Functions:
--   1. fn_up3_stats        – summary stats (assessments, equipment, scores, kondisi)
--   2. fn_up3_vendor_recap – per vendor+peruntukan recap table
--   3. fn_up3_equipment_issues – equipment bermasalah list (limit 20)
--   4. fn_up3_daily_chart  – last 30 days assessment counts + target
-- ============================================================================

-- ============================================================================
-- 1. fn_up3_stats
--    Menggabungkan: vendors lookup, assessments count, vendor_assets aggregation,
--                   teams count, personnel count → 1 RPC call
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_up3_stats(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_month DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_assessments BIGINT,
    total_equipment BIGINT,
    avg_score NUMERIC(4,2),
    avg_personal NUMERIC(4,2),
    avg_regu NUMERIC(4,2),
    tidak_layak BIGINT,
    tidak_layak_personal BIGINT,
    tidak_layak_regu BIGINT,
    tidak_berfungsi BIGINT,
    tidak_berfungsi_personal BIGINT,
    tidak_berfungsi_regu BIGINT,
    kontrak_ok BIGINT,
    kontrak_pct NUMERIC(5,2),
    total_baik BIGINT,
    total_bermasalah BIGINT,
    total_kendaraan BIGINT,
    total_personil BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start TIMESTAMP WITH TIME ZONE;
    v_end   TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end   := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH vendor_ids AS (
        -- Resolve vendor list: single vendor or all vendors in unit
        SELECT v.id
        FROM vendors v
        WHERE (p_vendor_id IS NOT NULL AND v.id = p_vendor_id)
           OR (p_vendor_id IS NULL AND p_unit_code IS NOT NULL AND v.unit_code = p_unit_code)
    ),
    assess_stats AS (
        SELECT COUNT(a.id) AS cnt
        FROM assessments a
        WHERE a.vendor_id IN (SELECT id FROM vendor_ids)
          AND a.tanggal_penilaian >= v_start
          AND a.tanggal_penilaian < v_end
    ),
    asset_stats AS (
        SELECT
            COUNT(va.id) AS total_eq,
            COALESCE(AVG(va.nilai), 0) AS avg_all,
            COALESCE(AVG(CASE WHEN em.jenis = 'Personal' THEN va.nilai END), 0) AS avg_p,
            COALESCE(AVG(CASE WHEN em.jenis = 'Regu' THEN va.nilai END), 0) AS avg_r,
            COUNT(CASE WHEN va.kondisi_fisik = -1 THEN 1 END) AS tl,
            COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Personal' THEN 1 END) AS tl_p,
            COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Regu' THEN 1 END) AS tl_r,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 THEN 1 END) AS tb,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Personal' THEN 1 END) AS tb_p,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Regu' THEN 1 END) AS tb_r,
            COUNT(CASE WHEN va.kesesuaian_kontrak = 2 THEN 1 END) AS k_ok,
            -- bermasalah = unique assets with TL OR TB
            COUNT(CASE WHEN va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1 THEN 1 END) AS bermasalah
        FROM vendor_assets va
        LEFT JOIN equipment_master em ON va.equipment_id = em.id
        WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
          AND va.last_assessment_date >= v_start
          AND va.last_assessment_date < v_end
    ),
    team_count AS (
        SELECT COUNT(*) AS cnt
        FROM teams t
        WHERE t.vendor_id IN (SELECT id FROM vendor_ids)
    ),
    person_count AS (
        SELECT COUNT(*) AS cnt
        FROM personnel p
        WHERE p.vendor_id IN (SELECT id FROM vendor_ids)
    )
    SELECT
        ac.cnt                       AS total_assessments,
        s.total_eq                   AS total_equipment,
        ROUND(s.avg_all, 2)         AS avg_score,
        ROUND(s.avg_p, 2)           AS avg_personal,
        ROUND(s.avg_r, 2)           AS avg_regu,
        s.tl                         AS tidak_layak,
        s.tl_p                       AS tidak_layak_personal,
        s.tl_r                       AS tidak_layak_regu,
        s.tb                         AS tidak_berfungsi,
        s.tb_p                       AS tidak_berfungsi_personal,
        s.tb_r                       AS tidak_berfungsi_regu,
        s.k_ok                       AS kontrak_ok,
        CASE WHEN s.total_eq > 0
             THEN ROUND((s.k_ok::NUMERIC / s.total_eq) * 100, 2)
             ELSE 0 END              AS kontrak_pct,
        (s.total_eq - s.bermasalah)  AS total_baik,
        s.bermasalah                 AS total_bermasalah,
        tc.cnt                       AS total_kendaraan,
        pc.cnt                       AS total_personil
    FROM assess_stats ac, asset_stats s, team_count tc, person_count pc;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_stats(TEXT, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_stats(TEXT, UUID, DATE) TO anon;

COMMENT ON FUNCTION fn_up3_stats(TEXT, UUID, DATE) IS
    'UP3 dashboard summary stats. Pass p_vendor_id for vendor_k3, or p_unit_code for up3_admin/up3_user.';


-- ============================================================================
-- 2. fn_up3_vendor_recap
--    Menggabungkan: equipment_standards, teams, personnel, vendor_assets
--    → 4 queries menjadi 1 RPC. Sudah diagregasi per vendor+peruntukan.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_up3_vendor_recap(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_month DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    vendor_id UUID,
    vendor_name TEXT,
    peruntukan_id UUID,
    peruntukan TEXT,
    jenis TEXT,
    jumlah BIGINT,
    equipment_count BIGINT,
    avg_score NUMERIC(4,2),
    tidak_layak BIGINT,
    tidak_berfungsi BIGINT,
    kontrak_ok BIGINT,
    kontrak_pct NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start TIMESTAMP WITH TIME ZONE;
    v_end   TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end   := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH vendor_ids AS (
        SELECT v.id
        FROM vendors v
        WHERE (p_vendor_id IS NOT NULL AND v.id = p_vendor_id)
           OR (p_vendor_id IS NULL AND p_unit_code IS NOT NULL AND v.unit_code = p_unit_code)
    ),
    -- All equipment_standards rows for these vendors → defines the vendor+peruntukan combos
    std AS (
        SELECT DISTINCT
            es.vendor_id,
            es.peruntukan_id,
            vn.vendor_name,
            pr.deskripsi AS peruntukan_desc,
            em.jenis AS eq_jenis
        FROM equipment_standards es
        JOIN vendors vn ON es.vendor_id = vn.id
        LEFT JOIN peruntukan pr ON es.peruntukan_id = pr.id
        LEFT JOIN equipment_master em ON es.equipment_id = em.id
        WHERE es.vendor_id IN (SELECT id FROM vendor_ids)
    ),
    -- Unique vendor+peruntukan+jenis combos
    combos AS (
        SELECT DISTINCT
            s.vendor_id,
            s.peruntukan_id,
            s.vendor_name,
            s.peruntukan_desc,
            s.eq_jenis
        FROM std s
    ),
    -- Count teams per vendor+peruntukan (for Regu type)
    team_counts AS (
        SELECT t.vendor_id, t.peruntukan_id, COUNT(*) AS cnt
        FROM teams t
        WHERE t.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY t.vendor_id, t.peruntukan_id
    ),
    -- Count personnel per vendor+peruntukan (for Personal type)
    person_counts AS (
        SELECT p.vendor_id, p.peruntukan_id, COUNT(*) AS cnt
        FROM personnel p
        WHERE p.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY p.vendor_id, p.peruntukan_id
    ),
    -- Aggregate vendor_assets per vendor+peruntukan (current month)
    asset_agg AS (
        SELECT
            va.vendor_id,
            va.peruntukan_id,
            COUNT(va.id) AS eq_cnt,
            COALESCE(AVG(va.nilai), 0) AS avg_val,
            COUNT(CASE WHEN va.kondisi_fisik = -1 THEN 1 END) AS tl,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 THEN 1 END) AS tb,
            COUNT(CASE WHEN va.kesesuaian_kontrak = 2 THEN 1 END) AS k_ok
        FROM vendor_assets va
        WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
          AND va.last_assessment_date IS NOT NULL
          AND va.last_assessment_date >= v_start
          AND va.last_assessment_date < v_end
        GROUP BY va.vendor_id, va.peruntukan_id
    )
    SELECT
        c.vendor_id,
        c.vendor_name::TEXT,
        c.peruntukan_id,
        COALESCE(c.peruntukan_desc, '-')::TEXT   AS peruntukan,
        COALESCE(c.eq_jenis, '-')::TEXT          AS jenis,
        -- jumlah = teams (Regu) or personnel (Personal)
        CASE
            WHEN c.eq_jenis = 'Regu'     THEN COALESCE(tc.cnt, 0)
            WHEN c.eq_jenis = 'Personal' THEN COALESCE(pc.cnt, 0)
            ELSE 0
        END                                      AS jumlah,
        COALESCE(aa.eq_cnt, 0)                   AS equipment_count,
        ROUND(COALESCE(aa.avg_val, 0), 2)        AS avg_score,
        COALESCE(aa.tl, 0)                        AS tidak_layak,
        COALESCE(aa.tb, 0)                        AS tidak_berfungsi,
        COALESCE(aa.k_ok, 0)                      AS kontrak_ok,
        CASE WHEN COALESCE(aa.eq_cnt, 0) > 0
             THEN ROUND((COALESCE(aa.k_ok, 0)::NUMERIC / aa.eq_cnt) * 100, 2)
             ELSE 0 END                           AS kontrak_pct
    FROM combos c
    LEFT JOIN team_counts tc   ON c.vendor_id = tc.vendor_id AND c.peruntukan_id = tc.peruntukan_id
    LEFT JOIN person_counts pc ON c.vendor_id = pc.vendor_id AND c.peruntukan_id = pc.peruntukan_id
    LEFT JOIN asset_agg aa     ON c.vendor_id = aa.vendor_id AND c.peruntukan_id = aa.peruntukan_id
    ORDER BY c.vendor_name, c.eq_jenis;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID, DATE) TO anon;

COMMENT ON FUNCTION fn_up3_vendor_recap(TEXT, UUID, DATE) IS
    'UP3 vendor recap table. Aggregates equipment_standards, teams, personnel, vendor_assets per vendor+peruntukan.';


-- ============================================================================
-- 3. fn_up3_equipment_issues
--    Equipment bermasalah (TL/TB) untuk vendor-vendor di UP3 ini.
--    Returns max 20 rows, sudah di-join dengan vendor, equipment, team, personnel.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_up3_equipment_issues(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    asset_id UUID,
    last_assessment_date TIMESTAMPTZ,
    vendor_name TEXT,
    nama_alat TEXT,
    eq_jenis TEXT,
    nomor_polisi TEXT,
    nama_personil TEXT,
    kondisi_fisik INTEGER,
    kondisi_fungsi INTEGER,
    nilai NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH vendor_ids AS (
        SELECT v.id
        FROM vendors v
        WHERE (p_vendor_id IS NOT NULL AND v.id = p_vendor_id)
           OR (p_vendor_id IS NULL AND p_unit_code IS NOT NULL AND v.unit_code = p_unit_code)
    )
    SELECT
        va.id                                    AS asset_id,
        va.last_assessment_date,
        vn.vendor_name::TEXT,
        em.nama_alat::TEXT,
        em.jenis::TEXT                           AS eq_jenis,
        tm.nomor_polisi::TEXT,
        ps.nama_personil::TEXT,
        va.kondisi_fisik,
        va.kondisi_fungsi,
        va.nilai
    FROM vendor_assets va
    INNER JOIN vendors vn ON va.vendor_id = vn.id
    LEFT JOIN equipment_master em ON va.equipment_id = em.id
    LEFT JOIN teams tm ON va.team_id = tm.id
    LEFT JOIN personnel ps ON va.personnel_id = ps.id
    WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
      AND (va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1)
      AND va.last_assessment_date IS NOT NULL
    ORDER BY va.last_assessment_date DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_equipment_issues(TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_equipment_issues(TEXT, UUID, INTEGER) TO anon;

COMMENT ON FUNCTION fn_up3_equipment_issues(TEXT, UUID, INTEGER) IS
    'UP3 equipment issues list (TL Fisik / TB Fungsi). Max p_limit rows, newest first.';


-- ============================================================================
-- 4. fn_up3_daily_chart
--    Jumlah assessment per hari (30 hari terakhir) + target harian.
--    Menggabungkan assessments count + target_penilaian → 1 call.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_up3_daily_chart(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL
)
RETURNS TABLE (
    day_date DATE,
    day_label TEXT,
    assessment_count BIGINT,
    daily_target BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target BIGINT;
BEGIN
    -- Calculate daily target from target_penilaian for this unit
    SELECT COALESCE(SUM(tp.target_harian), 0)
    INTO v_target
    FROM target_penilaian tp
    WHERE p_unit_code IS NOT NULL AND tp.unit_code = p_unit_code;

    RETURN QUERY
    WITH vendor_ids AS (
        SELECT v.id
        FROM vendors v
        WHERE (p_vendor_id IS NOT NULL AND v.id = p_vendor_id)
           OR (p_vendor_id IS NULL AND p_unit_code IS NOT NULL AND v.unit_code = p_unit_code)
    ),
    days AS (
        SELECT d::DATE AS dt
        FROM generate_series(
            (CURRENT_DATE - INTERVAL '29 days'),
            CURRENT_DATE,
            '1 day'::INTERVAL
        ) d
    ),
    daily_counts AS (
        SELECT
            (a.tanggal_penilaian AT TIME ZONE 'Asia/Jakarta')::DATE AS assess_day,
            COUNT(*) AS cnt
        FROM assessments a
        WHERE a.vendor_id IN (SELECT id FROM vendor_ids)
          AND a.tanggal_penilaian >= (CURRENT_DATE - INTERVAL '29 days')::TIMESTAMPTZ
          AND a.tanggal_penilaian < (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
        GROUP BY (a.tanggal_penilaian AT TIME ZONE 'Asia/Jakarta')::DATE
    )
    SELECT
        d.dt                                                  AS day_date,
        (TO_CHAR(d.dt, 'DD/MM'))::TEXT                        AS day_label,
        COALESCE(dc.cnt, 0)                                   AS assessment_count,
        v_target                                              AS daily_target
    FROM days d
    LEFT JOIN daily_counts dc ON d.dt = dc.assess_day
    ORDER BY d.dt;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_daily_chart(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_daily_chart(TEXT, UUID) TO anon;

COMMENT ON FUNCTION fn_up3_daily_chart(TEXT, UUID) IS
    'UP3 daily chart data: assessment count per day (last 30 days) with daily target.';
