-- Migration: Add scheduled plan change support for downgrades
-- Allows downgrades to be scheduled at the end of the billing period (like Cursor)

ALTER TABLE "tenant_subscriptions"
ADD COLUMN IF NOT EXISTS "scheduled_plan_id" integer REFERENCES "subscription_plans"("id"),
ADD COLUMN IF NOT EXISTS "scheduled_plan_change_at" timestamp;

-- Create index for efficient queries of scheduled plan changes
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_scheduled_plan_change_idx" 
ON "tenant_subscriptions"("scheduled_plan_change_at")
WHERE "scheduled_plan_change_at" IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN "tenant_subscriptions"."scheduled_plan_id" IS 'Plan that will be activated at the end of the current billing period (for scheduled downgrades)';
COMMENT ON COLUMN "tenant_subscriptions"."scheduled_plan_change_at" IS 'When the scheduled plan change should take effect (typically current_period_end)';

