-- Migration: Invite Billing System
-- Description: Add billing support for team invitations with seat allocation and payment tracking
-- Date: 2025-11-25

-- ==================== TENANT SEAT TRACKING ====================

-- Add seat tracking columns to tenant_subscriptions
ALTER TABLE "tenant_subscriptions"
ADD COLUMN IF NOT EXISTS "paying_seats_allocated" integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "free_seats_allocated" integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "paying_seats_provisional" integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "credit_balance" numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "tenant_subscriptions"."paying_seats_allocated" IS 'Number of confirmed paying seats in use';
COMMENT ON COLUMN "tenant_subscriptions"."free_seats_allocated" IS 'Number of free seats in use';
COMMENT ON COLUMN "tenant_subscriptions"."paying_seats_provisional" IS 'Number of paying seats reserved for pending invites';
COMMENT ON COLUMN "tenant_subscriptions"."credit_balance" IS 'Tenant credit balance for usage-based billing';

-- Add check constraints
ALTER TABLE "tenant_subscriptions"
ADD CONSTRAINT "tenant_subscriptions_seats_non_negative" CHECK (
  "paying_seats_allocated" >= 0 AND
  "free_seats_allocated" >= 0 AND
  "paying_seats_provisional" >= 0
);

-- ==================== INVITE BILLING TRACKING ====================

-- Add billing fields to tenant_invitations
ALTER TABLE "tenant_invitations"
ADD COLUMN IF NOT EXISTS "seat_type" text NOT NULL DEFAULT 'free',
ADD COLUMN IF NOT EXISTS "requires_payment" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "payment_amount" numeric(10, 2),
ADD COLUMN IF NOT EXISTS "payment_currency" text DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS "payment_intent_id" text,
ADD COLUMN IF NOT EXISTS "payment_status" text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "payment_captured_at" timestamp,
ADD COLUMN IF NOT EXISTS "refund_id" text,
ADD COLUMN IF NOT EXISTS "refund_status" text,
ADD COLUMN IF NOT EXISTS "refund_initiated_at" timestamp,
ADD COLUMN IF NOT EXISTS "refund_completed_at" timestamp,
ADD COLUMN IF NOT EXISTS "subscription_plan_id" integer,
ADD COLUMN IF NOT EXISTS "declined_at" timestamp,
ADD COLUMN IF NOT EXISTS "accepted_at" timestamp,
ADD COLUMN IF NOT EXISTS "expired_at" timestamp;

COMMENT ON COLUMN "tenant_invitations"."seat_type" IS 'Type of seat: free, paid, pending-paid';
COMMENT ON COLUMN "tenant_invitations"."requires_payment" IS 'Whether this invite requires payment';
COMMENT ON COLUMN "tenant_invitations"."payment_amount" IS 'Amount charged for this seat';
COMMENT ON COLUMN "tenant_invitations"."payment_intent_id" IS 'Stripe payment intent ID';
COMMENT ON COLUMN "tenant_invitations"."payment_status" IS 'Payment status: none, pending, succeeded, failed, refunded';
COMMENT ON COLUMN "tenant_invitations"."refund_status" IS 'Refund status: none, pending, succeeded, failed';
COMMENT ON COLUMN "tenant_invitations"."subscription_plan_id" IS 'Plan ID at time of invite';

-- Add check constraint for seat_type
ALTER TABLE "tenant_invitations"
ADD CONSTRAINT "tenant_invitations_seat_type_check" CHECK (
  "seat_type" IN ('free', 'paid', 'pending-paid')
);

-- Add check constraint for payment_status
ALTER TABLE "tenant_invitations"
ADD CONSTRAINT "tenant_invitations_payment_status_check" CHECK (
  "payment_status" IN ('none', 'pending', 'succeeded', 'failed', 'refunded')
);

-- Add check constraint for refund_status
ALTER TABLE "tenant_invitations"
ADD CONSTRAINT "tenant_invitations_refund_status_check" CHECK (
  "refund_status" IS NULL OR "refund_status" IN ('none', 'pending', 'succeeded', 'failed')
);

-- Add foreign key for subscription_plan_id
ALTER TABLE "tenant_invitations"
ADD CONSTRAINT "tenant_invitations_subscription_plan_id_fkey"
FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id");

-- Add index for payment tracking
CREATE INDEX IF NOT EXISTS "tenant_invitations_payment_status_idx" ON "tenant_invitations"("payment_status");
CREATE INDEX IF NOT EXISTS "tenant_invitations_refund_status_idx" ON "tenant_invitations"("refund_status");
CREATE INDEX IF NOT EXISTS "tenant_invitations_seat_type_idx" ON "tenant_invitations"("seat_type");

