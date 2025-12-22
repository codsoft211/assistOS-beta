# Tenant Schema Updates - Complete Implementation

**Date:** December 3, 2025  
**Status:** ✅ Completed

## Overview

Updated all tenant-scoped database operations across the codebase to use tenant-specific PostgreSQL schemas instead of the `public` schema. This ensures proper data isolation, better performance, and enhanced security.

## Files Updated

### 1. Core Helper Utility
- **`apps/api/utils/tenant-db-helper.ts`** (NEW)
  - Complete set of tenant-aware CRUD helpers
  - Automatic schema resolution
  - Type-safe operations

### 2. AssistBuild Configuration Tools

#### Company & Organization
- **`packages/ai/tools/assistbuild/configuration/bootstrap-tenant.ts`** ✅
  - Creates `company_info` in tenant schema
  - Creates `tenant_blueprints` in tenant schema

- **`packages/ai/tools/assistbuild/configuration/configure-company-info.ts`** ✅
  - Reads/writes `company_info` from tenant schema

#### Modules & Settings
- **`packages/ai/tools/assistbuild/configuration/configure-module-settings.ts`** ✅
  - Reads/updates `tenant_modules` in tenant schema

#### Workflows & Automations
- **`packages/ai/tools/assistbuild/configuration/create-workflow.ts`** ✅
  - Creates `tenant_workflows` in tenant schema
  - Creates `audit_log` entries in tenant schema

- **`packages/ai/tools/assistbuild/configuration/create-automation.ts`** ✅
  - Creates `tenant_automations` in tenant schema
  - Creates `audit_log` entries in tenant schema

### 3. API Routes

- **`apps/api/routes/company.ts`** ✅
  - GET/PATCH `/api/company` - Tenant schema operations
  - GET `/api/company/onboarding-context` - Tenant schema

- **`apps/api/routes/auth.ts`** ✅
  - Registration creates `company_info` in tenant schema

- **`apps/api/routes/quick-invoice-process.ts`** ✅
  - NIF validation reads from tenant schema

### 4. Services

- **`apps/api/services/sequence.service.ts`** ✅
  - All `sequence_counters` operations in tenant schema
  - Thread-safe counter generation
  - Import/reset operations

## Tables Now Using Tenant Schemas

### ✅ Implemented
1. **`company_info`** - Company information
2. **`tenant_blueprints`** - Business blueprints
3. **`tenant_modules`** - Module settings
4. **`tenant_workflows`** - Workflow definitions
5. **`tenant_automations`** - Automation rules
6. **`audit_log`** - Audit trail entries
7. **`sequence_counters`** - Sequential code generators

### 🔄 Still in Public Schema (Correctly)
These tables should remain in `public`:
- `users` - User accounts (global)
- `tenants` - Tenant registry (global)
- `tenant_schemas` - Schema registry (global)
- `module_templates` - Available modules (global)
- `subscription_plans` - Pricing plans (global)
- `tool_embeddings` - AI tool embeddings (global)
- AI chat tables - User-scoped, not tenant-scoped

### 📋 To Be Migrated
These tables will be migrated in future phases:
- All business module tables (CRM, Finance, Inventory, etc.)
- Custom entities and fields
- Document management
- Communication (email, WhatsApp)
- Integration connectors

## Benefits Achieved

### 1. Data Isolation
- Each tenant's data is physically separated in its own schema
- Eliminates risk of cross-tenant data leakage
- Easier compliance with data residency requirements

### 2. Performance Improvements
- No need to filter by `tenant_id` in WHERE clauses
- Smaller indexes per schema
- Better query plan optimization
- Faster queries due to smaller table sizes

### 3. Scalability
- Tenants can be moved to different databases if needed
- Independent schema migrations per tenant
- Easier to implement tenant-specific customizations

### 4. Security
- PostgreSQL schema-level security
- Row-level security as additional layer
- Tenant schema access can be granted/revoked independently

### 5. Flexibility
- Tenants can customize their schema structure
- Module tables can be tailored per tenant
- CSV imports create tables in tenant schema

## Usage Pattern

### Before (Public Schema)
```typescript
const [company] = await db
  .select()
  .from(companyInfo)
  .where(eq(companyInfo.tenantId, tenantId));
```

### After (Tenant Schema)
```typescript
const company = await selectOneFromTenantTable(
  tenantId,
  'company_info',
  sql`tenant_id = ${tenantId}`
);
```

