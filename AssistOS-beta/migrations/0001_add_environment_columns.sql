-- Migration: Add environment column to 246 tables + create agent_runs
-- Generated: 2025-11-08
-- Author: Task 2.2.6 - Schema Migration (Formal Documentation)
-- 
-- NOTE: This migration documents changes already applied to the database.
-- All statements use IF NOT EXISTS to make this migration idempotent.
-- The database already has these changes; this formalizes them in Drizzle history.

--> statement-breakpoint
-- ==================== AGENT RUNS TABLE ====================
-- Create agent_runs table with environment column
CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL,
  "environment" text DEFAULT 'production' NOT NULL,
  "agent_id" varchar NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "input_data" jsonb,
  "output_data" jsonb,
  "error_message" text,
  "error_stack" text,
  "started_at" timestamp DEFAULT now(),
  "completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_tenant_idx" ON "agent_runs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_agent_idx" ON "agent_runs" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_started_at_idx" ON "agent_runs" ("started_at");

--> statement-breakpoint
-- ==================== ENVIRONMENT COLUMN ADDITIONS ====================
-- Add environment column to 246 tables for production/sandbox isolation
-- Format: ALTER TABLE "<table>" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Core Platform & Infrastructure (19 tables)
ALTER TABLE "agent_budgets" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_handoffs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_learnings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_role_assignments" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_secrets" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_state" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_workflows" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_integrations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_counters" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "company_info" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "module_interface_config" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_blueprints" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- User Management & Auth (10 tables)
ALTER TABLE "user_tenants" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_invitations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_context" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_oauth_tokens" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_gmail_accounts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_actions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_module_preferences" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_agent_interactions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Audit, Logging & Monitoring (6 tables)
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "studio_audit_log" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "code_generation_audit" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "detected_patterns" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_traces" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Notifications & Communication (8 tables)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_rules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_inbox" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_alerts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_response_learnings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- CRM & Commercial Module (23 tables)
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_leads" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_activities" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_agent_configs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_agent_executions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_ai_suggestions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_automation_rules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_budget_alerts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_conversion_metrics" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_email_events" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_email_sequences" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_email_templates" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_forecasts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_lead_scoring" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_lead_sources" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_pipeline" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_quote_versions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_tasks" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "opportunity_rules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Procurement & Purchasing Module (20 tables)
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_embeddings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_price_history" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rfq_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rfq_quote_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchasing_payment_allocations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Financial Module (25 tables)
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoice_embeddings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoice_validations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tax_rates" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tax_categories" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tax_obligations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "vat_returns" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "employee_expenses" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_calculations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_models" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Open Banking Integration (3 tables)
ALTER TABLE "open_banking_connections" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "open_banking_accounts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "open_banking_transactions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Document Management (15 tables)
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_folders" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_folder_links" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_analyses" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_classifications" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_permissions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_email_links" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_entity_links" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_insights" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_integrations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_quality_checks" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "legacy_document_mappings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Project Management Module (20 tables)
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_embeddings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_phases" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_milestones" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_expenses" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_resource_allocations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_team_members" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_risks" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_change_requests" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_issues" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_decisions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_approvals" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_contracts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_external_mappings" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_purchases" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_templates" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_states" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_activity_logs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Studio & Code Generation (10 tables)
ALTER TABLE "assistbuild_jobs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_code_modules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_code_artifacts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_code_files" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_code_releases" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_code_tests" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_plans" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sandbox_executions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "development_requests" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "schema_versions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Connectors & Integrations (10 tables)
ALTER TABLE "tenant_connector_configs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_connector_credentials" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "connector_change_events" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "connector_sync_state" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "connector_sync_logs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "connector_credentials" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_storage_providers" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- WhatsApp Integration (5 tables)
ALTER TABLE "whatsapp_accounts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Production & Manufacturing (6 tables)
ALTER TABLE "production_work_orders" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_operations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_work_order_materials" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_quality_checks" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_execution_logs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_integrations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Inventory & Logistics (6 tables)
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Products & Catalog (4 tables)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_specifications" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_suppliers" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Budget & Quoting System (14 tables)
ALTER TABLE "budget_quotes" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_quote_versions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_menu_items" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_packages" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_staff_roles" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_transport_rules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cost_templates" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cost_components" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "quote_pricing_rules" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_catalogs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_catalog_categories" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_rule_sets" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_projects" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_input_schemas" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_discounts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_addons" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_taxes" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Catering Module (3 tables)
ALTER TABLE "catering_kitchen_workflows" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "catering_prep_lists" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "catering_logistics" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Workflow & Automation (4 tables)
ALTER TABLE "tenant_automations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_workflows" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "automation_executions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Custom Entities & Forms (10 tables)
ALTER TABLE "custom_entities" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "custom_entity_records" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "custom_fields" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "entity_menu_items" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "entity_views" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "entity_workflow_states" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_forms" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "field_patterns" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "presentation_patterns" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- AI & ML (17 tables)
ALTER TABLE "config_requests" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "format_adjustments" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "detected_gaps" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "proactive_insights" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "model_adjustments" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "gold_labels" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_patterns" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_scenarios" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "process_optimizations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "custom_agents" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "specialized_agents" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversion_agents" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_memory_facts" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "business_blueprints" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "blueprint_usage_stats" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Organizational Structure (3 tables)
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Other Platform Features (7 tables)
ALTER TABLE "file_attachments" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_secrets" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "configuration_checkpoints" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "governance_policies" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "migrations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;

--> statement-breakpoint
-- Migration Complete: 246 tables now have environment column for production/sandbox isolation
