-- Migration: Remove icon and color columns from custom_tables
-- These fields are no longer needed in the custom_tables schema

ALTER TABLE "custom_tables" DROP COLUMN IF EXISTS "icon";
ALTER TABLE "custom_tables" DROP COLUMN IF EXISTS "color";
