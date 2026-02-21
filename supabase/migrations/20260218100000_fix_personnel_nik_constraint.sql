-- =============================================
-- Migration: fix_personnel_nik_constraint
-- Purpose: Allow NULL values for NIK column while keeping uniqueness for non-null values
-- =============================================

-- 1. Drop existing unique constraint on nik (if exists)
ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_nik_key;

-- 2. Update existing empty string NIK values to NULL
UPDATE personnel SET nik = NULL WHERE nik = '' OR nik = '-';

-- 3. Create partial unique index that only applies to non-NULL values
-- This allows multiple NULL values but ensures uniqueness for actual NIK values
CREATE UNIQUE INDEX IF NOT EXISTS personnel_nik_unique ON personnel(nik) WHERE nik IS NOT NULL;

-- 4. Add comment
COMMENT ON COLUMN personnel.nik IS 'NIK (Nomor Induk Kependudukan) - unique when provided, NULL allowed';
