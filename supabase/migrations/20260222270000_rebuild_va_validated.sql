-- Migration: Rebuild vendor_assets dari assessments + assessment_items (HATI-HATI)
-- Validasi:
--   1. team_id harus ada di tabel teams (FK valid)
--   2. owner_id ditentukan per PERUNTUKAN: 
--      jika peruntukan punya alat kategori 'Kendaraan' → owner_id = team_id
--      jika tidak → owner_id = personnel_id
--   3. Tidak ada duplikat (owner_id + equipment_id unique)
--   4. Hanya INSERT yang belum ada

-- Peruntukan yang punya kendaraan (di-define sekali, pakai CTE)
WITH peruntukan_kendaraan AS (
    SELECT DISTINCT es.peruntukan_id
    FROM equipment_standards es
    INNER JOIN equipment_master em ON em.id = es.equipment_id
    WHERE em.kategori = 'Kendaraan'
),

-- Ambil assessment terbaru per owner + equipment
-- owner_id = team_id jika peruntukan punya kendaraan, personnel_id jika tidak
latest_per_owner AS (
    SELECT DISTINCT ON (owner_id, ai.equipment_id)
        a.vendor_id,
        a.peruntukan_id,
        a.team_id,
        a.personnel_id,
        -- Tentukan owner berdasarkan peruntukan
        CASE 
            WHEN pk.peruntukan_id IS NOT NULL THEN a.team_id
            ELSE a.personnel_id
        END AS owner_id,
        ai.equipment_id,
        ai.actual_qty,
        ai.required_qty,
        a.tanggal_penilaian,
        a.id AS assessment_id,
        ai.kesesuaian_kontrak,
        ai.kondisi_fisik,
        ai.kondisi_fungsi,
        ai.score_item
    FROM assessment_items ai
    INNER JOIN assessments a ON a.id = ai.assessment_id
    LEFT JOIN peruntukan_kendaraan pk ON pk.peruntukan_id = a.peruntukan_id
    WHERE 
        -- Owner harus bisa ditentukan
        CASE 
            WHEN pk.peruntukan_id IS NOT NULL THEN a.team_id
            ELSE a.personnel_id
        END IS NOT NULL
        -- team_id harus valid: ada di tabel teams (atau NULL)
        AND (a.team_id IS NULL OR EXISTS (SELECT 1 FROM teams t WHERE t.id = a.team_id))
        -- personnel_id harus valid: ada di tabel personnel (atau NULL)
        AND (a.personnel_id IS NULL OR EXISTS (SELECT 1 FROM personnel p WHERE p.id = a.personnel_id))
    ORDER BY 
        CASE 
            WHEN pk.peruntukan_id IS NOT NULL THEN a.team_id
            ELSE a.personnel_id
        END,
        ai.equipment_id,
        a.tanggal_penilaian DESC,
        a.created_at DESC
)

-- INSERT hanya yang belum ada di vendor_assets
INSERT INTO vendor_assets (
    vendor_id,
    peruntukan_id,
    team_id,
    personnel_id,
    owner_id,
    equipment_id,
    realisasi_qty,
    distribution_date,
    last_assessment_id,
    last_assessment_date,
    kesesuaian_kontrak,
    kondisi_fisik,
    kondisi_fungsi,
    nilai,
    status_kesesuaian
)
SELECT 
    lpo.vendor_id,
    lpo.peruntukan_id,
    lpo.team_id,
    lpo.personnel_id,
    lpo.owner_id,
    lpo.equipment_id,
    lpo.actual_qty,
    lpo.tanggal_penilaian,
    lpo.assessment_id,
    lpo.tanggal_penilaian,
    lpo.kesesuaian_kontrak,
    lpo.kondisi_fisik,
    lpo.kondisi_fungsi,
    lpo.score_item,
    CASE WHEN lpo.actual_qty >= lpo.required_qty THEN 'Sesuai' ELSE 'Tidak Sesuai' END
FROM latest_per_owner lpo
WHERE NOT EXISTS (
    SELECT 1 FROM vendor_assets va
    WHERE va.owner_id = lpo.owner_id
      AND va.equipment_id = lpo.equipment_id
);
