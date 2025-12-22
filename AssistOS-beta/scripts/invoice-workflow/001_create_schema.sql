-- Invoice Workflow Schema (Separate from main assistbuild)
-- This is a test/demo schema for the scheduled email workflow feature

-- Create separate schema
CREATE SCHEMA IF NOT EXISTS invoice_workflow_schema;

-- Set search path
SET search_path TO invoice_workflow_schema;

-- Customers table for invoice workflow demo
CREATE TABLE IF NOT EXISTS invoice_workflow_schema.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices table for invoice workflow demo
CREATE TABLE IF NOT EXISTS invoice_workflow_schema.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES invoice_workflow_schema.customers(id),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'paid', 'overdue', 'cancelled')),
    due_date DATE NOT NULL,
    issued_date DATE DEFAULT CURRENT_DATE,
    description TEXT,
    line_items JSONB DEFAULT '[]',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled workflows table
CREATE TABLE IF NOT EXISTS invoice_workflow_schema.scheduled_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL,  -- References assistbuild_workflows
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    schedule_type VARCHAR(20) NOT NULL CHECK (schedule_type IN ('once', 'interval', 'cron')),
    schedule_config JSONB NOT NULL,  -- { interval: '1h', at: '09:00', cron: '0 9 * * *' }
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
    run_count INTEGER DEFAULT 0,
    max_runs INTEGER,  -- NULL = unlimited
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email logs table
CREATE TABLE IF NOT EXISTS invoice_workflow_schema.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_execution_id UUID,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoice_workflow_schema.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoice_workflow_schema.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoice_workflow_schema.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_workflows_next_run ON invoice_workflow_schema.scheduled_workflows(next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_email_logs_workflow_execution ON invoice_workflow_schema.email_logs(workflow_execution_id);

-- Comments
COMMENT ON SCHEMA invoice_workflow_schema IS 'Demo schema for scheduled invoice email workflows';
COMMENT ON TABLE invoice_workflow_schema.invoices IS 'Invoice records for workflow demo';
COMMENT ON TABLE invoice_workflow_schema.scheduled_workflows IS 'Scheduled workflow configurations';
COMMENT ON TABLE invoice_workflow_schema.email_logs IS 'Log of emails sent by workflows';
