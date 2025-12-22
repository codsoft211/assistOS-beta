-- Migration: Create platform_settings table
-- Purpose: Store configurable platform-wide settings (margins, prices, etc.)
-- Date: 2025-12-01

-- Create platform_settings table
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "setting_key" text NOT NULL UNIQUE,
  "setting_category" text NOT NULL,
  "value" jsonb NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "data_type" text NOT NULL,
  "constraints" jsonb,
  "default_value" jsonb NOT NULL,
  "is_editable" boolean NOT NULL DEFAULT true,
  "requires_restart" boolean NOT NULL DEFAULT false,
  "last_modified_by" varchar REFERENCES "users"("id"),
  "last_modified_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "platform_settings_category_idx" ON "platform_settings"("setting_category");
CREATE INDEX IF NOT EXISTS "platform_settings_key_idx" ON "platform_settings"("setting_key");

-- Insert default credit system settings
-- Note: cost_per_credit is calculated dynamically from margin and price
INSERT INTO "platform_settings" ("setting_key", "setting_category", "value", "display_name", "description", "data_type", "default_value", "constraints", "is_editable", "requires_restart")
VALUES 
  (
    'credit_margin',
    'credits',
    '{"numericValue": 0.70}'::jsonb,
    'Credit System Margin',
    'Profit margin for credit system (0.70 = 70%). Cost per credit is calculated as: CREDIT_PRICE_EUR × (1 - MARGIN). Example: €0.10 × (1 - 0.70) = €0.03',
    'number',
    '{"numericValue": 0.70}'::jsonb,
    '{"min": 0.0, "max": 0.95}'::jsonb,
    true,
    false
  ),
  (
    'credit_price_eur',
    'credits',
    '{"numericValue": 0.10}'::jsonb,
    'Credit Price (EUR)',
    'Customer-facing price per credit in EUR. This is the selling price shown to customers. Combined with margin to calculate internal cost.',
    'number',
    '{"numericValue": 0.10}'::jsonb,
    '{"min": 0.01, "max": 1.00}'::jsonb,
    true,
    false
  );

-- Add comment to table
COMMENT ON TABLE "platform_settings" IS 'Platform-wide configuration settings that should not be hardcoded. Cost per credit is calculated dynamically from margin and price.';
COMMENT ON COLUMN "platform_settings"."setting_key" IS 'Unique identifier for the setting (e.g., credit_margin)';
COMMENT ON COLUMN "platform_settings"."value" IS 'Current value stored as JSONB for flexibility';
COMMENT ON COLUMN "platform_settings"."default_value" IS 'Default value for reset functionality';
COMMENT ON COLUMN "platform_settings"."constraints" IS 'Validation rules (min, max, pattern, allowedValues)';

-- Note: The system calculates cost_per_credit dynamically using:
-- cost_per_credit = credit_price_eur × (1 - credit_margin)
-- This ensures consistency and eliminates the need to manually update cost when margin changes.

