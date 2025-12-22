#!/usr/bin/env tsx

/**
 * Generate Module Templates from Existing Tables
 * 
 * This script introspects existing tenant-scoped tables and generates
 * module templates that can be used for new tenant installations.
 * 
 * Usage: npm run generate:module-templates [--module=<module-id>]
 */

import '../../../load-env';
import { tableMigrationService } from '../services/table-migration.service';
import { Pool } from 'pg';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Comprehensive Module to Table Mapping (based on DATABASE_REFERENCE.md)
// This covers ALL modules and their associated tables
const MODULE_TABLE_MAPPING: Record<string, string[]> = {
  // ============================================================================
  // CRM MODULE
  // ============================================================================
  crm: [
    'clients',
    'client_embeddings',
    'opportunities',
    'opportunity_rules',
    'crm_activities',
    'crm_contracts',
    'crm_renewals',
    'contract_submissions',
  ],
  
  // ============================================================================
  // FINANCIAL MODULE
  // ============================================================================
  financial: [
    // Chart of Accounts & Journals
    'chart_of_accounts',
    'journal_entries',
    'journal_entry_lines',
    'fiscal_periods',
    // Invoicing (AR)
    'invoices',
    'invoice_items',
    'invoice_lines',
    'invoice_taxes',
    'invoice_validations',
    'invoice_embeddings',
    // Payables (AP)
    'payables',
    'payments',
    'payment_allocations',
    'payment_plans',
    'payment_reminders',
    'dunning_runs',
    // Banking & Treasury
    'bank_accounts',
    'bank_reconciliations',
    'bank_statement_transactions',
    'cashflow_snapshots',
    'employee_expenses',
    // Taxation
    'tax_categories',
    'tax_rates',
    'tax_jurisdictions',
    'tax_obligations',
    'vat_returns',
    // Open Banking
    'open_banking_connections',
    'open_banking_accounts',
    'open_banking_transactions',
    // Financial Models
    'financial_models',
    'financial_calculations',
    'financial_scenarios',
  ],
  
  // ============================================================================
  // INVENTORY MODULE
  // ============================================================================
  inventory: [
    // Products & Categories
    'products',
    'product_specifications',
    'product_embeddings',
    'uoms',
    // Recipes & BOM
    'recipes',
    'recipe_lines',
    // Stock Control
    'inventory_levels',
    'inventory_transactions',
    'inventory_batches',
    'inventory_counts',
    'stock_alerts',
    'warehouses',
    // Production
    'production_work_orders',
    'production_work_order_materials',
    'production_batches',
    'production_execution_logs',
    'production_quality_checks',
    'production_operations',
    'production_integrations',
  ],
  
  // ============================================================================
  // COMMERCIAL/SALES MODULE
  // ============================================================================
  sales: [
    // Service Lines
    'service_lines',
    'service_line_components',
    // Quotes & Pricing
    'quotes',
    'quote_lines',
    'quote_pricing_rules',
    'proposals',
    // Budget Quotes (Catering)
    'budget_quotes',
    'budget_quote_versions',
    'budget_quote_items',
    'budget_packages',
    'budget_package_items',
    'budget_menu_items',
    'budget_staff_roles',
    'budget_transport_rules',
    'budget_alerts',
    // Sales Orders
    'sales_orders',
    'sales_order_lines',
    // Pricing Catalog
    'pricing_catalogs',
    'pricing_catalog_categories',
    'pricing_line_items',
    'pricing_discounts',
    'pricing_taxes',
    'pricing_addons',
    'rate_cards',
    // Cost Templates
    'cost_templates',
    'cost_components',
  ],
  
  // ============================================================================
  // PROJECTS MODULE
  // ============================================================================
  projects: [
    // Core Projects
    'projects',
    'projects_config',
    'project_states',
    'project_templates',
    'project_embeddings',
    // Project Structure
    'project_phases',
    'project_tasks',
    'project_milestones',
    'project_deliverables',
    // Resources & Team
    'project_team_members',
    'project_resource_allocations',
    'project_time_entries',
    'project_expenses',
    // Documents & Approvals
    'project_documents',
    'project_approvals',
    'project_activity_logs',
    // Governance
    'project_risks',
    'project_issues',
    'project_change_requests',
    'project_decisions',
    // Commercial
    'project_contracts',
    'project_purchases',
  ],
  
  // ============================================================================
  // LEAD GENERATION (ANGARIACAO) MODULE
  // ============================================================================
  "lead-generation": [
    // Leads
    'commercial_leads',
    'angariacao_leads',
    // Campaigns
    'ad_campaigns',
    'ad_campaign_performance',
    // Lead Scoring & Sources
    'commercial_lead_scoring',
    'commercial_lead_sources',
    // Pipeline & Activities
    'commercial_pipeline',
    'commercial_activities',
    'commercial_tasks',
    'commercial_forecasts',
    'commercial_conversion_metrics',
    // AI & Automation
    'commercial_ai_suggestions',
    'commercial_automation_rules',
    'commercial_agent_configs',
    'commercial_agent_executions',
    // Email Sequences
    'commercial_email_templates',
    'commercial_email_sequences',
    'commercial_email_events',
  ],
  
  // ============================================================================
  // LOGISTICS MODULE
  // ============================================================================
  logistics: [
    'warehouses',
    'catering_kitchen_workflows',
    'catering_logistics',
    'catering_prep_lists',
  ],
  
  // ============================================================================
  // PURCHASING MODULE
  // ============================================================================
  purchasing: [
    'purchase_orders',
    'purchase_order_lines',
    'purchase_requisitions',
    'purchase_requisition_lines',
    'purchasing_invoices',
    'purchasing_invoice_lines',
    'purchasing_payments',
    'purchasing_payment_allocations',
    'suppliers',
    'supplier_embeddings',
    'supplier_invoices',
    'supplier_price_history',
    'supplier_returns',
    'supplier_return_lines',
    'rfqs',
    'rfq_lines',
    'rfq_quotes',
    'rfq_quote_lines',
    'receipts',
    'receipt_lines',
  ],
  
  // ============================================================================
  // DOCUMENT MANAGEMENT MODULE
  // ============================================================================
  documents: [
    'documents',
    'document_versions',
    'document_folders',
    'document_folder_links',
    'document_templates',
    'document_analyses',
    'document_classifications',
    'document_embeddings',
    'document_insights',
    'document_quality_checks',
    'document_entity_links',
    'document_email_links',
    'document_links',
    'document_permissions',
    'document_integrations',
    'file_attachments',
  ],
  
  // ============================================================================
  // COMMUNICATION MODULE
  // ============================================================================
  communication: [
    // Email
    'email_inbox',
    'email_alerts',
    'user_gmail_accounts',
    // WhatsApp
    'whatsapp_accounts',
    'whatsapp_contacts',
    'whatsapp_conversations',
    'whatsapp_messages',
    'whatsapp_templates',
    'whatsapp_web_sessions',
    // Notifications
    'notifications',
    'notification_rules',
  ],
  
  // ============================================================================
  // INTEGRATION & CONNECTOR MODULE
  // ============================================================================
  integrations: [
    'connectors',
    'connector_change_events',
    'connector_sync_state',
    'api_integrations',
    'webhooks',
    'provider_credentials',
    'provider_sync_jobs',
    'user_connector_credentials',
  ],
  
  // ============================================================================
  // AGENT & AUTOMATION MODULE
  // ============================================================================
  automation: [
    'custom_agents',
    'agent_budgets',
    'agent_executions',
    'agent_feedback',
    'agent_handoffs',
    'agent_interactions',
    'agent_learnings',
    'agent_role_assignments',
    'agent_runs',
    'agent_schedules',
    'agent_secrets',
    'agent_state',
    'agent_versions',
    'agent_workflows',
    'automation_executions',
    'approval_workflows',
    'conversion_agents',
    'specialized_agents',
    'tenant_automations',
  ],
  
  // ============================================================================
  // TASKS MODULE
  // ============================================================================
  tasks: [
    'tasks',
    'activities',
    'activity_feed',
  ],
  
  // ============================================================================
  // PRICING PROJECTS MODULE
  // ============================================================================
  pricing_projects: [
    'pricing_projects',
    'pricing_input_schemas',
    'pricing_rule_sets',
  ],
};

