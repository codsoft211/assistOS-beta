-- Update plan seat allowances: Pro (1 free) and Ultra (3 free)
UPDATE "subscription_plans"
SET
  free_users_included = CASE
    WHEN name = 'Pro' THEN 1
    WHEN name = 'Ultra' THEN 3
    ELSE free_users_included
  END,
  updated_at = now()
WHERE name IN ('Pro', 'Ultra');

-- Ensure cached plan metadata reflects new allowances
COMMENT ON TABLE "subscription_plans" IS 'Updated 2025-11-27: Pro free seats=1, Ultra free seats=3';

