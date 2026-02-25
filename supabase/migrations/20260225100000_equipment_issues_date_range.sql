-- ============================================================================
-- fn_equipment_issues: Add date range filter
-- Default: no filter (all data), optional start_date and end_date
-- ============================================================================

DROP FUNCTION IF EXISTS fn_equipment_issues();

CREATE FUNCTION fn_equipment_issues(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
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
      AND (p_start_date IS NULL OR va.last_assessment_date >= p_start_date)
      AND (p_end_date IS NULL OR va.last_assessment_date <= p_end_date)
    GROUP BY v.unit_code, v.unit_name
    HAVING COUNT(va.id) > 0
    ORDER BY COUNT(va.id) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_equipment_issues(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_equipment_issues(DATE, DATE) TO anon;

COMMENT ON FUNCTION fn_equipment_issues(DATE, DATE) IS 'Equipment bermasalah per unit with optional date range filter';
