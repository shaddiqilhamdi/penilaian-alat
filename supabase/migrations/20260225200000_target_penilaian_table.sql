-- ============================================================================
-- Table: target_penilaian
-- Setting target entri penilaian per unit per peruntukan
-- Admin tiap unit bisa set jumlah regu & penilaian per hari
-- ============================================================================

CREATE TABLE IF NOT EXISTS target_penilaian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code TEXT NOT NULL REFERENCES units(unit_code),
    peruntukan_id TEXT NOT NULL REFERENCES peruntukan(id),
    jumlah_regu INTEGER NOT NULL DEFAULT 0,
    penilaian_perhari INTEGER NOT NULL DEFAULT 0,
    target_harian INTEGER GENERATED ALWAYS AS (jumlah_regu * penilaian_perhari) STORED,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(unit_code, peruntukan_id)
);

-- Index
CREATE INDEX idx_target_penilaian_unit ON target_penilaian(unit_code);

-- RLS
ALTER TABLE target_penilaian ENABLE ROW LEVEL SECURITY;

-- Admin UID bisa lihat & edit semua
CREATE POLICY "Admin UID full access" ON target_penilaian
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('uid_admin', 'uid_user')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('uid_admin', 'uid_user')
        )
    );

-- Admin UP3 bisa lihat & edit unit sendiri
CREATE POLICY "Admin UP3 own unit" ON target_penilaian
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'up3_admin'
            AND profiles.unit_code = target_penilaian.unit_code
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'up3_admin'
            AND profiles.unit_code = target_penilaian.unit_code
        )
    );

-- Grant
GRANT ALL ON target_penilaian TO authenticated;

-- Trigger update updated_at
CREATE OR REPLACE FUNCTION update_target_penilaian_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_target_penilaian_updated_at
    BEFORE UPDATE ON target_penilaian
    FOR EACH ROW
    EXECUTE FUNCTION update_target_penilaian_updated_at();

COMMENT ON TABLE target_penilaian IS 'Target penilaian harian per unit per peruntukan';
