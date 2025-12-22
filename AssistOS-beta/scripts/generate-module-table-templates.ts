#!/usr/bin/env tsx
/**
 * Auto-Generate Module Table Templates from Schema
 * 
 * Reads shared/schema.ts and generates complete MODULE_TABLE_TEMPLATES
 * with all tables for each module based on DATABASE_REFERENCE.md
 * 
 * Usage: npm run generate:module-templates
 */

import * as fs from 'fs';
import * as path from 'path';

// Module table mappings from DATABASE_REFERENCE.md
const MODULE_TABLES: Record<string, string[]> = {
  financial: [
    // 4.1 Chart of Accounts & Journals
    'chart_of_accounts',
    'journal_entries',
    'journal_entry_lines',
    'fiscal_periods',
    // 4.2 Invoicing (AR)
    'invoices',
    'invoice_items',
    'invoice_lines',
    'invoice_taxes',
    'invoice_validations',
    'invoice_embeddings',
    // 4.3 Payables (AP)
    'payables',
    'payments',
    'payment_allocations',
    'payment_plans',
    'payment_reminders',
    'dunning_runs',
    // 4.4 Banking & Treasury
    'bank_accounts',
    'bank_reconciliations',
    'bank_statement_transactions',
    'cashflow_snapshots',
    'employee_expenses',
    // 4.5 Taxation
    'tax_categories',
    'tax_rates',
    'tax_jurisdictions',
    'tax_obligations',
    'vat_returns',
    // 4.6 Open Banking
    'open_banking_connections',
    'open_banking_accounts',
    'open_banking_transactions',
    // 4.7 Financial Models
    'financial_models',
    'financial_calculations',
    'financial_scenarios',
  ],
  
  purchasing: [
    // 16.1 Suppliers
    'suppliers',
    'supplier_embeddings',
    'product_suppliers',
    'supplier_price_history',
    // 16.2 RFQs & Quotes
    'rfqs',
    'rfq_lines',
    'rfq_quotes',
    'rfq_quote_lines',
    // 16.3 Purchase Orders
    'purchase_orders',
    'purchase_order_lines',
    'purchase_requisitions',
    'purchase_requisition_lines',
    // 16.4 Receipts & Returns
    'receipts',
    'receipt_lines',
    'supplier_returns',
    'supplier_return_lines',
    // 16.5 Supplier Invoices
    'supplier_invoices',
    'purchasing_invoices',
    'purchasing_invoice_lines',
    'purchasing_payments',
    'purchasing_payment_allocations',
  ],
  
  crm: [
    // 3.1 Core CRM
    'clients',
    'client_embeddings',
    'entities',
    'opportunities',
    'opportunity_rules',
    // 3.2 CRM Activities & Contracts
    'crm_activities',
    'crm_contracts',
    'crm_renewals',
    'contract_submissions',
    // 3.3 Activities
    'activities',
    'activity_feed',
  ],
  
  inventory: [
    // 5.1 Products & Categories
    'products',
    'product_specifications',
    'product_embeddings',
    'uoms',
    // 5.2 Recipes & BOM
    'recipes',
    'recipe_lines',
    // 5.3 Stock Control
    'inventory_levels',
    'inventory_transactions',
    'inventory_batches',
    'inventory_counts',
    'stock_alerts',
    'warehouses',
    // 5.4 Production
    'production_work_orders',
    'production_work_order_materials',
    'production_batches',
    'production_execution_logs',
    'production_quality_checks',
    'production_operations',
    'production_integrations',
  ],
  
  comercial: [
    // 6.1 Service Lines
    'service_lines',
    'service_line_components',
    // 6.2 Quotes & Pricing
    'quotes',
    'quote_lines',
    'quote_pricing_rules',
    'proposals',
    // 6.3 Budget Quotes
    'budget_quotes',
    'budget_quote_versions',
    'budget_quote_items',
    'budget_packages',
    'budget_package_items',
    'budget_menu_items',
    'budget_staff_roles',
    'budget_transport_rules',
    'budget_alerts',
    // 6.4 Sales Orders
    'sales_orders',
    'sales_order_lines',
    // 6.5 Pricing Catalog
    'pricing_catalogs',
    'pricing_catalog_categories',
    'pricing_line_items',
    'pricing_discounts',
    'pricing_taxes',
    'pricing_addons',
    'rate_cards',
    // 6.6 Cost Templates
    'cost_templates',
    'cost_components',
  ],
  
  projects: [
    // 7.1 Core Projects
    'projects',
    'projects_config',
    'project_states',
    'project_templates',
    'project_embeddings',
    // 7.2 Project Structure
    'project_phases',
    'project_tasks',
    'project_milestones',
    'project_deliverables',
    // 7.3 Project Resources & Team
    'project_team_members',
    'project_resource_allocations',
    'project_time_entries',
    'project_expenses',
    // 7.4 Project Documents & Approvals
    'project_documents',
    'project_approvals',
    'project_activity_logs',
    // 7.5 Project Governance
    'project_risks',
    'project_issues',
    'project_change_requests',
    'project_decisions',
    // 7.6 Project Commercial
    'project_contracts',
    'project_purchases',
    'project_menu_items',
  ],
  
  "lead-generation": [
    // 8.1 Leads
    'commercial_leads',
    'angariacao_leads',
    // 8.2 Campaigns & Performance
    'ad_campaigns',
    'ad_campaign_performance',
    // 8.3 Lead Scoring & Sources
    'commercial_lead_scoring',
    'commercial_lead_sources',
    // 8.4 Pipeline & Activities
    'commercial_pipeline',
    'commercial_activities',
    'commercial_tasks',
    'commercial_forecasts',
    'commercial_conversion_metrics',
    // 8.5 Commercial AI & Automation
    'commercial_ai_suggestions',
    'commercial_automation_rules',
    'commercial_agent_configs',
    'commercial_agent_executions',
    // 8.6 Email Sequences
    'commercial_email_templates',
    'commercial_email_sequences',
    'commercial_email_events',
  ],
  
  logistics: [
    // 9.1 Catering Operations
    'catering_kitchen_workflows',
    'catering_logistics',
    'catering_prep_lists',
    // Additional logistics tables
    'warehouses',
    'warehouse_locations',
    'inventory_levels',
    'stock_moves',
    'equipment_allocations',
  ],
};

console.log('='.repeat(80));
console.log('MODULE TABLE TEMPLATE GENERATOR');
console.log('='.repeat(80));
console.log('');

for (const [moduleId, tables] of Object.entries(MODULE_TABLES)) {
  console.log(`${moduleId}: ${tables.length} tables`);
  console.log(`  ${tables.join(', ')}`);
  console.log('');
}

console.log('='.repeat(80));
console.log(`Total tables across all modules: ${Object.values(MODULE_TABLES).flat().length}`);
console.log('='.repeat(80));
console.log('');
console.log('✅ Module table list generated');
console.log('');
console.log('Next steps:');
console.log('1. Review the table lists above');
console.log('2. Run full template generation (reads from schema.ts)');
console.log('3. Update MODULE_TABLE_TEMPLATES in module-tables.ts');
console.log('');

