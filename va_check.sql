SELECT COUNT(*) AS total_all,
       COUNT(CASE WHEN last_assessment_date IS NOT NULL THEN 1 END) AS total_assessed,
       COUNT(CASE WHEN owner_id IS NOT NULL THEN 1 END) AS total_with_owner
FROM vendor_assets
WHERE vendor_id IN (
  SELECT id FROM vendors WHERE unit_code = (
    SELECT unit_code FROM vendors WHERE vendor_name ILIKE '%ciputat%' LIMIT 1
  )
);
