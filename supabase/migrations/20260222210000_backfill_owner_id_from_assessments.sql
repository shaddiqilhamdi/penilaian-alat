-- Migration: Backfill owner_id dari tabel assessments & teams
-- Untuk baris yang owner_id masih NULL setelah migration pertama
-- (terjadi karena va.team_id atau va.personnel_id kosong)
--
-- Aturan:
--   kategori = 'Kendaraan' → owner_id = team_id
--     cari dari: va.team_id → assessments.team_id → teams via vendor/peruntukan
--
--   kategori lain → owner_id = personnel_id
--     cari dari: va.personnel_id → assessments.personnel_id

-- ============================================================
-- STEP 1: Kendaraan — ambil team_id dari assessments (subquery korelasi)
-- ============================================================
UPDATE vendor_assets va
SET owner_id = COALESCE(
    va.team_id,
    (SELECT a.team_id FROM assessments a WHERE a.id = va.last_assessment_id LIMIT 1)
)
FROM equipment_master em
WHERE em.id = va.equipment_id
  AND em.kategori = 'Kendaraan'
  AND va.owner_id IS NULL
  AND COALESCE(
    va.team_id,
    (SELECT a.team_id FROM assessments a WHERE a.id = va.last_assessment_id LIMIT 1)
  ) IS NOT NULL;

-- ============================================================
-- STEP 2: Non-Kendaraan — ambil personnel_id dari assessments
-- (kolom langsung di assessments, bukan assessment_personnel)
-- ============================================================
UPDATE vendor_assets va
SET owner_id = COALESCE(
    va.personnel_id,
    (SELECT a.personnel_id FROM assessments a WHERE a.id = va.last_assessment_id LIMIT 1)
)
FROM equipment_master em
WHERE em.id = va.equipment_id
  AND (em.kategori IS NULL OR em.kategori != 'Kendaraan')
  AND va.owner_id IS NULL
  AND COALESCE(
    va.personnel_id,
    (SELECT a.personnel_id FROM assessments a WHERE a.id = va.last_assessment_id LIMIT 1)
  ) IS NOT NULL;
