-- ============================================================================
-- Migration: Fix vendor_assets data + reporting functions
-- 
-- Problem Analysis:
--   vendor_assets has 8005 records, but 6779 (84.7%) are "legacy" records
--   where BOTH team_id AND personnel_id are set. These were created by the
--   old edge function & populate script BEFORE the Regu/Personal split.
--   After the edge function was updated:
--     - Regu items: team_id only, personnel_id NULL
--     - Personal items: personnel_id only, team_id NULL  
--   The old records were never cleaned up.
--
--   Additionally, the new edge function incorrectly sets team_id=NULL for
--   Personal items in team assessments, losing the team association.
--
-- Solution:
--   Phase 1: Restore team_id for new-format Personal items
--   Phase 2: Clean Regu duplicates (legacy → set personnel_id=NULL)
--   Phase 3: Deduplicate Personal items
--   Phase 4: Update ALL reporting functions to count equipment per 
--            assessment-target (team/person), not per raw VA row
-- ============================================================================

-- ============================================================================
-- PHASE 1: Restore team_id for new-format Personal items
-- New edge function set team_id=NULL for Personal items, losing team context.
-- Restore it from the assessment that created the record.
-- ============================================================================
UPDATE vendor_assets va
SET team_id = a.team_id
FROM assessments a
WHERE va.last_assessment_id = a.id
  AND va.team_id IS NULL
  AND va.personnel_id IS NOT NULL
  AND a.team_id IS NOT NULL
  AND NOT EXISTS (
    -- Skip if it would create a duplicate with existing record
    SELECT 1 FROM vendor_assets va2
    WHERE va2.vendor_id = va.vendor_id
      AND va2.peruntukan_id = va.peruntukan_id
      AND va2.team_id = a.team_id
      AND va2.personnel_id = va.personnel_id
      AND va2.equipment_id = va.equipment_id
      AND va2.id != va.id
  );

-- ============================================================================
-- PHASE 2: Clean Regu equipment records
-- For jenis='Regu', each equipment should be 1 row per team (no personnel_id)
-- ============================================================================

-- 2a: Delete legacy Regu records that have new-format counterparts
DELETE FROM vendor_assets va
USING equipment_master em
WHERE em.id = va.equipment_id
  AND em.jenis = 'Regu'
  AND va.team_id IS NOT NULL
  AND va.personnel_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM vendor_assets va2
    WHERE va2.vendor_id = va.vendor_id
      AND va2.peruntukan_id = va.peruntukan_id
      AND va2.team_id = va.team_id
      AND va2.personnel_id IS NULL
      AND va2.equipment_id = va.equipment_id
  );

