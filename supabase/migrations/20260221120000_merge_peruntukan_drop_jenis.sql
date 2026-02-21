-- ============================================================================
-- Migration: Merge duplicate peruntukan & drop jenis column
-- ============================================================================
-- Context:
-- The `jenis` (Personal/Regu) classification has moved to `equipment_master.jenis`.
-- The `peruntukan` table still has a `jenis` column, causing duplicate rows
-- with the same `deskripsi` but different `jenis` values.
--
-- Strategy:
-- 1. For each group of peruntukan with the same deskripsi, keep the one with
--    the smallest id (alphabetically first).
-- 2. Update all FK references in child tables to point to the kept record.
-- 3. Delete the duplicate records.
-- 4. Drop the `jenis` column from peruntukan.
-- ============================================================================

DO $$
DECLARE
    kept_id TEXT;
    dup_id TEXT;
    dup_record RECORD;
    merge_count INT := 0;
BEGIN
    -- Find duplicates: same deskripsi, different id
    -- For each group, keep the one with the smallest id
    FOR dup_record IN
        SELECT 
            p.id AS duplicate_id,
            keeper.id AS keeper_id,
            p.deskripsi
        FROM peruntukan p
        JOIN (
            SELECT deskripsi, MIN(id) AS id
            FROM peruntukan
            GROUP BY deskripsi
            HAVING COUNT(*) > 1
        ) keeper ON p.deskripsi = keeper.deskripsi AND p.id != keeper.id
        ORDER BY p.deskripsi, p.id
    LOOP
        kept_id := dup_record.keeper_id;
        dup_id := dup_record.duplicate_id;

        RAISE NOTICE 'Merging peruntukan "%" (%) -> (%)', dup_record.deskripsi, dup_id, kept_id;

        -- Update FK references in child tables
        -- For equipment_standards: delete duplicate rows that would violate unique constraints
        DELETE FROM equipment_standards es1
        WHERE es1.peruntukan_id = dup_id
          AND EXISTS (
            SELECT 1 FROM equipment_standards es2
            WHERE es2.vendor_id = es1.vendor_id
              AND es2.peruntukan_id = kept_id
              AND es2.equipment_id = es1.equipment_id
          );
        UPDATE equipment_standards SET peruntukan_id = kept_id WHERE peruntukan_id = dup_id;

        -- For vendor_assets: delete duplicate rows that would violate unique constraints
        DELETE FROM vendor_assets va1
        WHERE va1.peruntukan_id = dup_id
          AND EXISTS (
            SELECT 1 FROM vendor_assets va2
            WHERE va2.vendor_id = va1.vendor_id
              AND va2.peruntukan_id = kept_id
              AND COALESCE(va2.team_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(va1.team_id, '00000000-0000-0000-0000-000000000000'::uuid)
              AND COALESCE(va2.personnel_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(va1.personnel_id, '00000000-0000-0000-0000-000000000000'::uuid)
              AND va2.equipment_id = va1.equipment_id
          );
        UPDATE vendor_assets SET peruntukan_id = kept_id WHERE peruntukan_id = dup_id;

        UPDATE assessments SET peruntukan_id = kept_id WHERE peruntukan_id = dup_id;
        UPDATE teams SET peruntukan_id = kept_id WHERE peruntukan_id = dup_id;
        UPDATE personnel SET peruntukan_id = kept_id WHERE peruntukan_id = dup_id;

        -- Delete the duplicate
        DELETE FROM peruntukan WHERE id = dup_id;

        merge_count := merge_count + 1;
    END LOOP;

    RAISE NOTICE 'Total peruntukan duplicates merged: %', merge_count;
END $$;

-- Now drop the jenis column since it's no longer needed
ALTER TABLE peruntukan DROP COLUMN IF EXISTS jenis;
