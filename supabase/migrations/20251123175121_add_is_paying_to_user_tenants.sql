-- Migration: Add is_paying flag to user_tenants table
-- Tracks which users count as paying seats for subscription plan limits

-- Step 1: Add is_paying column
ALTER TABLE "user_tenants" 
  ADD COLUMN IF NOT EXISTS "is_paying" boolean NOT NULL DEFAULT false;

-- Step 2: Create index for efficient queries on paying users
CREATE INDEX IF NOT EXISTS "user_tenants_paying_users_idx" 
  ON "user_tenants"("tenant_id", "is_paying");

-- Step 3: Add comment for documentation
COMMENT ON COLUMN "user_tenants"."is_paying" IS 'Whether this user counts as a paying seat for subscription plan limits. Only paying seats count towards the plan limit.';

