-- ============================================================================
-- fn_daily_entry_per_unit: Entri penilaian per unit pada tanggal tertentu
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_daily_entry_per_unit(p_date DATE DEFAULT CURRENT_DATE)
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
    v_start_ts TIMESTAMP WITH TIME ZONE;
    v_end_ts   TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start_ts := p_date::TIMESTAMP WITH TIME ZONE;
    v_end_ts   := (p_date + INTERVAL '1 day')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH peruntukan_jenis AS (
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
        COUNT(CASE WHEN pj.jenis = 'Regu'     THEN 1 END) AS regu_count,
        COUNT(a.id) AS total_count
    FROM assessments a
    INNER JOIN vendors v ON a.vendor_id = v.id
    LEFT JOIN peruntukan_jenis pj ON a.peruntukan_id = pj.peruntukan_id
    WHERE a.tanggal_penilaian >= v_start_ts
      AND a.tanggal_penilaian <  v_end_ts
    GROUP BY v.unit_code, v.unit_name
    HAVING COUNT(a.id) > 0
    ORDER BY v.unit_code ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_daily_entry_per_unit(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_daily_entry_per_unit(DATE) TO anon;

COMMENT ON FUNCTION fn_daily_entry_per_unit(DATE) IS 'Entri penilaian per unit pada tanggal tertentu, urut kode unit ascending';