-- ==================== INVITE BILLING AUDIT LOG ====================

CREATE TABLE IF NOT EXISTS "invite_billing_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invitation_id" varchar NOT NULL REFERENCES "tenant_invitations"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "event_data" jsonb,
  "actor_user_id" varchar REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

COMMENT ON TABLE "invite_billing_events" IS 'Audit log for invite billing events (payment, refund, seat allocation)';
COMMENT ON COLUMN "invite_billing_events"."event_type" IS 'Event type: invite_created, payment_initiated, payment_succeeded, payment_failed, invite_accepted, invite_declined, invite_expired, refund_initiated, refund_succeeded, refund_failed, seat_allocated, seat_released';

-- Add check constraint for event_type
ALTER TABLE "invite_billing_events"
ADD CONSTRAINT "invite_billing_events_event_type_check" CHECK (
  "event_type" IN (
    'invite_created',
    'payment_initiated',
    'payment_succeeded',
    'payment_failed',
    'invite_accepted',
    'invite_declined',
    'invite_expired',
    'refund_initiated',
    'refund_succeeded',
    'refund_failed',
    'seat_allocated',
    'seat_released'
  )
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "invite_billing_events_tenant_idx" ON "invite_billing_events"("tenant_id");
CREATE INDEX IF NOT EXISTS "invite_billing_events_invitation_idx" ON "invite_billing_events"("invitation_id");
CREATE INDEX IF NOT EXISTS "invite_billing_events_event_type_idx" ON "invite_billing_events"("event_type");
CREATE INDEX IF NOT EXISTS "invite_billing_events_created_at_idx" ON "invite_billing_events"("created_at");

-- ==================== PLAN CONFIGURATION ====================

-- Add per-seat pricing to subscription_plans
ALTER TABLE "subscription_plans"
ADD COLUMN IF NOT EXISTS "price_per_paying_seat_euros" numeric(10, 2),
ADD COLUMN IF NOT EXISTS "credits_per_paying_user" integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN "subscription_plans"."price_per_paying_seat_euros" IS 'Price to add an additional paying seat';
COMMENT ON COLUMN "subscription_plans"."credits_per_paying_user" IS 'Credits granted per paying user';

-- Update existing plans with per-seat pricing
UPDATE "subscription_plans"
SET 
  "price_per_paying_seat_euros" = "price_monthly_euros",
  "credits_per_paying_user" = "credits_included"
WHERE "name" IN ('Base', 'Pro', 'Ultra');

-- ==================== HELPER FUNCTIONS ====================

-- Function to calculate available free seats
CREATE OR REPLACE FUNCTION get_available_free_seats(p_tenant_id varchar)
RETURNS integer AS $$
DECLARE
  v_plan_free_seats integer;
  v_allocated_free_seats integer;
  v_available integer;
BEGIN
  -- Get plan's free seats and currently allocated free seats
  SELECT 
    sp.free_users_included,
    ts.free_seats_allocated
  INTO v_plan_free_seats, v_allocated_free_seats
  FROM tenant_subscriptions ts
  JOIN subscription_plans sp ON ts.subscription_plan_id = sp.id
  WHERE ts.tenant_id = p_tenant_id
    AND ts.status IN ('active', 'trial')
  LIMIT 1;
  
  -- If no subscription found, return 0
  IF v_plan_free_seats IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Calculate available seats
  v_available := v_plan_free_seats - v_allocated_free_seats;
  
  -- Ensure non-negative
  IF v_available < 0 THEN
    v_available := 0;
  END IF;
  
  RETURN v_available;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate total paying seats (allocated + provisional)
CREATE OR REPLACE FUNCTION get_total_paying_seats(p_tenant_id varchar)
RETURNS integer AS $$
DECLARE
  v_total integer;
BEGIN
  SELECT 
    COALESCE(paying_seats_allocated, 0) + COALESCE(paying_seats_provisional, 0)
  INTO v_total
  FROM tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status IN ('active', 'trial')
  LIMIT 1;
  
  RETURN COALESCE(v_total, 0);
END;
$$ LANGUAGE plpgsql;

-- ==================== INDEXES FOR PERFORMANCE ====================

-- Index for seat allocation queries
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_seat_tracking_idx" 
ON "tenant_subscriptions"("tenant_id", "status", "paying_seats_allocated", "free_seats_allocated");

-- Index for pending payment invites
CREATE INDEX IF NOT EXISTS "tenant_invitations_pending_payment_idx"
ON "tenant_invitations"("tenant_id", "status", "payment_status")
WHERE "requires_payment" = true AND "status" = 'pending';

