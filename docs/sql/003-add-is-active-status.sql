-- ============================================================================
-- FASE 1 & 2: Menambahkan Status Aktif untuk Vendor, Regu, dan Personil
-- ============================================================================
-- Tujuan: Mengelola vendor yang tidak aktif (tidak menang kontrak, selesai kontrak, dll)
--         beserta cascade ke regu dan personil di bawahnya
-- 
-- Tanggal: 2026-02-12
-- ============================================================================

-- ============================================================================
-- FASE 1: STATUS VENDOR
-- ============================================================================

-- 1.1 Tambah kolom is_active ke tabel vendors
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 1.2 Update semua vendor existing menjadi aktif
UPDATE vendors SET is_active = true WHERE is_active IS NULL;

-- 1.3 (Opsional) Tambah kolom tanggal nonaktif untuk tracking
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 1.4 (Opsional) Tambah kolom alasan nonaktif
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS deactivation_reason TEXT DEFAULT NULL;

-- ============================================================================
-- FASE 2: STATUS REGU (TEAMS)
-- ============================================================================

-- 2.1 Tambah kolom is_active ke tabel teams
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2.2 Update semua teams existing menjadi aktif
UPDATE teams SET is_active = true WHERE is_active IS NULL;

-- 2.3 (Opsional) Tambah kolom tanggal nonaktif
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ============================================================================
-- FASE 2: STATUS PERSONIL
-- ============================================================================

-- 3.1 Tambah kolom is_active ke tabel personnel
ALTER TABLE personnel 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3.2 Update semua personnel existing menjadi aktif
UPDATE personnel SET is_active = true WHERE is_active IS NULL;

-- 3.3 (Opsional) Tambah kolom tanggal nonaktif
ALTER TABLE personnel 
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ============================================================================
-- TRIGGER: CASCADE NONAKTIF (Opsional - bisa pakai logic di aplikasi)
-- ============================================================================

-- Function untuk cascade nonaktifkan regu & personil saat vendor dinonaktifkan
CREATE OR REPLACE FUNCTION cascade_vendor_deactivation()
RETURNS TRIGGER AS $$
BEGIN
    -- Jika vendor dinonaktifkan (is_active berubah dari true ke false)
    IF OLD.is_active = true AND NEW.is_active = false THEN
        -- Nonaktifkan semua regu dari vendor ini
        UPDATE teams 
        SET is_active = false, 
            deactivated_at = NOW()
        WHERE vendor_id = NEW.id AND is_active = true;
        
        -- Nonaktifkan semua personil dari vendor ini
        UPDATE personnel 
        SET is_active = false, 
            deactivated_at = NOW()
        WHERE vendor_id = NEW.id AND is_active = true;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pada tabel vendors
DROP TRIGGER IF EXISTS trigger_vendor_deactivation ON vendors;
CREATE TRIGGER trigger_vendor_deactivation
    AFTER UPDATE OF is_active ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION cascade_vendor_deactivation();

-- ============================================================================
-- TRIGGER: CASCADE NONAKTIF REGU KE PERSONIL
-- ============================================================================

-- Function untuk cascade nonaktifkan personil saat regu dinonaktifkan
CREATE OR REPLACE FUNCTION cascade_team_deactivation()
RETURNS TRIGGER AS $$
BEGIN
    -- Jika regu dinonaktifkan
    IF OLD.is_active = true AND NEW.is_active = false THEN
        -- Nonaktifkan semua personil dari regu ini
        UPDATE personnel 
        SET is_active = false, 
            deactivated_at = NOW()
        WHERE team_id = NEW.id AND is_active = true;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pada tabel teams
DROP TRIGGER IF EXISTS trigger_team_deactivation ON teams;
CREATE TRIGGER trigger_team_deactivation
    AFTER UPDATE OF is_active ON teams
    FOR EACH ROW
    EXECUTE FUNCTION cascade_team_deactivation();

-- ============================================================================
-- INDEX untuk performa query filter
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_teams_is_active ON teams(is_active);
CREATE INDEX IF NOT EXISTS idx_personnel_is_active ON personnel(is_active);

-- ============================================================================
-- VIEW: Vendor Aktif dengan Statistik (Opsional)
-- ============================================================================

CREATE OR REPLACE VIEW v_active_vendors_stats AS
SELECT 
    v.id,
    v.vendor_name,
    v.unit_code,
    v.is_active,
    v.deactivated_at,
    v.deactivation_reason,
    COUNT(DISTINCT t.id) FILTER (WHERE t.is_active = true) as active_teams,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = true) as active_personnel,
    COUNT(DISTINCT va.id) as total_assets
FROM vendors v
LEFT JOIN teams t ON t.vendor_id = v.id
LEFT JOIN personnel p ON p.vendor_id = v.id
LEFT JOIN vendor_assets va ON va.vendor_id = v.id
GROUP BY v.id, v.vendor_name, v.unit_code, v.is_active, v.deactivated_at, v.deactivation_reason;

-- ============================================================================
-- CATATAN IMPLEMENTASI
-- ============================================================================
-- 
-- PENGGUNAAN DI APLIKASI:
-- 
-- 1. Query vendor aktif saja:
--    SELECT * FROM vendors WHERE is_active = true;
-- 
-- 2. Nonaktifkan vendor (trigger otomatis nonaktifkan regu & personil):
--    UPDATE vendors SET is_active = false, 
--                       deactivated_at = NOW(),
--                       deactivation_reason = 'Kontrak berakhir'
--    WHERE id = 'xxx';
-- 
-- 3. Aktifkan kembali vendor (TIDAK otomatis aktifkan regu & personil):
--    UPDATE vendors SET is_active = true, 
--                       deactivated_at = NULL,
--                       deactivation_reason = NULL
--    WHERE id = 'xxx';
--    -- Kemudian aktifkan manual regu & personil yang diperlukan
-- 
-- 4. Lihat statistik vendor:
--    SELECT * FROM v_active_vendors_stats WHERE is_active = true;
-- 
-- ============================================================================
-- ROLLBACK (jika perlu)
-- ============================================================================
-- 
-- DROP TRIGGER IF EXISTS trigger_vendor_deactivation ON vendors;
-- DROP TRIGGER IF EXISTS trigger_team_deactivation ON teams;
-- DROP FUNCTION IF EXISTS cascade_vendor_deactivation();
-- DROP FUNCTION IF EXISTS cascade_team_deactivation();
-- DROP VIEW IF EXISTS v_active_vendors_stats;
-- DROP INDEX IF EXISTS idx_vendors_is_active;
-- DROP INDEX IF EXISTS idx_teams_is_active;
-- DROP INDEX IF EXISTS idx_personnel_is_active;
-- ALTER TABLE vendors DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE vendors DROP COLUMN IF EXISTS deactivated_at;
-- ALTER TABLE vendors DROP COLUMN IF EXISTS deactivation_reason;
-- ALTER TABLE teams DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE teams DROP COLUMN IF EXISTS deactivated_at;
-- ALTER TABLE personnel DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE personnel DROP COLUMN IF EXISTS deactivated_at;
-- 
-- ============================================================================
