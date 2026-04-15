-- ============================================================================
-- Add peruntukan and kategori columns to fn_up3_equipment_issues
-- to match columns with fn_up3_unfulfilled_contracts
-- ============================================================================

DROP FUNCTION IF EXISTS fn_up3_equipment_issues(TEXT, UUID, INTEGER);

CREATE FUNCTION fn_up3_equipment_issues(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    asset_id UUID,
    last_assessment_date TIMESTAMPTZ,
    vendor_name TEXT,
    peruntukan TEXT,
    nama_alat TEXT,
    kategori TEXT,
    sub_kategori TEXT,
    eq_jenis TEXT,
    nomor_polisi TEXT,
    nama_personil TEXT,
    kondisi_fisik INTEGER,
    kondisi_fungsi INTEGER,
    nilai NUMERIC
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
        va.id                                    AS asset_id,
        va.last_assessment_date,
        vn.vendor_name::TEXT,
        COALESCE(pr.deskripsi, '-')::TEXT         AS peruntukan,
        em.nama_alat::TEXT,
        COALESCE(em.kategori, '-')::TEXT           AS kategori,
        COALESCE(em.sub_kategori1, '-')::TEXT      AS sub_kategori,
        em.jenis::TEXT                             AS eq_jenis,
        tm.nomor_polisi::TEXT,
        ps.nama_personil::TEXT,
        va.kondisi_fisik,
        va.kondisi_fungsi,
        va.nilai
    FROM vendor_assets va
    INNER JOIN vendors vn ON va.vendor_id = vn.id
    LEFT JOIN peruntukan pr ON va.peruntukan_id = pr.id
    LEFT JOIN equipment_master em ON va.equipment_id = em.id
    LEFT JOIN teams tm ON va.team_id = tm.id
    LEFT JOIN personnel ps ON va.personnel_id = ps.id
    WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
      AND (va.kondisi_fisik = -1 OR va.kondisi_fungsi = -1)
      AND va.last_assessment_date IS NOT NULL
    ORDER BY va.last_assessment_date DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_equipment_issues(TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_equipment_issues(TEXT, UUID, INTEGER) TO anon;

COMMENT ON FUNCTION fn_up3_equipment_issues(TEXT, UUID, INTEGER) IS
    'UP3 equipment issues list (TL Fisik / TB Fungsi) with peruntukan & kategori. Max p_limit rows, newest first.';
