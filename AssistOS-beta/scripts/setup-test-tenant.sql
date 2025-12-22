-- Create test tenant schema if it doesn't exist
-- This is for development/testing purposes only

-- Create schema
CREATE SCHEMA IF NOT EXISTS test_tenant;

-- Create a simple customers table for testing
CREATE TABLE IF NOT EXISTS test_tenant.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for tenant isolation
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON test_tenant.customers(tenant_id);

-- Insert tenant schema record if it doesn't exist
INSERT INTO public.tenant_schemas (tenant_id, schema_name, environment)
VALUES ('test-tenant', 'test_tenant', 'sandbox')
ON CONFLICT (tenant_id, schema_name) DO NOTHING;

-- Verify
SELECT * FROM public.tenant_schemas WHERE tenant_id = 'test-tenant';
