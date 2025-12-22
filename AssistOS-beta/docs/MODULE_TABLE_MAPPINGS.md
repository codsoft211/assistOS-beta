# Module Table Mappings for Query Builders

**Date:** December 3, 2025  
**Purpose:** Complete table mappings for all module query builders

---

## Overview

When a module is installed via AssistBuild, **ALL tables** for that module are created in the tenant's schema. Query builders need to support querying **all these tables**, not just the main ones.

**Total Tables:** 158 across 8 modules

---

## 1. Financial (Financeiro) Module - 32 Tables

### Chart of Accounts & Journals (4 tables)
- `chart_of_accounts` - Accounting chart
- `journal_entries` - Journal entries
- `journal_entry_lines` - Journal line items
- `fiscal_periods` - Fiscal period definitions

### Invoicing / AR (6 tables)
- `invoices` - Customer invoices
- `invoice_items` - Invoice line items
- `invoice_lines` - Alternative invoice lines
- `invoice_taxes` - Tax breakdowns
- `invoice_validations` - Invoice validation checks
- `invoice_embeddings` - Invoice semantic search

### Payables / AP (6 tables)
- `payables` - Accounts payable records
- `payments` - Payment records
- `payment_allocations` - Payment-to-invoice allocation
- `payment_plans` - Payment plan schedules
- `payment_reminders` - Payment reminder log
- `dunning_runs` - Dunning process executions

### Banking & Treasury (5 tables)
- `bank_accounts` - Bank account records
- `bank_reconciliations` - Reconciliation records
- `bank_statement_transactions` - Imported bank transactions
- `cashflow_snapshots` - Cashflow forecast snapshots
- `employee_expenses` - Employee expense claims

### Taxation (5 tables)
- `tax_categories` - Tax category definitions
- `tax_rates` - Tax rate percentages
- `tax_jurisdictions` - Tax jurisdiction rules
- `tax_obligations` - Tax filing obligations
- `vat_returns` - VAT return records

### Open Banking (3 tables)
- `open_banking_connections` - Bank API connections
- `open_banking_accounts` - Connected bank accounts
- `open_banking_transactions` - Synced transactions

### Financial Models (3 tables)
- `financial_models` - Financial model definitions
- `financial_calculations` - Calculation results
- `financial_scenarios` - Scenario planning

---

## 2. Purchasing (Compras) Module - 21 Tables

### Suppliers (4 tables)
- `suppliers` - Supplier records
- `supplier_embeddings` - Supplier semantic search
- `product_suppliers` - Product-supplier links
- `supplier_price_history` - Price history tracking

### RFQs & Quotes (4 tables)
- `rfqs` - Request for quotes
- `rfq_lines` - RFQ line items
- `rfq_quotes` - Supplier quotes
- `rfq_quote_lines` - Quote line items

### Purchase Orders (4 tables)
- `purchase_orders` - Purchase orders
- `purchase_order_lines` - PO line items
- `purchase_requisitions` - Purchase requisitions
- `purchase_requisition_lines` - Requisition lines

### Receipts & Returns (4 tables)
- `receipts` - Goods receipts
- `receipt_lines` - Receipt line items
- `supplier_returns` - Supplier returns
- `supplier_return_lines` - Return line items

### Supplier Invoices (5 tables)
- `supplier_invoices` - Supplier invoices (AP)
- `purchasing_invoices` - Purchasing invoices
- `purchasing_invoice_lines` - Invoice line items
- `purchasing_payments` - Payments to suppliers
- `purchasing_payment_allocations` - Payment allocations

---

## 3. CRM Module - 11 Tables

### Core CRM (5 tables)
- `clients` - Customer/client records
- `client_embeddings` - Client semantic search
- `entities` - Universal people/companies
- `opportunities` - Sales opportunities
- `opportunity_rules` - Opportunity automation rules

### CRM Activities & Contracts (4 tables)
- `crm_activities` - Activity log (calls, meetings)
- `crm_contracts` - Customer contracts
- `crm_renewals` - Contract renewals
- `contract_submissions` - OCR contract uploads

### Activities (2 tables)
- `activities` - Cross-module activity feed
- `activity_feed` - Activity timeline

---

## 4. Inventory Module - 19 Tables

### Products & Categories (4 tables)
- `products` - Product catalog
- `product_specifications` - Product specifications
- `product_embeddings` - Product semantic search
- `uoms` - Units of measure

### Recipes & BOM (2 tables)
- `recipes` - Recipe/BOM headers
- `recipe_lines` - Recipe ingredients

### Stock Control (6 tables)
- `inventory_levels` - Current stock levels
- `inventory_transactions` - Stock movement history
- `inventory_batches` - Batch/lot tracking
- `inventory_counts` - Stock count records
- `stock_alerts` - Low stock alerts
- `warehouses` - Warehouse locations

### Production (7 tables)
- `production_work_orders` - Production work orders
- `production_work_order_materials` - WO material requirements
- `production_batches` - Production batch tracking
- `production_execution_logs` - Execution audit log
- `production_quality_checks` - QC inspection records
- `production_operations` - Production operations
- `production_integrations` - External system sync

---

## 5. Commercial (Comercial) Module - 26 Tables

### Service Lines (2 tables)
- `service_lines` - Commercial service bundles
- `service_line_components` - Bundle components

### Quotes & Pricing (4 tables)
- `quotes` - Sales quotes
- `quote_lines` - Quote line items
- `quote_pricing_rules` - Dynamic pricing rules
- `proposals` - Sales proposals

