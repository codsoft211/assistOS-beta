-- Migration: Add WhatsApp Automation Clients table
-- Purpose: Enable AssistME to automatically monitor and respond to WhatsApp messages from configured clients
-- Date: 2025-12-07

-- Create whatsapp_automation_clients table
CREATE TABLE IF NOT EXISTS whatsapp_automation_clients (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  
  -- Client identification
  phone_number TEXT NOT NULL,
  name TEXT,
  
  -- Configuration
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  notes TEXT,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_automation_tenant_phone_idx 
  ON whatsapp_automation_clients(tenant_id, phone_number, environment);

CREATE INDEX IF NOT EXISTS whatsapp_automation_tenant_idx 
  ON whatsapp_automation_clients(tenant_id);

CREATE INDEX IF NOT EXISTS whatsapp_automation_active_idx 
  ON whatsapp_automation_clients(is_active);

-- Add comment
COMMENT ON TABLE whatsapp_automation_clients IS 'Configured client phone numbers for WhatsApp automation. AssistME monitors messages from these clients and can auto-respond to order-related inquiries.';