-- 2b: Deduplicate remaining legacy Regu items per (vendor, peruntukan, team, equipment)
-- Multiple persons may have created rows for same team equipment — keep latest only
DELETE FROM vendor_assets
WHERE id IN (
  SELECT id FROM (
    SELECT va.id,
      ROW_NUMBER() OVER (
        PARTITION BY va.vendor_id, va.peruntukan_id, va.team_id, va.equipment_id
        ORDER BY va.last_assessment_date DESC NULLS LAST
      ) as rn
    FROM vendor_assets va
    JOIN equipment_master em ON em.id = va.equipment_id AND em.jenis = 'Regu'
    WHERE va.team_id IS NOT NULL AND va.personnel_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- 2c: Transform remaining legacy Regu items — set personnel_id = NULL
UPDATE vendor_assets va
SET personnel_id = NULL
FROM equipment_master em
WHERE em.id = va.equipment_id
  AND em.jenis = 'Regu'
  AND va.team_id IS NOT NULL
  AND va.personnel_id IS NOT NULL;

-- ============================================================================
-- PHASE 3: Deduplicate Personal items
-- After Phase 1 restored team_id, some new-format records may now duplicate 
-- legacy records. Keep the one with the most recent assessment.
-- ============================================================================
DELETE FROM vendor_assets
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY vendor_id, peruntukan_id,
          COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(personnel_id, '00000000-0000-0000-0000-000000000000'::uuid),
          equipment_id
        ORDER BY last_assessment_date DESC NULLS LAST
      ) as rn
    FROM vendor_assets
    WHERE personnel_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- ============================================================================
-- PHASE 4: Update ALL reporting functions
-- Change counting from raw vendor_assets rows to assessment-based counting.
-- This ensures "total_equipment" = teams × items_per_team (not persons × items)
-- ============================================================================

-- ============================================================================
-- 4.1: fn_dashboard_stats
-- ============================================================================
DROP FUNCTION IF EXISTS fn_dashboard_stats(DATE);

CREATE FUNCTION fn_dashboard_stats(p_month DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    total_assessments BIGINT,
    personal_assessments BIGINT,
    regu_assessments BIGINT,
    unique_vendors BIGINT,
    unique_units BIGINT,
    total_units BIGINT,
    unique_teams BIGINT,
    unique_personnel BIGINT,
    total_equipment BIGINT,
    total_rusak BIGINT,
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
    WITH peruntukan_jenis AS (
        SELECT DISTINCT ON (va.peruntukan_id) va.peruntukan_id, em.jenis
        FROM vendor_assets va
        JOIN equipment_master em ON va.equipment_id = em.id
        WHERE em.jenis IS NOT NULL
        ORDER BY va.peruntukan_id
    ),
    assessment_stats AS (
        SELECT 
            COUNT(DISTINCT a.id) AS total_assessments,
            COUNT(DISTINCT CASE WHEN pj.jenis = 'Personal' THEN a.id END) AS personal_assessments,
            COUNT(DISTINCT CASE WHEN pj.jenis = 'Regu' THEN a.id END) AS regu_assessments,
            COUNT(DISTINCT a.vendor_id) AS unique_vendors,
            COUNT(DISTINCT v.unit_code) AS unique_units,
            COUNT(DISTINCT a.team_id) AS unique_teams,
            COUNT(DISTINCT a.personnel_id) AS unique_personnel
        FROM assessments a
        LEFT JOIN vendors v ON a.vendor_id = v.id
        LEFT JOIN peruntukan_jenis pj ON a.peruntukan_id = pj.peruntukan_id
        WHERE a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
    ),
    -- Get latest assessment per target (team or person)
    -- For team assessments: group by team (not per person)
    -- For personal assessments: group by person
    latest_target_assessments AS (
        SELECT DISTINCT ON (
            a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text)
        )
        a.id AS assessment_id
        FROM assessments a
        WHERE a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
        ORDER BY a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text),
            a.tanggal_penilaian DESC
    ),
    -- Count equipment from assessment_items of latest assessments per target
    item_stats AS (
        SELECT 
            COUNT(ai.id) AS total_equipment,
            COUNT(CASE WHEN ai.kondisi_fisik = -1 OR ai.kondisi_fungsi = -1 THEN 1 END) AS total_rusak,
            COALESCE(AVG(ai.score_item), 0) AS avg_score,
            COALESCE(AVG(CASE WHEN em.jenis = 'Personal' THEN ai.score_item END), 0) AS avg_personal,
            COALESCE(AVG(CASE WHEN em.jenis = 'Regu' THEN ai.score_item END), 0) AS avg_regu,
            COUNT(CASE WHEN ai.kondisi_fisik = -1 THEN 1 END) AS tidak_layak,
            COUNT(CASE WHEN ai.kondisi_fisik = -1 AND em.jenis = 'Personal' THEN 1 END) AS tidak_layak_personal,
            COUNT(CASE WHEN ai.kondisi_fisik = -1 AND em.jenis = 'Regu' THEN 1 END) AS tidak_layak_regu,
            COUNT(CASE WHEN ai.kondisi_fungsi = -1 THEN 1 END) AS tidak_berfungsi,
            COUNT(CASE WHEN ai.kondisi_fungsi = -1 AND em.jenis = 'Personal' THEN 1 END) AS tidak_berfungsi_personal,
            COUNT(CASE WHEN ai.kondisi_fungsi = -1 AND em.jenis = 'Regu' THEN 1 END) AS tidak_berfungsi_regu
        FROM latest_target_assessments lta
        JOIN assessment_items ai ON ai.assessment_id = lta.assessment_id
        LEFT JOIN equipment_master em ON ai.equipment_id = em.id
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
    FROM assessment_stats a, item_stats s, unit_count u;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_dashboard_stats(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_dashboard_stats(DATE) TO anon;

-- ============================================================================
-- 4.2: fn_equipment_issues (unchanged - only lists problematic items)
-- ============================================================================
-- No change needed - this function only counts items WHERE kondisi = -1
-- The issue list is per-item detail, not aggregate totals

-- ============================================================================
-- 4.3: fn_entry_realization (unchanged - counts assessments, not equipment)
-- ============================================================================
-- No change needed - already counts from assessments table

-- ============================================================================
-- 4.4: fn_unit_recap
-- ============================================================================
DROP FUNCTION IF EXISTS fn_unit_recap(DATE);

CREATE FUNCTION fn_unit_recap(p_month DATE DEFAULT CURRENT_DATE)
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
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    RETURN QUERY
    WITH latest_target_assessments AS (
        SELECT DISTINCT ON (
            a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text)
        )
        a.id AS assessment_id,
        v.unit_code AS uc,
        a.team_id,
        a.personnel_id
        FROM assessments a
        INNER JOIN vendors v ON a.vendor_id = v.id
        WHERE a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
        ORDER BY a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text),
            a.tanggal_penilaian DESC
    ),
    item_stats AS (
        SELECT 
            lta.uc,
            lta.team_id,
            lta.personnel_id,
            ai.score_item AS nilai,
            ai.kondisi_fisik,
            ai.kondisi_fungsi,
            ai.kesesuaian_kontrak,
            em.jenis AS equipment_jenis
        FROM latest_target_assessments lta
        JOIN assessment_items ai ON ai.assessment_id = lta.assessment_id
        LEFT JOIN equipment_master em ON ai.equipment_id = em.id
    ),
    unit_aggregates AS (
        SELECT 
            u.unit_code AS uc,
            u.unit_name AS un,
            COUNT(ist.uc) AS total_eq,
            COUNT(DISTINCT ist.team_id) AS total_tm,
            COUNT(DISTINCT ist.personnel_id) AS total_ps,
            COALESCE(AVG(ist.nilai), 0) AS avg_all,
            COALESCE(AVG(CASE WHEN ist.equipment_jenis = 'Personal' THEN ist.nilai END), 0) AS avg_p,
            COALESCE(AVG(CASE WHEN ist.equipment_jenis = 'Regu' THEN ist.nilai END), 0) AS avg_r,
            COUNT(CASE WHEN ist.kondisi_fisik = -1 THEN 1 END) AS tl_f,
            COUNT(CASE WHEN ist.kondisi_fungsi = -1 THEN 1 END) AS tb_f,
            COUNT(CASE WHEN ist.kesesuaian_kontrak >= 2 THEN 1 END) AS k_ok
        FROM units u
        LEFT JOIN item_stats ist ON u.unit_code = ist.uc
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

GRANT EXECUTE ON FUNCTION fn_unit_recap(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_unit_recap(DATE) TO anon;

-- ============================================================================
-- 4.5: fn_unit_report
-- ============================================================================
DROP FUNCTION IF EXISTS fn_unit_report(TEXT, DATE);

CREATE FUNCTION fn_unit_report(
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
    v_start_date := date_trunc('month', p_month)::TIMESTAMP WITH TIME ZONE;
    v_end_date := (date_trunc('month', p_month) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;

    SELECT unit_name INTO v_unit_name FROM units WHERE unit_code = p_unit_code;

    -- 1. Summary Statistics (from latest assessment per target)
    WITH latest_target AS (
        SELECT DISTINCT ON (
            a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text)
        )
        a.id AS assessment_id,
        a.team_id,
        a.personnel_id
        FROM assessments a
        INNER JOIN vendors v ON a.vendor_id = v.id
        WHERE v.unit_code = p_unit_code
          AND a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
        ORDER BY a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text),
            a.tanggal_penilaian DESC
    )
    SELECT jsonb_build_object(
        'unit_code', p_unit_code,
        'unit_name', COALESCE(v_unit_name, p_unit_code),
        'total_equipment', COUNT(*),
        'total_personal', COUNT(*) FILTER (WHERE em.jenis = 'Personal'),
        'total_regu', COUNT(*) FILTER (WHERE em.jenis = 'Regu'),
        'avg_score', ROUND(COALESCE(AVG(ai.score_item), 0)::NUMERIC, 2),
        'avg_personal', ROUND(COALESCE(AVG(ai.score_item) FILTER (WHERE em.jenis = 'Personal'), 0)::NUMERIC, 2),
        'avg_regu', ROUND(COALESCE(AVG(ai.score_item) FILTER (WHERE em.jenis = 'Regu'), 0)::NUMERIC, 2),
        'tl_fisik', COUNT(*) FILTER (WHERE ai.kondisi_fisik = -1),
        'tb_fungsi', COUNT(*) FILTER (WHERE ai.kondisi_fungsi = -1),
        'kontrak_ok', COUNT(*) FILTER (WHERE ai.kesesuaian_kontrak >= 2),
        'kontrak_pct', CASE 
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE ai.kesesuaian_kontrak >= 2)::NUMERIC / COUNT(*)) * 100, 2)
            ELSE 0
        END,
        'unique_teams', COUNT(DISTINCT lt.team_id),
        'unique_personnel', COUNT(DISTINCT lt.personnel_id)
    ) INTO v_summary
    FROM latest_target lt
    JOIN assessment_items ai ON ai.assessment_id = lt.assessment_id
    LEFT JOIN equipment_master em ON ai.equipment_id = em.id;

    -- 2. Breakdown per Peruntukan (from latest assessment per target)
    WITH latest_target AS (
        SELECT DISTINCT ON (
            a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text)
        )
        a.id AS assessment_id,
        a.peruntukan_id
        FROM assessments a
        INNER JOIN vendors v ON a.vendor_id = v.id
        WHERE v.unit_code = p_unit_code
          AND a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
        ORDER BY a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text),
            a.tanggal_penilaian DESC
    )
    SELECT COALESCE(jsonb_agg(row_data ORDER BY total_equipment DESC), '[]'::jsonb)
    INTO v_peruntukan_breakdown
    FROM (
        SELECT jsonb_build_object(
            'peruntukan', COALESCE(p.deskripsi, 'Lainnya'),
            'jenis', COALESCE(em.jenis, '-'),
            'total_equipment', COUNT(*),
            'avg_score', ROUND(COALESCE(AVG(ai.score_item), 0)::NUMERIC, 2),
            'tl_fisik', COUNT(*) FILTER (WHERE ai.kondisi_fisik = -1),
            'tb_fungsi', COUNT(*) FILTER (WHERE ai.kondisi_fungsi = -1)
        ) AS row_data,
        COUNT(*) AS total_equipment
        FROM latest_target lt
        JOIN assessment_items ai ON ai.assessment_id = lt.assessment_id
        LEFT JOIN peruntukan p ON lt.peruntukan_id = p.id
        LEFT JOIN equipment_master em ON ai.equipment_id = em.id
        GROUP BY p.deskripsi, em.jenis
    ) sub;

    -- 3. Breakdown per Vendor (from latest assessment per target)
    WITH latest_target AS (
        SELECT DISTINCT ON (
            a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text)
        )
        a.id AS assessment_id,
        a.vendor_id
        FROM assessments a
        INNER JOIN vendors v ON a.vendor_id = v.id
        WHERE v.unit_code = p_unit_code
          AND a.tanggal_penilaian >= v_start_date
          AND a.tanggal_penilaian < v_end_date
        ORDER BY a.vendor_id, a.peruntukan_id,
            COALESCE(a.team_id::text, a.personnel_id::text),
            a.tanggal_penilaian DESC
    )
    SELECT COALESCE(jsonb_agg(row_data ORDER BY total_equipment DESC), '[]'::jsonb)
    INTO v_vendor_breakdown
    FROM (
        SELECT jsonb_build_object(
            'vendor_name', COALESCE(v.vendor_name, 'Unknown'),
            'total_equipment', COUNT(*),
            'avg_score', ROUND(COALESCE(AVG(ai.score_item), 0)::NUMERIC, 2),
            'tl_fisik', COUNT(*) FILTER (WHERE ai.kondisi_fisik = -1),
            'tb_fungsi', COUNT(*) FILTER (WHERE ai.kondisi_fungsi = -1)
        ) AS row_data,
        COUNT(*) AS total_equipment
        FROM latest_target lt
        JOIN assessment_items ai ON ai.assessment_id = lt.assessment_id
        INNER JOIN vendors v ON lt.vendor_id = v.id
        LEFT JOIN equipment_master em ON ai.equipment_id = em.id
        GROUP BY v.vendor_name
    ) sub;

    -- 4. Equipment Bermasalah - from vendor_assets (shows ALL per-person issues)
    -- Keep using vendor_assets here since we want per-person granular detail
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
                        'jenis', em.jenis,
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

GRANT EXECUTE ON FUNCTION fn_unit_report(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_unit_report(TEXT, DATE) TO anon;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION fn_dashboard_stats(DATE) IS 'Dashboard stats: count equipment per assessment-target (team/person), not per vendor_assets row';
COMMENT ON FUNCTION fn_unit_recap(DATE) IS 'Unit recap: count equipment per assessment-target (team/person)';
COMMENT ON FUNCTION fn_unit_report(TEXT, DATE) IS 'Unit report: count equipment per assessment-target (team/person), issues from vendor_assets';
