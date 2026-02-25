-- Migration: Full rebuild vendor_assets dari assessments + assessment_items
-- Karena tabel kosong, kita rebuild dari awal.
-- Tidak perlu NOT EXISTS karena tabel kosong.

-- STEP 1: Drop constraint sementara
DROP INDEX IF EXISTS idx_vendor_assets_owner_equipment;

-- STEP 2: Hapus semua data lama (jika ada sisa)
TRUNCATE vendor_assets;

-- STEP 3: Rebuild dari assessments
-- owner_id = team_id jika peruntukan punya alat kategori 'Kendaraan'
-- owner_id = personnel_id jika tidak
-- Ambil data assessment TERBARU per owner + equipment
-- Validasi: team_id harus ada di tabel teams, personnel_id di tabel personnel
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
    vendor_id,
    peruntukan_id,
    team_id,
    personnel_id,
    owner_id,
    equipment_id,
    actual_qty,
    tanggal_penilaian,
    assessment_id,
    tanggal_penilaian,
    kesesuaian_kontrak,
    kondisi_fisik,
    kondisi_fungsi,
    score_item,
    CASE WHEN actual_qty >= required_qty THEN 'Sesuai' ELSE 'Tidak Sesuai' END
FROM (
    SELECT DISTINCT ON (
        CASE 
            WHEN pk.peruntukan_id IS NOT NULL THEN a.team_id
            ELSE a.personnel_id
        END,
        ai.equipment_id
    )
        a.vendor_id,
        a.peruntukan_id,
        a.team_id,
        a.personnel_id,
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
    LEFT JOIN (
        -- Peruntukan yang punya equipment berkategori 'Kendaraan'
        SELECT DISTINCT es.peruntukan_id
        FROM equipment_standards es
        INNER JOIN equipment_master em ON em.id = es.equipment_id
        WHERE em.kategori = 'Kendaraan'
    ) pk ON pk.peruntukan_id = a.peruntukan_id
    -- Validasi: team_id harus ada di tabel teams
    LEFT JOIN teams t ON t.id = a.team_id
    -- Validasi: personnel_id harus ada di tabel personnel
    LEFT JOIN personnel p ON p.id = a.personnel_id
    WHERE 
        -- Owner harus bisa ditentukan
        CASE 
            WHEN pk.peruntukan_id IS NOT NULL THEN a.team_id
            ELSE a.personnel_id
        END IS NOT NULL
        -- Validasi FK: jika pakai team_id, harus ada di teams
        AND (
            (pk.peruntukan_id IS NOT NULL AND t.id IS NOT NULL)
            OR
            (pk.peruntukan_id IS NULL AND p.id IS NOT NULL)
        )
    ORDER BY 
        CASE 
            WHEN pk.peruntukan_id IS NOT NULL THEN a.team_id
            ELSE a.personnel_id
        END,
        ai.equipment_id,
        a.tanggal_penilaian DESC,
        a.created_at DESC
) sub;

-- STEP 4: Recreate unique constraint
CREATE UNIQUE INDEX idx_vendor_assets_owner_equipment
ON vendor_assets (owner_id, equipment_id)
WHERE owner_id IS NOT NULL;
