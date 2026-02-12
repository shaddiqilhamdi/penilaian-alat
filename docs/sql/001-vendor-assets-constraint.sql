-- ============================================================
-- VENDOR ASSETS UNIQUE CONSTRAINT
-- Memastikan setiap alat fisik memiliki unique ID berdasarkan
-- kombinasi vendor + peruntukan + team/personnel + equipment
-- ============================================================

-- 1. Hapus data duplikat terlebih dahulu (jika ada)
-- Simpan hanya record terbaru berdasarkan last_assessment_date
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY vendor_id, peruntukan_id, team_id, personnel_id, equipment_id
               ORDER BY last_assessment_date DESC NULLS LAST, created_at DESC
           ) as rn
    FROM vendor_assets
)
DELETE FROM vendor_assets
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- 2. Buat unique constraint untuk kombinasi
-- Menggunakan COALESCE untuk handle NULL values (team_id atau personnel_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_assets_unique_combination 
ON vendor_assets (
    vendor_id, 
    peruntukan_id, 
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(personnel_id, '00000000-0000-0000-0000-000000000000'::uuid),
    equipment_id
);

-- 3. Tambahkan index untuk query performance
CREATE INDEX IF NOT EXISTS idx_vendor_assets_vendor_peruntukan 
ON vendor_assets (vendor_id, peruntukan_id);

CREATE INDEX IF NOT EXISTS idx_vendor_assets_team 
ON vendor_assets (team_id) WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_assets_personnel 
ON vendor_assets (personnel_id) WHERE personnel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_assets_last_assessment 
ON vendor_assets (last_assessment_date DESC NULLS LAST);

-- 4. Verifikasi constraint berhasil dibuat
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'vendor_assets' 
AND indexname LIKE 'idx_vendor_assets%';
