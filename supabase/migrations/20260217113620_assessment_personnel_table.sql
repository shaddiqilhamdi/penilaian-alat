-- =============================================
-- Migration: assessment_personnel_table
-- Purpose: Create junction table to store multiple personnel per assessment
-- This supports "regu" (team) type assessments where multiple personnel are assessed
-- =============================================

-- 1. Create junction table
CREATE TABLE IF NOT EXISTS assessment_personnel (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    personnel_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure no duplicate entries
    UNIQUE(assessment_id, personnel_id)
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessment_personnel_assessment ON assessment_personnel(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_personnel_personnel ON assessment_personnel(personnel_id);

-- 3. Enable RLS
ALTER TABLE assessment_personnel ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Anyone authenticated can read
CREATE POLICY "Authenticated users can read assessment_personnel" ON assessment_personnel
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Authenticated users can insert (controlled by edge function)
CREATE POLICY "Authenticated users can insert assessment_personnel" ON assessment_personnel
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Grant permissions
GRANT SELECT, INSERT ON assessment_personnel TO authenticated;

-- 6. Add comment
COMMENT ON TABLE assessment_personnel IS 'Junction table to store multiple personnel per assessment, especially for regu (team) type assessments';
