-- Migration: Update platform_settings to remove redundant settings
-- Purpose: Remove cost_per_credit_usd and usd_eur_exchange_rate (now calculated)
-- Date: 2025-12-01

-- Delete redundant settings that are now calculated
DELETE FROM "platform_settings" 
WHERE setting_key IN ('cost_per_credit_usd', 'usd_eur_exchange_rate');

-- Update credit_margin description to reflect calculation
UPDATE "platform_settings"
SET 
  description = 'Profit margin for credit system (0.70 = 70%). Cost per credit is calculated as: CREDIT_PRICE_EUR × (1 - MARGIN). Example: €0.10 × (1 - 0.70) = €0.03',
  updated_at = NOW()
WHERE setting_key = 'credit_margin';

-- Update credit_price_eur description
UPDATE "platform_settings"
SET 
  description = 'Customer-facing price per credit in EUR. This is the selling price shown to customers. Combined with margin to calculate internal cost.',
  updated_at = NOW()
WHERE setting_key = 'credit_price_eur';

-- Add comment explaining the change
COMMENT ON TABLE "platform_settings" IS 'Platform-wide configuration settings that should not be hardcoded. Cost per credit is calculated dynamically from margin and price: cost = price × (1 - margin)';

-- Verify the changes
SELECT 
  setting_key,
  value,
  display_name,
  description
FROM platform_settings
WHERE setting_category = 'credits'
ORDER BY setting_key;

