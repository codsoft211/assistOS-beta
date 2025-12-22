-- Migration: Remove environment dependency from tenant_credits
-- This consolidates credits across environments into a single record per tenant

-- Step 1: Consolidate duplicate tenant_credits records (if any exist)
-- Merge credits from multiple environments into a single record per tenant
DO $$
DECLARE
  tenant_record RECORD;
  consolidated_balance INTEGER;
  consolidated_reserved INTEGER;
  consolidated_lifetime_usage INTEGER;
  consolidated_lifetime_purchases INTEGER;
  consolidated_low_balance_threshold INTEGER;
  consolidated_low_balance_notified BOOLEAN;
  consolidated_last_purchase_at TIMESTAMP;
  consolidated_last_usage_at TIMESTAMP;
  consolidated_created_at TIMESTAMP;
  consolidated_updated_at TIMESTAMP;
  consolidated_id VARCHAR;
BEGIN
  -- For each tenant that has multiple credit records (different environments)
  FOR tenant_record IN 
    SELECT DISTINCT tenant_id 
    FROM tenant_credits 
    GROUP BY tenant_id 
    HAVING COUNT(*) > 1
  LOOP
    -- Aggregate values: sum balances, take max timestamps, use most recent thresholds
    SELECT 
      SUM(balance),
      SUM(reserved),
      SUM(lifetime_usage),
      SUM(lifetime_purchases),
      MAX(low_balance_threshold),
      BOOL_OR(low_balance_notified),
      MAX(last_purchase_at),
      MAX(last_usage_at),
      MIN(created_at),
      MAX(updated_at),
      MIN(id) -- Keep the oldest ID
    INTO 
      consolidated_balance,
      consolidated_reserved,
      consolidated_lifetime_usage,
      consolidated_lifetime_purchases,
      consolidated_low_balance_threshold,
      consolidated_low_balance_notified,
      consolidated_last_purchase_at,
      consolidated_last_usage_at,
      consolidated_created_at,
      consolidated_updated_at,
      consolidated_id
    FROM tenant_credits
    WHERE tenant_id = tenant_record.tenant_id;

    -- Delete all records for this tenant
    DELETE FROM tenant_credits WHERE tenant_id = tenant_record.tenant_id;

    -- Insert consolidated record
    INSERT INTO tenant_credits (
      id,
      tenant_id,
      balance,
      reserved,
      lifetime_usage,
      lifetime_purchases,
      low_balance_threshold,
      low_balance_notified,
      last_purchase_at,
      last_usage_at,
      created_at,
      updated_at
    ) VALUES (
      consolidated_id,
      tenant_record.tenant_id,
      COALESCE(consolidated_balance, 0),
      COALESCE(consolidated_reserved, 0),
      COALESCE(consolidated_lifetime_usage, 0),
      COALESCE(consolidated_lifetime_purchases, 0),
      consolidated_low_balance_threshold,
      COALESCE(consolidated_low_balance_notified, false),
      consolidated_last_purchase_at,
      consolidated_last_usage_at,
      COALESCE(consolidated_created_at, NOW()),
      COALESCE(consolidated_updated_at, NOW())
    );
  END LOOP;
END $$;

-- Step 2: Drop the old unique index that includes environment
DROP INDEX IF EXISTS tenant_credits_unique_idx;

-- Step 3: Drop the environment column
ALTER TABLE tenant_credits DROP COLUMN IF EXISTS environment;

-- Step 4: Create new unique index on tenant_id only
CREATE UNIQUE INDEX IF NOT EXISTS tenant_credits_unique_idx ON tenant_credits(tenant_id);

-- Step 5: Verify no duplicates exist (should return 0 rows)
-- SELECT tenant_id, COUNT(*) as count 
-- FROM tenant_credits 
-- GROUP BY tenant_id 
-- HAVING COUNT(*) > 1;

