-- Migration: Create credit_packages table
-- One-time credit purchases (non-expiring)

CREATE TABLE IF NOT EXISTS "credit_packages" (
  "id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "credits_amount" integer NOT NULL, -- Total credits in this package
  "price_euros" numeric(10, 2) NOT NULL, -- Purchase price in EUR
  "payment_method" text NOT NULL, -- 'stripe', 'manual', 'promotional', etc.
  "status" text NOT NULL DEFAULT 'active', -- 'active', 'applied'
  "created_at" timestamp NOT NULL DEFAULT now(),
  
  -- CHECK constraints to ensure positive values
  CONSTRAINT "credit_packages_credits_amount_positive" CHECK ("credits_amount" > 0),
  CONSTRAINT "credit_packages_price_euros_positive" CHECK ("price_euros" > 0)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "credit_packages_tenant_idx" ON "credit_packages"("tenant_id");
CREATE INDEX IF NOT EXISTS "credit_packages_status_idx" ON "credit_packages"("status");

-- Add comment for documentation
COMMENT ON TABLE "credit_packages" IS 'One-time credit purchases (non-expiring). Tracks credit packages purchased by tenants.';

