-- ============================================================================
-- Fix vendor_assets: clear the wrong FK based on owner_id
-- Problem: edge function stored BOTH team_id AND personnel_id for every record.
-- Records where owner_id = team_id should NOT have personnel_id set.
-- Records where owner_id = personnel_id should NOT have team_id set.
-- ============================================================================

-- 1. Where owner is team → clear personnel_id
UPDATE vendor_assets
SET personnel_id = NULL
WHERE owner_id IS NOT NULL
  AND team_id IS NOT NULL
  AND owner_id = team_id
  AND personnel_id IS NOT NULL;

-- 2. Where owner is personnel → clear team_id
UPDATE vendor_assets
SET team_id = NULL
WHERE owner_id IS NOT NULL
  AND personnel_id IS NOT NULL
  AND owner_id = personnel_id
  AND team_id IS NOT NULL;
