-- ============================================================================
-- RPC: fn_up3_unfulfilled_contracts
-- Daftar alat yang belum sesuai kontrak (kesesuaian_kontrak < 2)
-- untuk vendor-vendor di unit tertentu atau vendor tertentu.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_up3_unfulfilled_contracts(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_month DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    asset_id UUID,
    nama_alat TEXT,
    kategori TEXT,
    sub_kategori TEXT,
    vendor_name TEXT,
    peruntukan TEXT,
    eq_jenis TEXT,
    required_qty INTEGER,
    realisasi_qty INTEGER,
    selisih INTEGER,
    owner_label TEXT,
    owner_type TEXT,
    last_assessment_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start TIMESTAMP WITH TIME ZONE;
    v_end   TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end   := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH vendor_ids AS (
        SELECT v.id
        FROM vendors v
        WHERE (p_vendor_id IS NOT NULL AND v.id = p_vendor_id)
           OR (p_vendor_id IS NULL AND p_unit_code IS NOT NULL AND v.unit_code = p_unit_code)
    )
    SELECT
        va.id                                               AS asset_id,
        em.nama_alat::TEXT,
        COALESCE(em.kategori, '-')::TEXT                    AS kategori,
        COALESCE(em.sub_kategori1, '-')::TEXT               AS sub_kategori,
        vn.vendor_name::TEXT,
        COALESCE(pr.deskripsi, '-')::TEXT                   AS peruntukan,
        COALESCE(em.jenis, '-')::TEXT                       AS eq_jenis,
        COALESCE(ai.required_qty, 0)                        AS required_qty,
        COALESCE(va.realisasi_qty, 0)                       AS realisasi_qty,
        COALESCE(ai.required_qty, 0) - COALESCE(va.realisasi_qty, 0) AS selisih,
        CASE
            WHEN va.owner_id = va.team_id AND va.team_id IS NOT NULL
                THEN COALESCE(t.nomor_polisi, t.id::TEXT)
            ELSE COALESCE(per.nama_personil, per.nik, '-')
        END::TEXT                                           AS owner_label,
        CASE
            WHEN va.owner_id = va.team_id AND va.team_id IS NOT NULL THEN 'tim'
            ELSE 'personil'
        END::TEXT                                           AS owner_type,
        va.last_assessment_date
    FROM vendor_assets va
    INNER JOIN vendors vn ON va.vendor_id = vn.id
    LEFT JOIN peruntukan pr ON va.peruntukan_id = pr.id
    LEFT JOIN equipment_master em ON va.equipment_id = em.id
    LEFT JOIN teams t ON t.id = va.team_id
    LEFT JOIN personnel per ON per.id = va.personnel_id
    LEFT JOIN assessment_items ai
        ON ai.assessment_id = va.last_assessment_id
        AND ai.equipment_id = va.equipment_id
    WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
      AND va.owner_id IS NOT NULL
      AND va.last_assessment_date >= v_start
      AND va.last_assessment_date < v_end
      AND va.kesesuaian_kontrak < 2
    ORDER BY vn.vendor_name, COALESCE(pr.deskripsi, '-'), em.nama_alat
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, DATE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, DATE, INTEGER) TO anon;

COMMENT ON FUNCTION fn_up3_unfulfilled_contracts(TEXT, UUID, DATE, INTEGER) IS
    'Daftar alat yang belum sesuai kontrak (kesesuaian_kontrak < 2) untuk dashboard UP3.';
