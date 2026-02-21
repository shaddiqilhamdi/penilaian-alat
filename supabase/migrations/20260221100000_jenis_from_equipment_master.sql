-- ============================================================================
-- Migration: Ubah sumber jenis dari peruntukan → equipment_master
-- Description: Semua RPC function yang menggunakan p.jenis (dari tabel peruntukan)
--              diubah menggunakan em.jenis (dari tabel equipment_master)
--              Relasi: vendor_assets.equipment_id → equipment_master.id (has jenis)
-- Affected: fn_dashboard_stats, fn_equipment_issues, fn_entry_realization,
--           fn_unit_recap, fn_unit_report
-- ============================================================================

-- ============================================================================
-- 1. fn_dashboard_stats
-- ============================================================================
DROP FUNCTION IF EXISTS fn_dashboard_stats(DATE);

CREATE FUNCTION fn_dashboard_stats(p_month DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    -- Dari assessments
    total_assessments BIGINT,
    personal_assessments BIGINT,
    regu_assessments BIGINT,
    unique_vendors BIGINT,
    unique_units BIGINT,
    total_units BIGINT,
    unique_teams BIGINT,
    unique_personnel BIGINT,
    -- Dari vendor_assets
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
    WITH peruntukan_jenis AS (
        -- Map peruntukan_id → jenis dari equipment_master
        SELECT DISTINCT ON (va.peruntukan_id) va.peruntukan_id, em.jenis
        FROM vendor_assets va
        JOIN equipment_master em ON va.equipment_id = em.id
        WHERE em.jenis IS NOT NULL
        ORDER BY va.peruntukan_id
    ),
    assessment_stats AS (
        SELECT 
            COUNT(DISTINCT a.id) AS total_assessments,
            COUNT(DISTINCT CASE WHEN pj.jenis = 'Personal' THEN a.id END) AS personal_assessments,
            COUNT(DISTINCT CASE WHEN pj.jenis = 'Regu' THEN a.id END) AS regu_assessments,
            COUNT(DISTINCT a.vendor_id) AS unique_vendors,
            COUNT(DISTINCT v.unit_code) AS unique_units,
            COUNT(DISTINCT a.team_id) AS unique_teams,
            COUNT(DISTINCT a.personnel_id) AS unique_personnel
        FROM assessments a
        LEFT JOIN vendors v ON a.vendor_id = v.id
        LEFT JOIN peruntukan_jenis pj ON a.peruntukan_id = pj.peruntukan_id
        WHERE a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
    ),
    asset_stats AS (
        SELECT 
            COUNT(va.id) AS total_equipment,
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
        WHERE va.last_assessment_date >= v_start_date
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
        s.total_equipment,
        s.total_rusak,
        ROUND(s.avg_score, 2),
        ROUND(s.avg_personal, 2),
        ROUND(s.avg_regu, 2),
        s.tidak_layak,
        s.tidak_layak_personal,
        s.tidak_layak_regu,
        s.tidak_berfungsi,
        s.tidak_berfungsi_personal,
        s.tidak_berfungsi_regu
    FROM assessment_stats a, asset_stats s, unit_count u;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_dashboard_stats(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_dashboard_stats(DATE) TO anon;

-- ============================================================================
-- 2. fn_equipment_issues
-- ============================================================================
DROP FUNCTION IF EXISTS fn_equipment_issues();

CREATE FUNCTION fn_equipment_issues()
RETURNS TABLE (
    unit_code TEXT,
    unit_name TEXT,
    tl_personal BIGINT,
    tl_regu BIGINT,
    tb_personal BIGINT,
    tb_regu BIGINT,
    total_issues BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.unit_code::TEXT,
        v.unit_name::TEXT,
        COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Personal' THEN 1 END) AS tl_personal,
        COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Regu' THEN 1 END) AS tl_regu,
        COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Personal' THEN 1 END) AS tb_personal,
        COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Regu' THEN 1 END) AS tb_regu,
        COUNT(va.id) AS total_issues
    FROM vendor_assets va
    INNER JOIN vendors v ON va.vendor_id = v.id
    LEFT JOIN equipment_master em ON va.equipment_id = em.id
    WHERE (va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1)
      AND va.last_assessment_date IS NOT NULL
    GROUP BY v.unit_code, v.unit_name
    HAVING COUNT(va.id) > 0
    ORDER BY COUNT(va.id) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_equipment_issues() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_equipment_issues() TO anon;

-- ============================================================================
-- 3. fn_entry_realization
-- ============================================================================
DROP FUNCTION IF EXISTS fn_entry_realization(DATE);

CREATE FUNCTION fn_entry_realization(p_month DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    unit_code TEXT,
    unit_name TEXT,
    personal_count BIGINT,
    regu_count BIGINT,
    total_count BIGINT
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
    WITH peruntukan_jenis AS (
        -- Map peruntukan_id → jenis dari equipment_master
        SELECT DISTINCT ON (va.peruntukan_id) va.peruntukan_id, em.jenis
        FROM vendor_assets va
        JOIN equipment_master em ON va.equipment_id = em.id
        WHERE em.jenis IS NOT NULL
        ORDER BY va.peruntukan_id
    )
    SELECT 
        v.unit_code::TEXT,
        v.unit_name::TEXT,
        COUNT(CASE WHEN pj.jenis = 'Personal' THEN 1 END) AS personal_count,
        COUNT(CASE WHEN pj.jenis = 'Regu' THEN 1 END) AS regu_count,
        COUNT(a.id) AS total_count
    FROM assessments a
    INNER JOIN vendors v ON a.vendor_id = v.id
    LEFT JOIN peruntukan_jenis pj ON a.peruntukan_id = pj.peruntukan_id
    WHERE a.tanggal_penilaian >= v_start_date
      AND a.tanggal_penilaian < v_end_date
    GROUP BY v.unit_code, v.unit_name
    HAVING COUNT(a.id) > 0
    ORDER BY COUNT(a.id) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_entry_realization(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_entry_realization(DATE) TO anon;

-- ============================================================================
-- 4. fn_unit_recap
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
    WITH asset_stats AS (
        SELECT 
            v.unit_code AS uc,
            v.unit_name AS un,
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
        WHERE va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
    ),
    unit_aggregates AS (
        SELECT 
            u.unit_code AS uc,
            u.unit_name AS un,
            COUNT(a.uc) AS total_eq,
            COUNT(DISTINCT a.team_id) AS total_tm,
            COUNT(DISTINCT a.personnel_id) AS total_ps,
            COALESCE(AVG(a.nilai), 0) AS avg_all,
            COALESCE(AVG(CASE WHEN a.equipment_jenis = 'Personal' THEN a.nilai END), 0) AS avg_p,
            COALESCE(AVG(CASE WHEN a.equipment_jenis = 'Regu' THEN a.nilai END), 0) AS avg_r,
            COUNT(CASE WHEN a.kondisi_fisik = -1 THEN 1 END) AS tl_f,
            COUNT(CASE WHEN a.kondisi_fungsi = -1 THEN 1 END) AS tb_f,
            COUNT(CASE WHEN a.kesesuaian_kontrak >= 2 THEN 1 END) AS k_ok
        FROM units u
        LEFT JOIN asset_stats a ON u.unit_code = a.uc
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
-- 5. fn_unit_report
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

    -- Get unit name
    SELECT unit_name INTO v_unit_name FROM units WHERE unit_code = p_unit_code;

    -- 1. Summary Statistics
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
        WHERE v.unit_code = p_unit_code
          AND va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
        GROUP BY v.vendor_name
    ) sub;

    -- 4. Equipment Bermasalah - Grouped by sub_kategori1
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
-- Comments
-- ============================================================================
COMMENT ON FUNCTION fn_dashboard_stats(DATE) IS 'Statistik utama dashboard: jenis dari equipment_master';
COMMENT ON FUNCTION fn_equipment_issues() IS 'Equipment bermasalah per unit: jenis dari equipment_master';
COMMENT ON FUNCTION fn_entry_realization(DATE) IS 'Realisasi entri per unit: jenis dari equipment_master';
COMMENT ON FUNCTION fn_unit_recap(DATE) IS 'Rekapitulasi per unit: jenis dari equipment_master';
COMMENT ON FUNCTION fn_unit_report(TEXT, DATE) IS 'Raport lengkap per unit: jenis dari equipment_master';
