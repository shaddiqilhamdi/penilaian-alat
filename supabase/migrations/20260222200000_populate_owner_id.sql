-- Migration: Populate owner_id pada vendor_assets
-- owner_id = team_id jika equipment.kategori = 'Kendaraan'
-- owner_id = personnel_id (dari assessments) jika bukan Kendaraan
-- Catatan: personnel_id diambil dari kolom assessments, bukan assessment_personnel

UPDATE vendor_assets va
SET owner_id = CASE
    WHEN em.kategori = 'Kendaraan' THEN va.team_id
    ELSE va.personnel_id
END
FROM equipment_master em
WHERE em.id = va.equipment_id
  AND va.owner_id IS NULL;
