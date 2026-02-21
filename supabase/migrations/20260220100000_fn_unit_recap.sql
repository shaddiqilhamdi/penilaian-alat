-- ============================================================================
-- Function: fn_unit_recap
-- Description: Menghitung rekapitulasi per unit untuk dashboard
-- Parameter: p_month - bulan yang diminta (default: bulan ini)
-- Returns: Data agregat per unit (16 rows untuk 16 unit)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_unit_recap(p_month DATE DEFAULT CURRENT_DATE)
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
    -- Hitung range tanggal untuk bulan yang diminta
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH asset_stats AS (
        -- Ambil semua vendor_assets bulan ini dengan info vendor dan peruntukan
        SELECT 
            v.unit_code AS uc,
            v.unit_name AS un,
            va.team_id,
            va.personnel_id,
            va.nilai,
            va.kondisi_fisik,
            va.kondisi_fungsi,
            va.kesesuaian_kontrak,
            p.jenis AS peruntukan_jenis
        FROM vendor_assets va
        INNER JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN peruntukan p ON va.peruntukan_id = p.id
        WHERE va.last_assessment_date >= v_start_date
          AND va.last_assessment_date < v_end_date
    ),
    unit_aggregates AS (
        -- Agregasi per unit
        SELECT 
            u.unit_code AS uc,
            u.unit_name AS un,
            COUNT(a.uc) AS total_eq,
            COUNT(DISTINCT a.team_id) AS total_tm,
            COUNT(DISTINCT a.personnel_id) AS total_ps,
            -- Average scores
            COALESCE(AVG(a.nilai), 0) AS avg_all,
            COALESCE(AVG(CASE WHEN a.peruntukan_jenis = 'Personal' THEN a.nilai END), 0) AS avg_p,
            COALESCE(AVG(CASE WHEN a.peruntukan_jenis = 'Regu' THEN a.nilai END), 0) AS avg_r,
            -- Kondisi counts
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

-- Grant akses untuk authenticated users dan anon
GRANT EXECUTE ON FUNCTION fn_unit_recap(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_unit_recap(DATE) TO anon;

-- Comment untuk dokumentasi
COMMENT ON FUNCTION fn_unit_recap(DATE) IS 'Menghitung rekapitulasi per unit untuk dashboard. Parameter: p_month (default: bulan ini). Returns: agregat per unit termasuk equipment, teams, personnel, scores, dan kondisi.';
