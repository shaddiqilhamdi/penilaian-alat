-- Migration: Fix owner_id logic
-- BENAR: Jika PERUNTUKAN memiliki salah satu alat dengan kategori 'Kendaraan',
--        maka SEMUA item di peruntukan itu owner_id = team_id.
--        Jika tidak ada → owner_id = personnel_id.
-- SALAH (sebelumnya): Per-item cek kategori Kendaraan.

-- ============================================================
-- STEP 0: Drop unique constraint sementara (akan di-recreate setelah dedup)
-- ============================================================
DROP INDEX IF EXISTS idx_vendor_assets_owner_equipment;

-- ============================================================
-- STEP 1: Reset semua owner_id (mulai dari awal)
-- ============================================================
UPDATE vendor_assets SET owner_id = NULL;

-- ============================================================
-- STEP 2: Tentukan peruntukan mana yang punya Kendaraan
-- Lalu set owner_id berdasarkan itu
-- ============================================================

-- 2a: Peruntukan yang punya minimal 1 equipment berkategori 'Kendaraan'
--     → SEMUA item di peruntukan itu: owner_id = team_id
UPDATE vendor_assets va
SET owner_id = va.team_id
WHERE va.peruntukan_id IN (
    SELECT DISTINCT es.peruntukan_id
    FROM equipment_standards es
    INNER JOIN equipment_master em ON em.id = es.equipment_id
    WHERE em.kategori = 'Kendaraan'
)
AND va.team_id IS NOT NULL;

-- 2b: Peruntukan yang TIDAK punya equipment berkategori 'Kendaraan'
--     → owner_id = personnel_id
UPDATE vendor_assets va
SET owner_id = va.personnel_id
WHERE va.peruntukan_id NOT IN (
    SELECT DISTINCT es.peruntukan_id
    FROM equipment_standards es
    INNER JOIN equipment_master em ON em.id = es.equipment_id
    WHERE em.kategori = 'Kendaraan'
)
AND va.personnel_id IS NOT NULL
AND va.owner_id IS NULL;

-- 2c: Fallback — untuk row yang masih NULL, coba dari assessments
UPDATE vendor_assets va
SET owner_id = COALESCE(
    CASE WHEN va.peruntukan_id IN (
        SELECT DISTINCT es.peruntukan_id
        FROM equipment_standards es
        INNER JOIN equipment_master em ON em.id = es.equipment_id
        WHERE em.kategori = 'Kendaraan'
    ) THEN (SELECT a.team_id FROM assessments a WHERE a.id = va.last_assessment_id)
    ELSE (SELECT a.personnel_id FROM assessments a WHERE a.id = va.last_assessment_id)
    END
)
WHERE va.owner_id IS NULL;

-- ============================================================
-- STEP 3: Deduplicate — karena owner_id berubah, mungkin ada duplikat baru
-- Keep yang paling baru per owner_id + equipment_id
-- ============================================================
DELETE FROM vendor_assets
WHERE id IN (
    SELECT id FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY owner_id, equipment_id
                ORDER BY last_assessment_date DESC NULLS LAST, created_at DESC NULLS LAST
            ) AS rn
        FROM vendor_assets
        WHERE owner_id IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- ============================================================
-- STEP 4: Re-create unique constraint
-- ============================================================
CREATE UNIQUE INDEX idx_vendor_assets_owner_equipment
ON vendor_assets (owner_id, equipment_id)
WHERE owner_id IS NOT NULL;
