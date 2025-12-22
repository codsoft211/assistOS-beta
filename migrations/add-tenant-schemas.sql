-- Migration: Add Tenant Schema Support
-- Creates tenant_schemas table and adds schema_name to migrations/schema_versions
-- Each tenant gets their own isolated Supabase schema

-- Create tenant_schemas table
CREATE TABLE IF NOT EXISTS tenant_schemas (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schema_name VARCHAR(100) UNIQUE NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for tenant_schemas
CREATE INDEX IF NOT EXISTS tenant_schemas_tenant_idx ON tenant_schemas(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_schemas_schema_name_idx ON tenant_schemas(schema_name);

-- Add schema_name to migrations table (if column doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'migrations' AND column_name = 'schema_name'
  ) THEN
    ALTER TABLE migrations ADD COLUMN schema_name VARCHAR(100);
  END IF;
END $$;

-- Add schema_name to schema_versions table (if column doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schema_versions' AND column_name = 'schema_name'
  ) THEN
    ALTER TABLE schema_versions ADD COLUMN schema_name VARCHAR(100);
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON TABLE tenant_schemas IS 'Registry of per-tenant database schemas in Supabase. Each tenant has an isolated schema for custom tables and module tables.';
COMMENT ON COLUMN tenant_schemas.schema_name IS 'PostgreSQL schema name (e.g., tenant_acme_corp). Must be unique across all tenants.';
COMMENT ON COLUMN tenant_schemas.current_version IS 'Current schema version for migration tracking. Increments with each schema change.';