### Budget Quotes (9 tables)
- `budget_quotes` - Catering budget quotes
- `budget_quote_versions` - Quote version history
- `budget_quote_items` - Quote item details
- `budget_packages` - Package configurations
- `budget_package_items` - Package line items
- `budget_menu_items` - Menu item configurations
- `budget_staff_roles` - Staff role pricing
- `budget_transport_rules` - Transport cost rules
- `budget_alerts` - Budget threshold alerts

### Sales Orders (2 tables)
- `sales_orders` - Confirmed sales orders
- `sales_order_lines` - Order line items

### Pricing Catalog (7 tables)
- `pricing_catalogs` - Price list catalogs
- `pricing_catalog_categories` - Catalog categories
- `pricing_line_items` - Catalog line items
- `pricing_discounts` - Discount rules
- `pricing_taxes` - Tax configurations
- `pricing_addons` - Add-on products
- `rate_cards` - Service rate cards

### Cost Templates (2 tables)
- `cost_templates` - Cost calculation templates
- `cost_components` - Cost breakdown components

---

## 6. Projects (Projetos) Module - 23 Tables

### Core Projects (5 tables)
- `projects` - Project records
- `projects_config` - Project type configurations
- `project_states` - Project state machine
- `project_templates` - Project templates
- `project_embeddings` - Project semantic search

### Project Structure (4 tables)
- `project_phases` - Project phases/stages
- `project_tasks` - Task management
- `project_milestones` - Milestone tracking
- `project_deliverables` - Deliverable definitions

### Project Resources & Team (4 tables)
- `project_team_members` - Team membership
- `project_resource_allocations` - Resource scheduling
- `project_time_entries` - Time tracking
- `project_expenses` - Expense tracking

### Project Documents & Approvals (3 tables)
- `project_documents` - Document management
- `project_approvals` - Approval workflows
- `project_activity_logs` - Activity audit

### Project Governance (4 tables)
- `project_risks` - Risk register
- `project_issues` - Issue tracking
- `project_change_requests` - Change requests
- `project_decisions` - Decision log

### Project Commercial (3 tables)
- `project_contracts` - Project contracts
- `project_purchases` - Project purchases
- `project_menu_items` - Catering event menus

---

## 7. Lead Generation (Angariacao) Module - 18 Tables

### Leads (2 tables)
- `commercial_leads` - Lead records
- `angariacao_leads` - Alternative leads table

### Campaigns & Performance (2 tables)
- `ad_campaigns` - Ad campaign definitions
- `ad_campaign_performance` - Campaign metrics

### Lead Scoring & Sources (2 tables)
- `commercial_lead_scoring` - Lead scoring rules
- `commercial_lead_sources` - Lead source definitions

### Pipeline & Activities (5 tables)
- `commercial_pipeline` - Sales pipeline stages
- `commercial_activities` - Commercial activities
- `commercial_tasks` - Commercial tasks
- `commercial_forecasts` - Sales forecasts
- `commercial_conversion_metrics` - Conversion tracking

### Commercial AI & Automation (4 tables)
- `commercial_ai_suggestions` - AI-generated suggestions
- `commercial_automation_rules` - Automation rules
- `commercial_agent_configs` - Commercial agent settings
- `commercial_agent_executions` - Agent execution log

### Email Sequences (3 tables)
- `commercial_email_templates` - Email templates
- `commercial_email_sequences` - Drip campaigns
- `commercial_email_events` - Email event tracking

---

## 8. Logistics Module - 8 Tables

### Catering Operations (3 tables)
- `catering_kitchen_workflows` - Kitchen workflow definitions
- `catering_logistics` - Event logistics planning
- `catering_prep_lists` - Prep list generation

### Warehouse & Stock (5 tables)
- `warehouses` - Warehouse locations
- `warehouse_locations` - Warehouse zones/bins
- `inventory_levels` - Current stock levels
- `stock_moves` - Stock movements
- `equipment_allocations` - Equipment allocation tracking

---

## Query Builder Update Pattern

For each query builder, add complete table name mappings:

```typescript
export class FinanceiroQueryBuilder {
  private getTableName(entityName: string): string | null {
    const mapping: Record<string, string> = {
      // Chart of Accounts & Journals
      'chart_of_accounts': 'chart_of_accounts',
      'journal_entries': 'journal_entries',
      'journal_lines': 'journal_entry_lines',
      'fiscal_periods': 'fiscal_periods',
      
      // Invoicing
      'invoices': 'invoices',
      'invoice_items': 'invoice_items',
      'invoice_lines': 'invoice_lines',
      'invoice_taxes': 'invoice_taxes',
      'invoice_validations': 'invoice_validations',
      
      // Payments
      'payables': 'payables',
      'payments': 'payments',
      'payment_allocations': 'payment_allocations',
      'payment_plans': 'payment_plans',
      'payment_reminders': 'payment_reminders',
      
      // Banking
      'bank_accounts': 'bank_accounts',
      'bank_reconciliations': 'bank_reconciliations',
      'bank_transactions': 'bank_statement_transactions',
      
      // Taxation
      'tax_categories': 'tax_categories',
      'tax_rates': 'tax_rates',
      'tax_jurisdictions': 'tax_jurisdictions',
      
      // ... ALL 32 tables
    };
    
    return mapping[entityName] || null;
  }
}
```

---

## Implementation Status

✅ **Module Table Lists:** Defined in `module-table.service.ts`  
✅ **Dynamic Generator:** `schema-template-generator.service.ts` created  
✅ **Activate Module:** Updated to create ALL tables  
⏳ **Query Builder Mappings:** Need to add for each module

---

## Next Steps

**Switch to agent mode** and I'll:
1. Update all 6 query builders with complete table mappings
2. Add JOIN support for related tables
3. Create tests for all table queries
4. Verify module installation creates all 158 tables

**Estimated Time:** 2-3 hours

All infrastructure is ready - just need to add the mappings! 🚀

