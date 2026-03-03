ALTER TABLE personnel ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE personnel SET is_active = false WHERE nik IS NULL;
COMMENT ON COLUMN personnel.is_active IS 'Status aktif personil. false = tidak aktif (tidak punya NIK)';
