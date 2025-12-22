-- Migration: Separate monthly (expiring) credits from package (non-expiring) credits
-- Extends tenant_credits table to track two types of credits separately

-- Step 1: Add new columns for separated credits
ALTER TABLE "tenant_credits" 
  ADD COLUMN IF NOT EXISTS "monthly_credits" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "package_credits" integer NOT NULL DEFAULT 0;

-- Step 2: Migrate existing balance data to package_credits (assuming existing credits are from packages)
-- This preserves existing credit balances as non-expiring package credits
UPDATE "tenant_credits" 
SET "package_credits" = COALESCE("balance", 0)
WHERE "balance" IS NOT NULL;

-- Step 3: Drop the old balance column
ALTER TABLE "tenant_credits" DROP COLUMN IF EXISTS "balance";

-- Step 4: Drop old balance index if it exists
DROP INDEX IF EXISTS "tenant_credits_balance_idx";

-- Step 5: Drop old CHECK constraint for balance
ALTER TABLE "tenant_credits" DROP CONSTRAINT IF EXISTS "tenant_credits_balance_check";
ALTER TABLE "tenant_credits" DROP CONSTRAINT IF EXISTS "balance_non_negative";

-- Step 6: Add new CHECK constraints for the separated credit types
ALTER TABLE "tenant_credits" 
  ADD CONSTRAINT "tenant_credits_monthly_credits_non_negative" CHECK ("monthly_credits" >= 0),
  ADD CONSTRAINT "tenant_credits_package_credits_non_negative" CHECK ("package_credits" >= 0);

-- Step 7: Add comment for documentation
COMMENT ON COLUMN "tenant_credits"."monthly_credits" IS 'Expiring credits from subscription plans. These credits expire at the end of the billing period.';
COMMENT ON COLUMN "tenant_credits"."package_credits" IS 'Non-expiring credits from one-time purchases (credit_packages). These credits never expire.';

