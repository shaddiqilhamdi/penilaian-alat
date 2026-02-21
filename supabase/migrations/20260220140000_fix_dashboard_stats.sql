-- ============================================================================
-- Update fn_dashboard_stats - Tambah total_rusak untuk chart kondisi alat
-- ============================================================================

-- Drop existing function first (return type changed)
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
    total_rusak BIGINT,  -- Equipment dengan TL atau TB
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
            COUNT(DISTINCT CASE WHEN p.jenis = 'Personal' THEN a.id END) AS personal_assessments,
            COUNT(DISTINCT CASE WHEN p.jenis = 'Regu' THEN a.id END) AS regu_assessments,
            COUNT(DISTINCT a.vendor_id) AS unique_vendors,
            COUNT(DISTINCT v.unit_code) AS unique_units,
            COUNT(DISTINCT a.team_id) AS unique_teams,
            COUNT(DISTINCT a.personnel_id) AS unique_personnel
        FROM assessments a
        LEFT JOIN vendors v ON a.vendor_id = v.id
        LEFT JOIN peruntukan p ON a.peruntukan_id = p.id
        WHERE a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
    ),
    asset_stats AS (
        SELECT 
            COUNT(va.id) AS total_equipment,
            COUNT(CASE WHEN va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1 THEN 1 END) AS total_rusak,
            COALESCE(AVG(va.nilai), 0) AS avg_score,
            COALESCE(AVG(CASE WHEN p.jenis = 'Personal' THEN va.nilai END), 0) AS avg_personal,
            COALESCE(AVG(CASE WHEN p.jenis = 'Regu' THEN va.nilai END), 0) AS avg_regu,
            COUNT(CASE WHEN va.kondisi_fisik = -1 THEN 1 END) AS tidak_layak,
            COUNT(CASE WHEN va.kondisi_fisik = -1 AND p.jenis = 'Personal' THEN 1 END) AS tidak_layak_personal,
            COUNT(CASE WHEN va.kondisi_fisik = -1 AND p.jenis = 'Regu' THEN 1 END) AS tidak_layak_regu,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 THEN 1 END) AS tidak_berfungsi,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 AND p.jenis = 'Personal' THEN 1 END) AS tidak_berfungsi_personal,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 AND p.jenis = 'Regu' THEN 1 END) AS tidak_berfungsi_regu
        FROM vendor_assets va
        LEFT JOIN peruntukan p ON va.peruntukan_id = p.id
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
