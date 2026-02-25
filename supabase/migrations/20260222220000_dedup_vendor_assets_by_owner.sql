-- Migration: Cleansing vendor_assets - deduplicate by owner_id + equipment_id
-- Jika ada alat (equipment_id) yang double dimiliki owner yang sama (owner_id),
-- simpan hanya yang paling baru (last_assessment_date DESC), hapus sisanya.
-- Hanya proses row yang owner_id NOT NULL.

-- Step 1: Hapus duplikat — keep row dengan last_assessment_date terbaru
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
