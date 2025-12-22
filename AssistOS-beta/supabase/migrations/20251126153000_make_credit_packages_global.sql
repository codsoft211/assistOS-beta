-- Migration: Make credit_packages global catalog
-- Allows predefined packages to be shared across all tenants

BEGIN;

-- Drop tenant-specific index if it exists
DROP INDEX IF EXISTS "credit_packages_tenant_idx";

-- Remove tenant relationship column
ALTER TABLE "credit_packages"
  DROP CONSTRAINT IF EXISTS "credit_packages_tenant_id_fkey",
  DROP COLUMN IF EXISTS "tenant_id";

-- Ensure packages remain unique by definition (credits + price)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_packages_amount_price_unique'
  ) THEN
    ALTER TABLE "credit_packages"
      ADD CONSTRAINT "credit_packages_amount_price_unique"
      UNIQUE ("credits_amount", "price_euros");
  END IF;
END$$;

-- Ensure table comment reflects new purpose
COMMENT ON TABLE "credit_packages"
  IS 'Global catalog of non-expiring credit packages available to all tenants.';

-- Seed default packages if table is empty
INSERT INTO "credit_packages" ("credits_amount", "price_euros", "payment_method")
SELECT * FROM (VALUES
  (500, 50.00, 'manual'),
  (2000, 190.00, 'manual'),
  (5000, 350.00, 'manual'),
  (15000, 1000.00, 'manual')
) AS pkg(credits_amount, price_euros, payment_method)
ON CONFLICT ("credits_amount", "price_euros") DO NOTHING;

COMMIT;
