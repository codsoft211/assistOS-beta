-- Migration: Create credit_package_purchases table to track one-time credit orders
BEGIN;

CREATE TABLE IF NOT EXISTS "credit_package_purchases" (
  "id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "package_id" varchar NOT NULL REFERENCES "credit_packages"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'pending',
  "credits_amount" integer NOT NULL,
  "price_euros" numeric(10, 2) NOT NULL,
  "stripe_checkout_session_id" text UNIQUE,
  "stripe_payment_intent_id" text,
  "credit_transaction_id" varchar REFERENCES "credit_transactions"("id"),
  "created_by" varchar REFERENCES "users"("id"),
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "credit_package_purchases_tenant_idx"
  ON "credit_package_purchases"("tenant_id");

CREATE INDEX IF NOT EXISTS "credit_package_purchases_status_idx"
  ON "credit_package_purchases"("status");

CREATE INDEX IF NOT EXISTS "credit_package_purchases_package_idx"
  ON "credit_package_purchases"("package_id");

COMMENT ON TABLE "credit_package_purchases" IS 'Tracks one-time credit package purchases triggered via Stripe checkout.';

COMMIT;
