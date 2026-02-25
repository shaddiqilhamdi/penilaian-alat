-- ============================================================================
-- Fix fn_daily_entry_per_unit: hanya hitung jumlah entri (assessment) per unit
-- ============================================================================

DROP FUNCTION IF EXISTS fn_daily_entry_per_unit(DATE);

CREATE FUNCTION fn_daily_entry_per_unit(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    unit_code TEXT,
    unit_name TEXT,
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
    SELECT
        v.unit_code::TEXT,
        v.unit_name::TEXT,
        COUNT(a.id) AS total_count
    FROM assessments a
    INNER JOIN vendors v ON a.vendor_id = v.id
    WHERE a.tanggal_penilaian >= v_start_ts
      AND a.tanggal_penilaian <  v_end_ts
    GROUP BY v.unit_code, v.unit_name
    HAVING COUNT(a.id) > 0
    ORDER BY v.unit_code ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_daily_entry_per_unit(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_daily_entry_per_unit(DATE) TO anon;

COMMENT ON FUNCTION fn_daily_entry_per_unit(DATE) IS 'Jumlah entri penilaian per unit pada tanggal tertentu';
