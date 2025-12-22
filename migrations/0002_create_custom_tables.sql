-- Migration: Create custom_tables table in public schema
-- This table tracks metadata about tenant-editable tables

CREATE TABLE IF NOT EXISTS "custom_tables" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "environment" text DEFAULT 'production' NOT NULL,
  
  -- Table identification
  "table_name" text NOT NULL,
  "description" text,
  
  -- Table metadata
  "category" text, -- Scope/module category (e.g., 'project', 'workflow', 'crm', 'logistics', 'custom')
  
  -- Table structure metadata (stores column definitions)
  "columns" jsonb,
  
  -- Table configuration
  "is_editable" boolean DEFAULT true NOT NULL,
  "is_system_table" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_deleted" boolean DEFAULT false NOT NULL,
  
  -- Additional metadata
  "metadata" jsonb,
  
  -- Audit
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "updated_by" varchar REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "custom_tables_unique_tenant_table" ON "custom_tables"("tenant_id", "table_name", "environment");
CREATE INDEX IF NOT EXISTS "custom_tables_tenant_idx" ON "custom_tables"("tenant_id");
CREATE INDEX IF NOT EXISTS "custom_tables_table_name_idx" ON "custom_tables"("table_name");