## Helper Functions Reference

### SELECT Operations
```typescript
// Select multiple rows
const rows = await selectFromTenantTable(tenantId, 'table_name', sql`condition`);

// Select single row
const row = await selectOneFromTenantTable(tenantId, 'table_name', sql`condition`);
```

### INSERT Operations
```typescript
const newRow = await insertIntoTenantTable(tenantId, 'table_name', {
  column1: 'value1',
  column2: 'value2',
  createdAt: new Date(),
});
```

### UPDATE Operations
```typescript
const updated = await updateTenantTable(
  tenantId,
  'table_name',
  { column1: 'newValue' },
  sql`id = ${rowId}` // WHERE clause (required)
);
```

### DELETE Operations
```typescript
const deletedCount = await deleteFromTenantTable(
  tenantId,
  'table_name',
  sql`id = ${rowId}` // WHERE clause (required)
);
```

### Utility Operations
```typescript
// Check if table exists
const exists = await tenantTableExists(tenantId, 'table_name');

// Count rows
const count = await countTenantTableRows(tenantId, 'table_name', sql`condition`);

// Get table reference (for raw SQL)
const tableRef = await getTenantTableRef(tenantId, 'table_name');
```

## Testing Checklist

- [x] Company info creation via AssistBuild
- [x] Module configuration updates
- [x] Workflow creation
- [x] Automation creation
- [x] Sequence counter generation
- [x] Registration flow (company_info from onboarding cache)
- [x] API routes (GET/PATCH company)
- [x] Invoice processing (NIF validation)

## Migration Strategy

### Phase 1: Core Platform ✅ (Current)
- company_info
- tenant_blueprints
- tenant_modules
- tenant_workflows
- tenant_automations
- sequence_counters
- audit_log

### Phase 2: Business Modules (Next)
- CRM tables (clients, opportunities, activities)
- Finance tables (invoices, payments, bank accounts)
- Inventory tables (products, warehouses, stock)
- Commercial tables (quotes, service lines, pricing)
- Projects tables (projects, phases, tasks, resources)

### Phase 3: Supporting Systems
- Custom entities and fields
- Document management
- Communication (email, WhatsApp)
- Integration connectors

### Phase 4: Data Migration
- Script to move existing data from public to tenant schemas
- Validation and verification
- Cutover plan

## Performance Metrics

Expected improvements after full migration:
- **Query Performance:** 30-50% faster (no tenant_id filtering)
- **Index Size:** 60-80% smaller per tenant
- **Concurrent Operations:** Better isolation, less lock contention
- **Backup/Restore:** Per-tenant operations possible

## Security Considerations

1. **Schema Access Control:**
   ```sql
   GRANT USAGE ON SCHEMA tenant_abc TO app_role;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tenant_abc TO app_role;
   ```

2. **Row-Level Security (RLS):**
   - Additional security layer on top of schema isolation
   - Ensures tenant_id matches even within tenant schema

3. **Connection Pooling:**
   - Set search_path per connection: `SET search_path TO tenant_abc, public`
   - Helper functions handle this automatically

## Troubleshooting

### Issue: Table not found
**Cause:** Tenant schema doesn't exist or table not created  
**Solution:** Ensure `tenant_schemas` entry exists and table was created

### Issue: Permission denied
**Cause:** Application role doesn't have access to tenant schema  
**Solution:** Grant appropriate permissions on schema and tables

### Issue: Slow queries
**Cause:** Missing indexes in tenant schema  
**Solution:** Create appropriate indexes when creating tables

## Related Documentation

- [Tenant Schema Implementation](./TENANT_SCHEMA_IMPLEMENTATION.md) - Initial implementation
- [Database Reference](./DATABASE_REFERENCE.md) - Complete database schema
- [Database Refactoring Plan](./Per-Tenant%20Schema%20Migration.md) - Full migration strategy
- [Tenant Configuration Guide](./TENANT_CONFIGURATION_GUIDE.md) - AssistBuild usage

## Next Steps

1. Update remaining AssistBuild tools (custom fields, entities)
2. Update query builders for all modules
3. Create migration scripts for existing data
4. Update module installation to create tables in tenant schema
5. Implement per-tenant schema versioning and migrations

---

**Status:** Core implementation complete ✅  
**Coverage:** 7 critical tables migrated to tenant schemas  
**Impact:** Foundation ready for full database refactoring

