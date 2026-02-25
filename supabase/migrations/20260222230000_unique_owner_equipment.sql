-- Migration: Cleanse remaining duplicates + Add UNIQUE constraint
-- Step 1: Hapus duplikat yang tersisa (keep paling baru)
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

-- Step 2: Add UNIQUE constraint (partial index, hanya owner_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_assets_owner_equipment
ON vendor_assets (owner_id, equipment_id)
WHERE owner_id IS NOT NULL;
