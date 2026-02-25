-- Migration: Simplify dashboard functions using owner_id
-- Sekarang vendor_assets sudah UNIQUE per (owner_id, equipment_id)
-- dan selalu di-update dengan data assessment terbaru,
-- jadi cukup query langsung dari vendor_assets WHERE owner_id IS NOT NULL.
-- Tidak perlu lagi CTE latest_target_assessments dari assessment_items.

-- ============================================================================
-- 1. fn_dashboard_stats — Statistik global dashboard
-- ============================================================================
DROP FUNCTION IF EXISTS fn_dashboard_stats(DATE);

CREATE FUNCTION fn_dashboard_stats(p_month DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    total_assessments BIGINT,
    personal_assessments BIGINT,
    regu_assessments BIGINT,
    unique_vendors BIGINT,
    unique_units BIGINT,
    total_units BIGINT,
    unique_teams BIGINT,
    unique_personnel BIGINT,
    total_equipment BIGINT,
    total_rusak BIGINT,
    avg_score NUMERIC(4,2),
    avg_personal NUMERIC(4,2),
    avg_regu NUMERIC(4,2),
    tidak_layak BIGINT,
    tidak_layak_personal BIGINT,
    tidak_layak_regu BIGINT,
    tidak_berfungsi BIGINT,
    tidak_berfungsi_personal BIGINT,
    tidak_berfungsi_regu BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date TIMESTAMP WITH TIME ZONE;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH assessment_stats AS (
        SELECT 
            COUNT(DISTINCT a.id) AS total_assessments,
            COUNT(DISTINCT CASE WHEN em.jenis = 'Personal' THEN a.id END) AS personal_assessments,
            COUNT(DISTINCT CASE WHEN em.jenis = 'Regu' THEN a.id END) AS regu_assessments,
            COUNT(DISTINCT a.vendor_id) AS unique_vendors,
            COUNT(DISTINCT v.unit_code) AS unique_units,
            COUNT(DISTINCT a.team_id) AS unique_teams,
            COUNT(DISTINCT a.personnel_id) AS unique_personnel
        FROM assessments a
        LEFT JOIN vendors v ON a.vendor_id = v.id
        LEFT JOIN assessment_items ai ON ai.assessment_id = a.id
        LEFT JOIN equipment_master em ON ai.equipment_id = em.id
        WHERE a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
    ),
    -- Ambil dari vendor_assets yang owner_id jelas (unique per owner+equipment)
    equipment_stats AS (
        SELECT 
            COUNT(*) AS total_equipment,
            COUNT(CASE WHEN va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1 THEN 1 END) AS total_rusak,
            COALESCE(AVG(va.nilai), 0) AS avg_score,
            COALESCE(AVG(CASE WHEN em.jenis = 'Personal' THEN va.nilai END), 0) AS avg_personal,
            COALESCE(AVG(CASE WHEN em.jenis = 'Regu' THEN va.nilai END), 0) AS avg_regu,
            COUNT(CASE WHEN va.kondisi_fisik = -1 THEN 1 END) AS tidak_layak,
            COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Personal' THEN 1 END) AS tidak_layak_personal,
            COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Regu' THEN 1 END) AS tidak_layak_regu,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 THEN 1 END) AS tidak_berfungsi,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Personal' THEN 1 END) AS tidak_berfungsi_personal,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Regu' THEN 1 END) AS tidak_berfungsi_regu
        FROM vendor_assets va
        LEFT JOIN equipment_master em ON va.equipment_id = em.id
        WHERE va.owner_id IS NOT NULL
          AND va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
    ),
    unit_count AS (
        SELECT COUNT(*) AS total_units FROM units
    )
    SELECT 
        a.total_assessments,
        a.personal_assessments,
        a.regu_assessments,
        a.unique_vendors,
        a.unique_units,
        u.total_units,
        a.unique_teams,
        a.unique_personnel,
        e.total_equipment,
        e.total_rusak,
        ROUND(e.avg_score, 2),
        ROUND(e.avg_personal, 2),
        ROUND(e.avg_regu, 2),
        e.tidak_layak,
        e.tidak_layak_personal,
        e.tidak_layak_regu,
        e.tidak_berfungsi,
        e.tidak_berfungsi_personal,
        e.tidak_berfungsi_regu
    FROM assessment_stats a, equipment_stats e, unit_count u;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_dashboard_stats(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_dashboard_stats(DATE) TO anon;

-- ============================================================================
-- 2. fn_unit_recap — Rekap per unit
-- ============================================================================
DROP FUNCTION IF EXISTS fn_unit_recap(DATE);

CREATE FUNCTION fn_unit_recap(p_month DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    unit_code TEXT,
    unit_name TEXT,
    total_equipment BIGINT,
    total_teams BIGINT,
    total_personnel BIGINT,
    avg_score NUMERIC(4,2),
    avg_personal NUMERIC(4,2),
    avg_regu NUMERIC(4,2),
    tl_fisik BIGINT,
    tb_fungsi BIGINT,
    kontrak_ok BIGINT,
    kontrak_pct NUMERIC(5,2)
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date TIMESTAMP WITH TIME ZONE;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH va_stats AS (
        SELECT 
            v.unit_code AS uc,
            va.team_id,
            va.personnel_id,
            va.nilai,
            va.kondisi_fisik,
            va.kondisi_fungsi,
            va.kesesuaian_kontrak,
            em.jenis AS equipment_jenis
        FROM vendor_assets va
        INNER JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN equipment_master em ON va.equipment_id = em.id
        WHERE va.owner_id IS NOT NULL
          AND va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
    ),
    unit_aggregates AS (
        SELECT 
            u.unit_code AS uc,
            u.unit_name AS un,
            COUNT(s.uc) AS total_eq,
            COUNT(DISTINCT s.team_id) AS total_tm,
            COUNT(DISTINCT s.personnel_id) AS total_ps,
            COALESCE(AVG(s.nilai), 0) AS avg_all,
            COALESCE(AVG(CASE WHEN s.equipment_jenis = 'Personal' THEN s.nilai END), 0) AS avg_p,
            COALESCE(AVG(CASE WHEN s.equipment_jenis = 'Regu' THEN s.nilai END), 0) AS avg_r,
            COUNT(CASE WHEN s.kondisi_fisik = -1 THEN 1 END) AS tl_f,
            COUNT(CASE WHEN s.kondisi_fungsi = -1 THEN 1 END) AS tb_f,
            COUNT(CASE WHEN s.kesesuaian_kontrak >= 2 THEN 1 END) AS k_ok
        FROM units u
        LEFT JOIN va_stats s ON u.unit_code = s.uc
        GROUP BY u.unit_code, u.unit_name
    )
    SELECT 
        ua.uc::TEXT AS unit_code,
        ua.un::TEXT AS unit_name,
        ua.total_eq AS total_equipment,
        ua.total_tm AS total_teams,
        ua.total_ps AS total_personnel,
        ROUND(ua.avg_all, 2) AS avg_score,
        ROUND(ua.avg_p, 2) AS avg_personal,
        ROUND(ua.avg_r, 2) AS avg_regu,
        ua.tl_f AS tl_fisik,
        ua.tb_f AS tb_fungsi,
        ua.k_ok AS kontrak_ok,
        CASE 
            WHEN ua.total_eq > 0 THEN ROUND((ua.k_ok::NUMERIC / ua.total_eq) * 100, 2)
            ELSE 0
        END AS kontrak_pct
    FROM unit_aggregates ua
    ORDER BY ua.total_eq DESC, ua.uc;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_unit_recap(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_unit_recap(DATE) TO anon;

-- ============================================================================
-- 3. fn_unit_report — Laporan detail per unit
-- ============================================================================
DROP FUNCTION IF EXISTS fn_unit_report(TEXT, DATE);

CREATE FUNCTION fn_unit_report(
    p_unit_code TEXT,
    p_month DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date TIMESTAMP WITH TIME ZONE;
    v_end_date TIMESTAMP WITH TIME ZONE;
    v_result JSONB;
    v_summary JSONB;
    v_peruntukan_breakdown JSONB;
    v_vendor_breakdown JSONB;
    v_issues_by_category JSONB;
    v_unit_name TEXT;
BEGIN
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    SELECT u.unit_name INTO v_unit_name FROM units u WHERE u.unit_code = p_unit_code;

    -- 1. Summary
    SELECT jsonb_build_object(
        'unit_code', p_unit_code,
        'unit_name', COALESCE(v_unit_name, p_unit_code),
        'total_equipment', COUNT(*),
        'total_personal', COUNT(*) FILTER (WHERE em.jenis = 'Personal'),
        'total_regu', COUNT(*) FILTER (WHERE em.jenis = 'Regu'),
        'avg_score', ROUND(COALESCE(AVG(va.nilai), 0)::NUMERIC, 2),
        'avg_personal', ROUND(COALESCE(AVG(va.nilai) FILTER (WHERE em.jenis = 'Personal'), 0)::NUMERIC, 2),
        'avg_regu', ROUND(COALESCE(AVG(va.nilai) FILTER (WHERE em.jenis = 'Regu'), 0)::NUMERIC, 2),
        'tl_fisik', COUNT(*) FILTER (WHERE va.kondisi_fisik = -1),
        'tb_fungsi', COUNT(*) FILTER (WHERE va.kondisi_fungsi = -1),
        'kontrak_ok', COUNT(*) FILTER (WHERE va.kesesuaian_kontrak >= 2),
        'kontrak_pct', CASE 
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE va.kesesuaian_kontrak >= 2)::NUMERIC / COUNT(*)) * 100, 2)
            ELSE 0
        END,
        'unique_teams', COUNT(DISTINCT va.team_id),
        'unique_personnel', COUNT(DISTINCT va.personnel_id)
    ) INTO v_summary
    FROM vendor_assets va
    INNER JOIN vendors v ON va.vendor_id = v.id
    LEFT JOIN equipment_master em ON va.equipment_id = em.id
    WHERE v.unit_code = p_unit_code
      AND va.owner_id IS NOT NULL
      AND va.last_assessment_date >= v_start_date
      AND va.last_assessment_date < v_end_date;

    -- 2. Breakdown per Peruntukan
    SELECT COALESCE(jsonb_agg(row_data ORDER BY total_equipment DESC), '[]'::jsonb)
    INTO v_peruntukan_breakdown
    FROM (
        SELECT jsonb_build_object(
            'peruntukan', COALESCE(p.deskripsi, 'Lainnya'),
            'jenis', COALESCE(em.jenis, '-'),
            'total_equipment', COUNT(*),
            'avg_score', ROUND(COALESCE(AVG(va.nilai), 0)::NUMERIC, 2),
            'tl_fisik', COUNT(*) FILTER (WHERE va.kondisi_fisik = -1),
            'tb_fungsi', COUNT(*) FILTER (WHERE va.kondisi_fungsi = -1)
        ) AS row_data,
        COUNT(*) AS total_equipment
        FROM vendor_assets va
        INNER JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN peruntukan p ON va.peruntukan_id = p.id
        LEFT JOIN equipment_master em ON va.equipment_id = em.id
        WHERE v.unit_code = p_unit_code
          AND va.owner_id IS NOT NULL
          AND va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
        GROUP BY p.deskripsi, em.jenis
    ) sub;

    -- 3. Breakdown per Vendor
    SELECT COALESCE(jsonb_agg(row_data ORDER BY total_equipment DESC), '[]'::jsonb)
    INTO v_vendor_breakdown
    FROM (
        SELECT jsonb_build_object(
            'vendor_name', COALESCE(v.vendor_name, 'Unknown'),
            'total_equipment', COUNT(*),
            'avg_score', ROUND(COALESCE(AVG(va.nilai), 0)::NUMERIC, 2),
            'tl_fisik', COUNT(*) FILTER (WHERE va.kondisi_fisik = -1),
            'tb_fungsi', COUNT(*) FILTER (WHERE va.kondisi_fungsi = -1)
        ) AS row_data,
        COUNT(*) AS total_equipment
        FROM vendor_assets va
        INNER JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN equipment_master em ON va.equipment_id = em.id
        WHERE v.unit_code = p_unit_code
          AND va.owner_id IS NOT NULL
          AND va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
        GROUP BY v.vendor_name
    ) sub;

    -- 4. Equipment Bermasalah by category
    SELECT COALESCE(jsonb_agg(category_data ORDER BY category_name), '[]'::jsonb)
    INTO v_issues_by_category
    FROM (
        SELECT 
            COALESCE(em.sub_kategori1, em.kategori, 'Lainnya') AS category_name,
            jsonb_build_object(
                'category', COALESCE(em.sub_kategori1, em.kategori, 'Lainnya'),
                'items', jsonb_agg(
                    jsonb_build_object(
                        'id', va.id,
                        'nama_alat', em.nama_alat,
                        'kategori', em.kategori,
                        'sub_kategori', em.sub_kategori1,
                        'vendor_name', v.vendor_name,
                        'peruntukan', p.deskripsi,
                        'jenis', em.jenis,
                        'kondisi_fisik', va.kondisi_fisik,
                        'kondisi_fungsi', va.kondisi_fungsi,
                        'nilai', va.nilai,
                        'last_assessment_date', va.last_assessment_date
                    ) ORDER BY em.nama_alat
                ),
                'total_items', COUNT(*),
                'tl_count', COUNT(*) FILTER (WHERE va.kondisi_fisik = -1),
                'tb_count', COUNT(*) FILTER (WHERE va.kondisi_fungsi = -1)
            ) AS category_data
        FROM vendor_assets va
        INNER JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN peruntukan p ON va.peruntukan_id = p.id
        LEFT JOIN equipment_master em ON va.equipment_id = em.id
        WHERE v.unit_code = p_unit_code
          AND va.owner_id IS NOT NULL
          AND va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
          AND (va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1)
        GROUP BY COALESCE(em.sub_kategori1, em.kategori, 'Lainnya')
    ) sub;

    -- Build final result
    v_result := jsonb_build_object(
        'summary', v_summary,
        'peruntukan_breakdown', v_peruntukan_breakdown,
        'vendor_breakdown', v_vendor_breakdown,
        'issues_by_category', v_issues_by_category,
        'period', to_char(v_start_date, 'Month YYYY')
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_unit_report(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_unit_report(TEXT, DATE) TO anon;

-- ============================================================================
COMMENT ON FUNCTION fn_dashboard_stats(DATE) IS 'Dashboard stats: dari vendor_assets unik per owner_id+equipment_id';
COMMENT ON FUNCTION fn_unit_recap(DATE) IS 'Unit recap: dari vendor_assets unik per owner_id+equipment_id';
COMMENT ON FUNCTION fn_unit_report(TEXT, DATE) IS 'Unit report: dari vendor_assets unik per owner_id+equipment_id';
