-- ============================================================================
-- Function: fn_unit_report
-- Description: Menghasilkan raport lengkap per unit untuk modal detail
-- Parameter: p_unit_code - kode unit, p_month - bulan (default: bulan ini)
-- Returns: JSONB dengan summary, breakdown peruntukan/vendor, dan issues
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_unit_report(
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
    -- Hitung range tanggal untuk bulan yang diminta
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    -- Get unit name
    SELECT unit_name INTO v_unit_name FROM units WHERE unit_code = p_unit_code;

    -- 1. Summary Statistics
    SELECT jsonb_build_object(
        'unit_code', p_unit_code,
        'unit_name', COALESCE(v_unit_name, p_unit_code),
        'total_equipment', COUNT(*),
        'total_personal', COUNT(*) FILTER (WHERE p.jenis = 'Personal'),
        'total_regu', COUNT(*) FILTER (WHERE p.jenis = 'Regu'),
        'avg_score', ROUND(COALESCE(AVG(va.nilai), 0)::NUMERIC, 2),
        'avg_personal', ROUND(COALESCE(AVG(va.nilai) FILTER (WHERE p.jenis = 'Personal'), 0)::NUMERIC, 2),
        'avg_regu', ROUND(COALESCE(AVG(va.nilai) FILTER (WHERE p.jenis = 'Regu'), 0)::NUMERIC, 2),
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
    LEFT JOIN peruntukan p ON va.peruntukan_id = p.id
    WHERE v.unit_code = p_unit_code
      AND va.last_assessment_date >= v_start_date
      AND va.last_assessment_date < v_end_date;

    -- 2. Breakdown per Peruntukan
    SELECT COALESCE(jsonb_agg(row_data ORDER BY total_equipment DESC), '[]'::jsonb)
    INTO v_peruntukan_breakdown
    FROM (
        SELECT jsonb_build_object(
            'peruntukan', COALESCE(p.deskripsi, 'Lainnya'),
            'jenis', COALESCE(p.jenis, '-'),
            'total_equipment', COUNT(*),
            'avg_score', ROUND(COALESCE(AVG(va.nilai), 0)::NUMERIC, 2),
            'tl_fisik', COUNT(*) FILTER (WHERE va.kondisi_fisik = -1),
            'tb_fungsi', COUNT(*) FILTER (WHERE va.kondisi_fungsi = -1)
        ) AS row_data,
        COUNT(*) AS total_equipment
        FROM vendor_assets va
        INNER JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN peruntukan p ON va.peruntukan_id = p.id
        WHERE v.unit_code = p_unit_code
          AND va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
        GROUP BY p.deskripsi, p.jenis
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
                        'jenis', p.jenis,
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

-- Grant akses
GRANT EXECUTE ON FUNCTION fn_unit_report(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_unit_report(TEXT, DATE) TO anon;

-- Comment
COMMENT ON FUNCTION fn_unit_report(TEXT, DATE) IS 'Menghasilkan raport lengkap per unit termasuk summary, breakdown, dan list equipment bermasalah grouped by sub_kategori1';
