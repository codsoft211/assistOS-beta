-- Migration: Create tenant_subscriptions table
-- Links tenants to their current subscription plan

CREATE TABLE IF NOT EXISTS "tenant_subscriptions" (
  "id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subscription_plan_id" integer NOT NULL REFERENCES "subscription_plans"("id"),
  
  -- Subscription status and lifecycle
  "status" text NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'pending', 'trial'
  "start_date" timestamp NOT NULL DEFAULT now(),
  "end_date" timestamp,
  "renewal_date" timestamp,
  "cancelled_at" timestamp,
  "cancelled_by" varchar REFERENCES "users"("id"),
  "cancellation_reason" text,
  
  -- Billing configuration
  "auto_renew" boolean NOT NULL DEFAULT true,
  "billing_interval" text NOT NULL DEFAULT 'monthly', -- 'monthly', 'yearly'
  "current_period_start" timestamp NOT NULL DEFAULT now(),
  "current_period_end" timestamp,
  
  -- Payment tracking
  "last_payment_at" timestamp,
  "next_payment_at" timestamp,
  "payment_method" text, -- 'stripe', 'manual', 'invoice', etc.
  "payment_reference" text, -- External payment ID
  
  -- Trial information
  "is_trial" boolean NOT NULL DEFAULT false,
  "trial_ends_at" timestamp,
  
  -- Metadata
  "metadata" jsonb,
  "notes" text,
  
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create unique partial index: One active subscription per tenant
-- This ensures a tenant can only have one subscription with status 'active', 'trial', or 'pending'
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_subscriptions_unique_active_tenant_idx" 
  ON "tenant_subscriptions"("tenant_id") 
  WHERE "status" IN ('active', 'trial', 'pending');

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_tenant_idx" ON "tenant_subscriptions"("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_plan_idx" ON "tenant_subscriptions"("subscription_plan_id");
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_status_idx" ON "tenant_subscriptions"("status");
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_renewal_date_idx" ON "tenant_subscriptions"("renewal_date");
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_next_payment_idx" ON "tenant_subscriptions"("next_payment_at");

-- Add comment for documentation
COMMENT ON TABLE "tenant_subscriptions" IS 'Links tenants to their current subscription plan. Tracks subscription lifecycle, billing, and payment information.';

