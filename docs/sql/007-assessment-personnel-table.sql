-- =============================================
-- Script: 007-assessment-personnel-table.sql
-- Purpose: Store multiple personnel per assessment (for regu type)
-- Date: 2026-02-17
-- Description:
--   - Junction table between assessments and personnel
--   - Supports "regu" (team) type assessments with multiple personnel
--   - Uses CASCADE delete - when assessment is deleted, junction records are deleted too
-- =============================================

-- SQL is in migration file: 20260217113620_assessment_personnel_table.sql

-- Usage in edge function:
-- 1. Frontend sends `personnel_ids` array in request payload
-- 2. Edge function creates assessment header
-- 3. Edge function inserts records into assessment_personnel for each personnel_id

-- Query to get all personnel for an assessment:
-- SELECT p.* 
-- FROM personnel p
-- JOIN assessment_personnel ap ON p.id = ap.personnel_id
-- WHERE ap.assessment_id = '<assessment_uuid>';

-- Query to get all assessments for a personnel:
-- SELECT a.* 
-- FROM assessments a
-- JOIN assessment_personnel ap ON a.id = ap.assessment_id
-- WHERE ap.personnel_id = '<personnel_uuid>';
