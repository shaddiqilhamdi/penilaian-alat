-- =============================================
-- Migration: 20260221100000_teams_nomor_polisi_unique.sql
-- Purpose: Add UNIQUE constraint on nomor_polisi column in teams table
-- Author: System
-- Date: 2026-02-21
-- Description:
--   - Ensures nomor_polisi is unique across all teams
--   - Creates unique index for performance
-- =============================================

-- 1. Remove duplicates if any (keep the newest record)
-- Comment this out if no duplicates expected
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY nomor_polisi
               ORDER BY created_at DESC
           ) as rn
    FROM teams
    WHERE nomor_polisi IS NOT NULL
)
DELETE FROM teams
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- 2. Create unique index on nomor_polisi
-- Using UPPER to make it case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_nomor_polisi_unique 
ON teams (UPPER(nomor_polisi))
WHERE nomor_polisi IS NOT NULL;

-- 3. Add comment for documentation
COMMENT ON INDEX idx_teams_nomor_polisi_unique IS 'Ensures each vehicle plate number (nomor_polisi) is unique, case-insensitive';

-- 4. Verify constraint was created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'teams' 
AND indexname = 'idx_teams_nomor_polisi_unique';
