-- Add RLS policy for up3_user to access target_penilaian (own unit only)
CREATE POLICY "UP3 User own unit" ON target_penilaian
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'up3_user'
            AND profiles.unit_code = target_penilaian.unit_code
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'up3_user'
            AND profiles.unit_code = target_penilaian.unit_code
        )
    );
