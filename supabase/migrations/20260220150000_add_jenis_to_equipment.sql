-- Add jenis column to equipment_master table
-- Values: 'Personal' or 'Regu'
-- Default to NULL for manual mapping

ALTER TABLE equipment_master 
ADD COLUMN IF NOT EXISTS jenis VARCHAR(20) DEFAULT NULL;

-- Add check constraint for valid values
ALTER TABLE equipment_master 
ADD CONSTRAINT equipment_master_jenis_check 
CHECK (jenis IS NULL OR jenis IN ('Personal', 'Regu'));

-- Add comment
COMMENT ON COLUMN equipment_master.jenis IS 'Jenis peralatan: Personal (untuk personil) atau Regu (untuk kendaraan/tim)';
