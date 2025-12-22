-- Migration: Add item_type and other missing columns to products table
-- Purpose: Fix list_products tool error "column item_type does not exist"
-- Date: 2025-12-12

-- Add item_type column (required for list_products tool)
-- Default to 'RAW' for existing products, matches schema definition
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'RAW';

-- Add is_sellable column (required for product filtering)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN NOT NULL DEFAULT false;

-- Add is_purchasable column (required for product filtering)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_purchasable BOOLEAN NOT NULL DEFAULT true;

-- Add tracking_type column (for batch/lot/serial tracking)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS tracking_type TEXT DEFAULT 'NONE';

-- Add subcategory column (for product categorization)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add calculated_cost column (auto-calculated from recipe)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS calculated_cost NUMERIC(10, 2);

-- Add default_uom_id column (default unit of measure)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS default_uom_id VARCHAR REFERENCES uoms(id);

-- Add storage_uom_id column (storage unit of measure, if different from default)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS storage_uom_id VARCHAR REFERENCES uoms(id);

-- Add tax_profile_id column (for tax calculations)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS tax_profile_id VARCHAR;

-- Add notes column (for product notes)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add metadata column (for flexible JSON data)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index on item_type for better query performance (matches schema definition)
CREATE INDEX IF NOT EXISTS products_item_type_idx ON products(item_type);

-- Create index on is_sellable for better query performance (matches schema definition)
CREATE INDEX IF NOT EXISTS products_sellable_idx ON products(is_sellable);

-- Add comment explaining the item_type column
COMMENT ON COLUMN products.item_type IS 'Item type classification: RAW, SALE, SEMI, SERVICE, or PACKAGING';
