-- ============================================================================
-- Fix UP3 Dashboard RPCs to show LATEST assessment results per vendor_asset
-- instead of filtering by current month.
--
-- Problem: asset_stats/asset_agg CTEs filtered by last_assessment_date within
--          the given month, so vendor_assets assessed in earlier months were
--          excluded from the dashboard.
--
-- Solution:
--   - fn_up3_stats        → keep p_month for assessment count only,
--                            asset stats use all assessed vendor_assets
--   - fn_up3_vendor_recap → remove month filter, show latest assessment data
--                            (drop p_month param — no longer needed)
--   - fn_up3_unfulfilled_contracts → remove month filter
--                            (drop p_month param — no longer needed)
--   - fn_up3_equipment_issues → already correct (no month filter)
--   - fn_up3_daily_chart      → already correct (time-series)
-- ============================================================================

-- ============================
-- 1. fn_up3_stats (recreate)
-- ============================
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
    -- Month range is ONLY used for assessment count
    v_start := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end   := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH vendor_ids AS (
        SELECT v.id
        FROM vendors v
        WHERE (p_vendor_id IS NOT NULL AND v.id = p_vendor_id)
           OR (p_vendor_id IS NULL AND p_unit_code IS NOT NULL AND v.unit_code = p_unit_code)
    ),
    -- Assessment count: filtered by month (how many done this month)
    assess_stats AS (
        SELECT COUNT(a.id) AS cnt
        FROM assessments a
        WHERE a.vendor_id IN (SELECT id FROM vendor_ids)
          AND a.tanggal_penilaian >= v_start
          AND a.tanggal_penilaian < v_end
    ),
    -- Asset stats: ALL assessed vendor_assets (latest assessment, no month filter)
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
            COUNT(CASE WHEN va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1 THEN 1 END) AS bermasalah
        FROM vendor_assets va
        LEFT JOIN equipment_master em ON va.equipment_id = em.id
        WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
          AND va.last_assessment_date IS NOT NULL
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

COMMENT ON FUNCTION fn_up3_stats(TEXT, UUID, DATE) IS
    'UP3 dashboard summary stats. Asset stats from latest assessment (no month filter). Assessment count filtered by p_month.';


-- ============================
-- 2. fn_up3_vendor_recap (recreate without p_month)
-- ============================
DROP FUNCTION IF EXISTS fn_up3_vendor_recap(TEXT, UUID, DATE);

CREATE FUNCTION fn_up3_vendor_recap(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL
)
RETURNS TABLE (
    vendor_id UUID,
    vendor_name TEXT,
    peruntukan_id TEXT,
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
BEGIN
    RETURN QUERY
    WITH vendor_ids AS (
        SELECT v.id
        FROM vendors v
        WHERE (p_vendor_id IS NOT NULL AND v.id = p_vendor_id)
           OR (p_vendor_id IS NULL AND p_unit_code IS NOT NULL AND v.unit_code = p_unit_code)
    ),
    -- Unique vendor+peruntukan combos from equipment_standards
    combos AS (
        SELECT
            es.vendor_id,
            es.peruntukan_id,
            vn.vendor_name,
            COALESCE(pr.deskripsi, '-') AS peruntukan_desc,
            MODE() WITHIN GROUP (ORDER BY em.jenis) AS eq_jenis
        FROM equipment_standards es
        JOIN vendors vn ON es.vendor_id = vn.id
        LEFT JOIN peruntukan pr ON es.peruntukan_id = pr.id
        LEFT JOIN equipment_master em ON es.equipment_id = em.id
        WHERE es.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY es.vendor_id, es.peruntukan_id, vn.vendor_name, pr.deskripsi
    ),
    team_counts AS (
        SELECT t.vendor_id, t.peruntukan_id, COUNT(*) AS cnt
        FROM teams t
        WHERE t.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY t.vendor_id, t.peruntukan_id
    ),
    person_counts AS (
        SELECT p.vendor_id, p.peruntukan_id, COUNT(*) AS cnt
        FROM personnel p
        WHERE p.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY p.vendor_id, p.peruntukan_id
    ),
    -- Asset aggregation: latest assessment data (no month filter)
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
        GROUP BY va.vendor_id, va.peruntukan_id
    )
    SELECT
        c.vendor_id,
        c.vendor_name::TEXT,
        c.peruntukan_id::TEXT,
        c.peruntukan_desc::TEXT                   AS peruntukan,
        COALESCE(c.eq_jenis, '-')::TEXT           AS jenis,
        CASE
            WHEN c.eq_jenis = 'Regu'     THEN COALESCE(tc.cnt, 0)
            WHEN c.eq_jenis = 'Personal' THEN COALESCE(pc.cnt, 0)
            ELSE 0
        END                                       AS jumlah,
        COALESCE(aa.eq_cnt, 0)                    AS equipment_count,
        ROUND(COALESCE(aa.avg_val, 0), 2)         AS avg_score,
        COALESCE(aa.tl, 0)                         AS tidak_layak,
        COALESCE(aa.tb, 0)                         AS tidak_berfungsi,
        COALESCE(aa.k_ok, 0)                       AS kontrak_ok,
        CASE WHEN COALESCE(aa.eq_cnt, 0) > 0
             THEN ROUND((COALESCE(aa.k_ok, 0)::NUMERIC / aa.eq_cnt) * 100, 2)
             ELSE 0 END                            AS kontrak_pct
    FROM combos c
    LEFT JOIN team_counts tc   ON c.vendor_id = tc.vendor_id AND c.peruntukan_id = tc.peruntukan_id
    LEFT JOIN person_counts pc ON c.vendor_id = pc.vendor_id AND c.peruntukan_id = pc.peruntukan_id
    LEFT JOIN asset_agg aa     ON c.vendor_id = aa.vendor_id AND c.peruntukan_id = aa.peruntukan_id
    ORDER BY c.vendor_name, c.peruntukan_desc;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID) TO anon;

