-- ============================================================================
-- Fix fn_up3_vendor_recap: group by vendor+peruntukan only (no jenis split)
-- Problem: combos CTE included eq_jenis in DISTINCT, causing duplicate rows
--          when same peruntukan has equipment with different jenis values.
-- ============================================================================

DROP FUNCTION IF EXISTS fn_up3_vendor_recap(TEXT, UUID, DATE);

CREATE FUNCTION fn_up3_vendor_recap(
    p_unit_code TEXT DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_month DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    vendor_id UUID,
    vendor_name TEXT,
    peruntukan_id TEXT,
    peruntukan TEXT,
    jenis TEXT,
    jumlah BIGINT,
    equipment_count BIGINT,
    avg_score NUMERIC(4,2),
    tidak_layak BIGINT,
    tidak_berfungsi BIGINT,
    kontrak_ok BIGINT,
    kontrak_pct NUMERIC(5,2)
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
    ),
    -- Get unique vendor+peruntukan combos from equipment_standards
    -- Pick ONE jenis per combo using MODE (most frequent) 
    combos AS (
        SELECT
            es.vendor_id,
            es.peruntukan_id,
            vn.vendor_name,
            COALESCE(pr.deskripsi, '-') AS peruntukan_desc,
            MODE() WITHIN GROUP (ORDER BY em.jenis) AS eq_jenis
        FROM equipment_standards es
        JOIN vendors vn ON es.vendor_id = vn.id
        LEFT JOIN peruntukan pr ON es.peruntukan_id = pr.id
        LEFT JOIN equipment_master em ON es.equipment_id = em.id
        WHERE es.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY es.vendor_id, es.peruntukan_id, vn.vendor_name, pr.deskripsi
    ),
    -- Count teams per vendor+peruntukan
    team_counts AS (
        SELECT t.vendor_id, t.peruntukan_id, COUNT(*) AS cnt
        FROM teams t
        WHERE t.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY t.vendor_id, t.peruntukan_id
    ),
    -- Count personnel per vendor+peruntukan
    person_counts AS (
        SELECT p.vendor_id, p.peruntukan_id, COUNT(*) AS cnt
        FROM personnel p
        WHERE p.vendor_id IN (SELECT id FROM vendor_ids)
        GROUP BY p.vendor_id, p.peruntukan_id
    ),
    -- Aggregate vendor_assets per vendor+peruntukan (current month)
    asset_agg AS (
        SELECT
            va.vendor_id,
            va.peruntukan_id,
            COUNT(va.id) AS eq_cnt,
            COALESCE(AVG(va.nilai), 0) AS avg_val,
            COUNT(CASE WHEN va.kondisi_fisik = -1 THEN 1 END) AS tl,
            COUNT(CASE WHEN va.kondisi_fungsi = -1 THEN 1 END) AS tb,
            COUNT(CASE WHEN va.kesesuaian_kontrak = 2 THEN 1 END) AS k_ok
        FROM vendor_assets va
        WHERE va.vendor_id IN (SELECT id FROM vendor_ids)
          AND va.last_assessment_date IS NOT NULL
          AND va.last_assessment_date >= v_start
          AND va.last_assessment_date < v_end
        GROUP BY va.vendor_id, va.peruntukan_id
    )
    SELECT
        c.vendor_id,
        c.vendor_name::TEXT,
        c.peruntukan_id::TEXT,
        c.peruntukan_desc::TEXT                   AS peruntukan,
        COALESCE(c.eq_jenis, '-')::TEXT           AS jenis,
        CASE
            WHEN c.eq_jenis = 'Regu'     THEN COALESCE(tc.cnt, 0)
            WHEN c.eq_jenis = 'Personal' THEN COALESCE(pc.cnt, 0)
            ELSE 0
        END                                       AS jumlah,
        COALESCE(aa.eq_cnt, 0)                    AS equipment_count,
        ROUND(COALESCE(aa.avg_val, 0), 2)         AS avg_score,
        COALESCE(aa.tl, 0)                         AS tidak_layak,
        COALESCE(aa.tb, 0)                         AS tidak_berfungsi,
        COALESCE(aa.k_ok, 0)                       AS kontrak_ok,
        CASE WHEN COALESCE(aa.eq_cnt, 0) > 0
             THEN ROUND((COALESCE(aa.k_ok, 0)::NUMERIC / aa.eq_cnt) * 100, 2)
             ELSE 0 END                            AS kontrak_pct
    FROM combos c
    LEFT JOIN team_counts tc   ON c.vendor_id = tc.vendor_id AND c.peruntukan_id = tc.peruntukan_id
    LEFT JOIN person_counts pc ON c.vendor_id = pc.vendor_id AND c.peruntukan_id = pc.peruntukan_id
    LEFT JOIN asset_agg aa     ON c.vendor_id = aa.vendor_id AND c.peruntukan_id = aa.peruntukan_id
    ORDER BY c.vendor_name, c.peruntukan_desc;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_up3_vendor_recap(TEXT, UUID, DATE) TO anon;

COMMENT ON FUNCTION fn_up3_vendor_recap(TEXT, UUID, DATE) IS
    'UP3 vendor recap table. Grouped by vendor+peruntukan (no jenis split).';
