-- ============================================================================
-- Fix fn_equipment_issues: total_issues harus COUNT(*) = jumlah item unik
-- Bukan TL+TB yang double-count item dengan kedua masalah
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_equipment_issues(
    p_month DATE DEFAULT CURRENT_DATE
)
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
DECLARE
    v_start_date TIMESTAMP WITH TIME ZONE;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    SELECT 
        v.unit_code::TEXT,
        v.unit_name::TEXT,
        COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Personal' THEN 1 END) AS tl_personal,
        COUNT(CASE WHEN va.kondisi_fisik = -1 AND em.jenis = 'Regu' THEN 1 END) AS tl_regu,
        COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Personal' THEN 1 END) AS tb_personal,
        COUNT(CASE WHEN va.kondisi_fungsi = -1 AND em.jenis = 'Regu' THEN 1 END) AS tb_regu,
        -- COUNT(*) = jumlah item unik bermasalah (bukan TL+TB)
        COUNT(*) AS total_issues
    FROM vendor_assets va
    INNER JOIN vendors v ON va.vendor_id = v.id
    LEFT JOIN equipment_master em ON va.equipment_id = em.id
    WHERE (va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1)
      AND va.owner_id IS NOT NULL
      AND va.last_assessment_date >= v_start_date
      AND va.last_assessment_date < v_end_date
    GROUP BY v.unit_code, v.unit_name
    HAVING COUNT(*) > 0
    ORDER BY COUNT(*) DESC;
END;
$$;