COMMENT ON FUNCTION fn_up3_vendor_recap(TEXT, UUID) IS
    'UP3 vendor recap table. Shows latest assessment data per vendor+peruntukan (no month filter).';


-- ============================
-- 3. fn_up3_unfulfilled_contracts (recreate without p_month)
-- ============================
DROP FUNCTION IF EXISTS fn_up3_unfulfilled_contracts(TEXT, UUID, DATE, INTEGER);

CREATE FUNCTION fn_up3_unfulfilled_contracts(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    asset_id UUID,
    nama_alat TEXT,
    kategori TEXT,
    sub_kategori TEXT,
    vendor_name TEXT,
    peruntukan TEXT,
    eq_jenis TEXT,
    required_qty INTEGER,
    realisasi_qty INTEGER,
    selisih INTEGER,
    owner_label TEXT,
    owner_type TEXT,
    last_assessment_date TIMESTAMPTZ
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
        va.id                                               AS asset_id,
        em.nama_alat::TEXT,
        COALESCE(em.kategori, '-')::TEXT                    AS kategori,
        COALESCE(em.sub_kategori1, '-')::TEXT               AS sub_kategori,
        vn.vendor_name::TEXT,
        COALESCE(pr.deskripsi, '-')::TEXT                   AS peruntukan,
        COALESCE(em.jenis, '-')::TEXT                       AS eq_jenis,
        COALESCE(ai.required_qty, 0)                        AS required_qty,
        COALESCE(va.realisasi_qty, 0)                       AS realisasi_qty,
        COALESCE(ai.required_qty, 0) - COALESCE(va.realisasi_qty, 0) AS selisih,
        CASE
            WHEN va.owner_id = va.team_id AND va.team_id IS NOT NULL
                THEN COALESCE(t.nomor_polisi, t.id::TEXT)
            ELSE COALESCE(per.nama_personil, per.nik, '-')
        END::TEXT                                           AS owner_label,
        CASE
            WHEN va.owner_id = va.team_id AND va.team_id IS NOT NULL THEN 'tim'
            ELSE 'personil'
        END::TEXT                                           AS owner_type,
        va.last_assessment_date
    FROM vendor_assets va
    INNER JOIN vendors vn ON va.vendor_id = vn.id
    LEFT JOIN peruntukan pr ON va.peruntukan_id = pr.id
    LEFT JOIN equipment_master em ON va.equipment_id = em.id
    LEFT JOIN teams t ON t.id = va.team_id
    LEFT JOIN personnel per ON per.id = va.personnel_id
    LEFT JOIN assessment_items ai
        ON ai.assessment_id = va.last_assessment_id
        AND ai.equipment_id = va.equipment_id
    WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
      AND va.owner_id IS NOT NULL
      AND va.last_assessment_date IS NOT NULL
      AND va.kesesuaian_kontrak < 2
    ORDER BY vn.vendor_name, COALESCE(pr.deskripsi, '-'), em.nama_alat
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, INTEGER) TO anon;

COMMENT ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, INTEGER) IS
    'Daftar equipment belum sesuai kontrak (kesesuaian_kontrak < 2). Shows latest assessment data (no month filter).';
