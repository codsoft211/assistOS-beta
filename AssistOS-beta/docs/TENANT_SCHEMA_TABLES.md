# Tenant Schema Tables Reference

**Last Updated:** 2025-11-27  
**Purpose:** Documents which tables are stored in tenant-specific schemas vs. the public schema

---

## Overview

As part of the database refactoring, tenant-scoped tables are being migrated from the `public` schema to isolated tenant schemas (e.g., `tenant_acme_corp`). This provides:

- **Data Isolation**: Each tenant's data is completely isolated
- **Customization**: Tenants can customize their schema structure
- **Performance**: Better query performance with schema-level isolation
- **Security**: Reduced risk of cross-tenant data leakage

---

## Schema Location Rules

### Public Schema (Global/Platform-wide)
- **User accounts**: `users`, `user_sessions`
- **Tenant registry**: `tenants`, `tenant_schemas`
- **Module templates**: `module_templates` (global definitions)
- **Subscription/billing**: `subscriptions`, `billing_events`
- **AI chat systems**: `conversations`, `messages`, `conversation_insights` (user-scoped, not tenant-scoped)
- **AssistBuild chat**: `assistbuild_conversations`, `assistbuild_messages` (user-scoped)
- **AssistSettings chat**: `assistsettings_conversations`, `assistsettings_messages` (user-scoped)

### Tenant Schemas (Per-Tenant Isolated)
All tables marked with **T** (Tenant-scoped) in `DATABASE_REFERENCE.md` should be in tenant schemas, including:

#### Core Platform Tables (Tenant-Scoped)
- `user_tenants` - User-tenant membership
- `company_info` - Company details
- `departments` - Organizational departments
- `teams`, `team_members` - Team management
- `tenant_context` - Business context for AI
- `tenant_blueprints` - Business blueprint
- `tenant_modules` - Active modules per tenant
- `module_features` - Feature flags
- `module_pages` - Navigation structure
- `sequence_counters` - Auto-increment codes

#### CRM Module Tables
- `clients` - Customer/client records
- `client_contacts` - Client contact information
- `client_documents` - Client document links
- `opportunities` - Sales opportunities
- `opportunity_rules` - Opportunity automation
- `crm_activities` - Activity log
- `crm_contracts` - Customer contracts
- `crm_renewals` - Contract renewals

#### Financial Module Tables
- `invoices`, `invoice_items`, `invoice_lines` - Customer invoices
- `payables`, `payments`, `payment_allocations` - Accounts payable
- `bank_accounts`, `bank_reconciliations` - Banking
- `chart_of_accounts` - Accounting chart
- `journal_entries`, `journal_entry_lines` - Journal entries
- All other financial tables (see `DATABASE_REFERENCE.md` section 4)

#### Inventory Module Tables
- `products` - Product catalog
- `product_specifications` - Product specs
- `uoms` - Units of measure
- `recipes`, `recipe_lines` - Recipe/BOM
- `inventory_levels` - Stock levels
- `inventory_transactions` - Stock movements
- `warehouses` - Warehouse locations
- All production tables

#### Commercial/Sales Module Tables
- `quotes`, `quote_lines` - Sales quotes
- `service_lines`, `service_line_components` - Service bundles
- `sales_orders`, `sales_order_lines` - Sales orders
- `pricing_catalogs`, `pricing_line_items` - Pricing
- All budget quote tables

#### Projects Module Tables
- `projects` - Project records
- `project_phases`, `project_tasks` - Project structure
- `project_milestones`, `project_deliverables` - Milestones
- `project_team_members` - Team assignments
- All project-related tables

#### Lead Generation (Angariacao) Module Tables
- `commercial_leads` - Lead records
- `commercial_lead_scoring` - Lead scoring
- `commercial_pipeline` - Pipeline stages
- All lead generation tables

#### Purchasing Module Tables
- `purchase_orders`, `purchase_order_lines` - Purchase orders
- `suppliers` - Supplier records
- `rfqs`, `rfq_quotes` - RFQ process
- All procurement tables

#### Document Management Tables
- `documents`, `document_versions` - Document records
- `document_folders` - Folder structure
- `document_analyses` - AI analysis
- All document-related tables

#### Communication Tables
- `email_inbox` - Synced emails
- `whatsapp_accounts`, `whatsapp_messages` - WhatsApp
- `notifications` - User notifications

#### Integration & Automation Tables
- `connectors` - Integration connectors
- `custom_agents` - Custom AI agents
- `automation_executions` - Automation runs
- All integration/automation tables

---

## Migration Status

### ✅ Completed Migrations
- `user_tenants` - Migrated to tenant schemas

### 🔄 In Progress
- Core platform tables
- Module tables (CRM, Financial, Inventory, etc.)

### 📋 Pending
- All other tenant-scoped tables listed above

---

## Querying Tenant Schema Tables

### Using TenantQueryBuilder (Recommended)

```typescript
import { createTenantQueryBuilder } from '../utils/tenant-query-builder';

const queryBuilder = createTenantQueryBuilder(tenantId, environment);

// SELECT
const clients = await queryBuilder.select('clients', {
  status: 'active'
});

// INSERT
const newClient = await queryBuilder.insert('clients', {
  name: 'Acme Corp',
  email: 'contact@acme.com'
});

// UPDATE
await queryBuilder.update('clients', {
  status: 'inactive'
}, {
  id: clientId
});
```

### Direct SQL (Advanced)

```typescript
import { tenantSchemaService } from '../services/tenant-schema.service';

const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
const query = sql`SELECT * FROM ${sql.identifier(schemaName, 'clients')} WHERE tenant_id = ${tenantId}`;
```

---

## Drizzle Schema Definitions

**Note:** The Drizzle schema definitions in `shared/schema.ts` remain unchanged for type safety. The table structures are still defined there, but at runtime, these tables exist in tenant schemas, not the public schema.

When querying:
- **Type Safety**: Use Drizzle table definitions from `shared/schema.ts`
- **Runtime Queries**: Use `TenantQueryBuilder` to query the correct tenant schema
- **Schema Resolution**: `TenantQueryBuilder` automatically resolves the tenant schema name

---

## Cross-Schema Foreign Keys

PostgreSQL supports foreign keys across schemas. For example:
- `tenant_schema.clients` can reference `public.users`
- `tenant_schema.invoices` can reference `tenant_schema.clients`

This allows maintaining referential integrity while keeping data isolated.

---

## See Also

- `docs/DATABASE_REFERENCE.md` - Complete table reference
- `docs/SERVICE_MIGRATION_GUIDE.md` - Guide for updating services
- `apps/api/utils/tenant-query-builder.ts` - Query builder implementation

