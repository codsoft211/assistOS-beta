# Tenant Schema Implementation

**Date:** December 3, 2025  
**Status:** ✅ Implemented

## Overview

Implemented schema-aware database helpers that route tenant-scoped table operations to per-tenant PostgreSQL schemas instead of the `public` schema.

## Problem

When using AssistBuild to configure company info (via `bootstrap_tenant` or `configure_company_info` tools), data was being saved to `public.company_info` instead of the tenant's own schema (`tenant_<uuid>.company_info`).

## Solution

Created a tenant-aware database helper utility (`tenant-db-helper.ts`) that:
1. Resolves tenant ID to schema name via `tenantSchemaService`
2. Generates schema-qualified table references (e.g., `"tenant_abc"."company_info"`)
3. Provides CRUD operations that automatically target the correct tenant schema

## Files Created

### `apps/api/utils/tenant-db-helper.ts`
Provides helper functions for tenant-scoped database operations:
- `getTenantTableRef()` - Get schema-qualified table reference
- `selectFromTenantTable()` - SELECT queries
- `selectOneFromTenantTable()` - SELECT with LIMIT 1
- `insertIntoTenantTable()` - INSERT queries  
- `updateTenantTable()` - UPDATE queries
- `deleteFromTenantTable()` - DELETE queries
- `tenantTableExists()` - Check if table exists in tenant schema
- `countTenantTableRows()` - Count rows in tenant table

## Files Updated

### AssistBuild Tools
1. **`packages/ai/tools/assistbuild/configuration/configure-company-info.ts`**
   - Now uses `selectOneFromTenantTable()` to check existing company
   - Uses `updateTenantTable()` to update in tenant schema

2. **`packages/ai/tools/assistbuild/configuration/bootstrap-tenant.ts`**
   - Now uses `insertIntoTenantTable()` to create company_info in tenant schema
   - Creates tenant_blueprints in tenant schema as well

### API Routes
3. **`apps/api/routes/company.ts`**
   - GET `/api/company` - Reads from tenant schema
   - PATCH `/api/company` - Updates tenant schema
   - GET `/api/company/onboarding-context` - Reads from tenant schema

4. **`apps/api/routes/auth.ts`**
   - Registration flow creates company_info in tenant schema (from onboarding cache)

5. **`apps/api/routes/quick-invoice-process.ts`**
   - NIF validation reads from tenant schema

## Usage Example

### Before (public schema)
```typescript
const [company] = await db
  .select()
  .from(companyInfo)
  .where(eq(companyInfo.tenantId, tenantId));
```

### After (tenant schema)
```typescript
const company = await selectOneFromTenantTable(
  tenantId,
  'company_info',
  sql`tenant_id = ${tenantId}`
);
```

## Benefits

1. **Data Isolation:** Each tenant's data is in their own PostgreSQL schema
2. **Performance:** No need to filter by `tenant_id` in queries (schema isolation provides it)
3. **Scalability:** Better query optimization, smaller indexes per schema
4. **Security:** Physical schema separation prevents cross-tenant data leaks
5. **Flexibility:** Tenants can customize their schema without affecting others

## Testing

To test the implementation:

1. **Create a new tenant** (ensures schema is created automatically)
2. **Use AssistBuild** to configure company info
3. **Verify data location:**
   ```sql
   -- Check tenant schema exists
   SELECT * FROM tenant_schemas WHERE tenant_id = 'your-tenant-id';
   
   -- Verify data is in tenant schema (not public)
   SELECT * FROM tenant_abc.company_info;
   
   -- Public should be empty for this tenant
   SELECT * FROM public.company_info WHERE tenant_id = 'your-tenant-id'; -- Should be empty
   ```

## Migration Path

For existing tenants with data in `public` schema:
1. Run migration to move data from `public` to tenant schemas
2. Follow the refactoring plan in `docs/DATABASE_REFERENCE.md`

## Schema Classification

### Tables in Public Schema
- User accounts (`users`)
- Tenants registry (`tenants`, `tenant_schemas`)
- Module templates (`module_templates`)
- Subscription plans (`subscription_plans`)
- Tool embeddings (`tool_embeddings`)
- AI chat conversations (user-scoped, not tenant-scoped)

### Tables in Tenant Schemas
- `company_info` ✅ (now implemented)
- `tenant_blueprints` ✅ (now implemented)
- All business module tables (CRM, Finance, Inventory, etc.)
- Configuration tables
- Custom entities
- Module pages and features

## Next Steps

1. Update remaining tools to use tenant schema helpers
2. Migrate module table creation to use tenant schemas
3. Update query builders to use schema-aware queries
4. Create migration script for existing data

## Related Documents

- [Database Reference](/docs/DATABASE_REFERENCE.md)
- [Database Refactoring Plan](/docs/Per-Tenant%20Schema%20Migration.md)
- [Tenant Configuration Guide](/docs/TENANT_CONFIGURATION_GUIDE.md)