interface GeneratedTemplate {
  moduleId: string;
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      default?: string;
      primaryKey?: boolean;
    }>;
    indexes?: Array<{
      name: string;
      columns: string[];
      unique?: boolean;
    }>;
  }>;
}

async function generateModuleTemplates(moduleId?: string) {
  console.log('🚀 Generating Module Templates from Existing Tables...\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const modulesToProcess = moduleId 
      ? [moduleId]
      : Object.keys(MODULE_TABLE_MAPPING);

    const generatedTemplates: GeneratedTemplate[] = [];

    for (const modId of modulesToProcess) {
      const tableNames = MODULE_TABLE_MAPPING[modId];
      if (!tableNames) {
        console.log(`⚠️  Module ${modId} not found in mapping, skipping`);
        continue;
      }

      console.log(`\n📦 Processing module: ${modId}`);
      console.log(`   Tables: ${tableNames.length}`);

      const tables: any[] = [];

      for (const tableName of tableNames) {
        try {
          const tableDef = await tableMigrationService.getTableStructure(tableName);
          if (!tableDef) {
            console.log(`   ⚠️  Table ${tableName} not found, skipping`);
            continue;
          }

          // Convert to template format
          const templateTable = {
            name: tableName,
            columns: tableDef.columns.map(col => ({
              name: col.name,
              type: mapToTemplateType(col.type),
              nullable: !col.notNull,
              default: col.default,
              primaryKey: Array.isArray(tableDef.primaryKey)
                ? tableDef.primaryKey.includes(col.name)
                : tableDef.primaryKey === col.name,
            })),
          };

          tables.push(templateTable);
          console.log(`   ✅ ${tableName}: ${tableDef.columns.length} columns`);
        } catch (error: any) {
          console.log(`   ❌ Failed to process ${tableName}: ${error.message}`);
        }
      }

      if (tables.length > 0) {
        generatedTemplates.push({
          moduleId: modId,
          tables,
        });
        console.log(`   ✅ Generated template for ${modId}: ${tables.length} tables`);
      }
    }

    // Generate TypeScript code
    const templateCode = generateTemplateCode(generatedTemplates);
    
    // Write to file
    const outputPath = join(process.cwd(), 'packages/modules/templates/generated-module-templates.ts');
    writeFileSync(outputPath, templateCode, 'utf-8');
    
    console.log(`\n✅ Generated templates written to: ${outputPath}`);
    console.log(`   Total modules: ${generatedTemplates.length}`);
    console.log(`   Total tables: ${generatedTemplates.reduce((sum, m) => sum + m.tables.length, 0)}`);

  } catch (error) {
    console.error('\n❌ Generation failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

function mapToTemplateType(pgType: string): string {
  const typeMap: Record<string, string> = {
    'VARCHAR': 'varchar',
    'TEXT': 'text',
    'INTEGER': 'integer',
    'BIGINT': 'integer',
    'DECIMAL': 'decimal',
    'NUMERIC': 'decimal',
    'BOOLEAN': 'boolean',
    'TIMESTAMP': 'timestamp',
    'DATE': 'date',
    'JSONB': 'jsonb',
  };

  return typeMap[pgType.toUpperCase()] || 'text';
}

function generateTemplateCode(templates: GeneratedTemplate[]): string {
  let code = `/**
 * Auto-Generated Module Templates
 * 
 * Generated: ${new Date().toISOString()}
 * Source: Existing database tables
 * 
 * These templates are generated from existing tables and can be used
 * for new tenant installations. Merge with existing templates in
 * module-tables.ts as needed.
 */

import type { ModuleTableTemplate } from './module-tables';

export const GENERATED_MODULE_TEMPLATES: Record<string, ModuleTableTemplate> = {
`;

  for (const template of templates) {
    code += `  ${template.moduleId}: {\n`;
    code += `    moduleId: '${template.moduleId}',\n`;
    code += `    tables: [\n`;

    for (const table of template.tables) {
      code += `      {\n`;
      code += `        name: '${table.name}',\n`;
      code += `        columns: [\n`;

      for (const col of table.columns) {
        code += `          {\n`;
        code += `            name: '${col.name}',\n`;
        code += `            type: '${col.type}' as const`;
          
        if (col.nullable !== undefined) {
          code += `,\n            nullable: ${col.nullable}`;
        }
        
        if (col.default) {
          code += `,\n            default: ${JSON.stringify(col.default)}`;
        }
        
        if (col.primaryKey) {
          code += `,\n            primaryKey: true`;
        }
        
        code += `,\n          },\n`;
      }

      code += `        ],\n`;
      code += `      },\n`;
    }

    code += `    ],\n`;
    code += `  },\n\n`;
  }

  code += `};\n`;

  return code;
}

// Parse command line arguments
const args = process.argv.slice(2);
let moduleId: string | undefined;

args.forEach(arg => {
  if (arg.startsWith('--module=')) {
    moduleId = arg.split('=')[1];
  }
});

// Run generation
generateModuleTemplates(moduleId)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

