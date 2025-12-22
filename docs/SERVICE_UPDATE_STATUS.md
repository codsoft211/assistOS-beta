# Service Layer Update Status

**Last Updated:** 2025-11-27  
**Purpose:** Track progress on updating services to use schema-aware queries

---

## Overview

As tenant-scoped tables are migrated to tenant schemas, services need to be updated to use `TenantQueryBuilder` instead of direct Drizzle queries to the `public` schema.

---

## Migration Status

### ✅ Completed

1. **Documentation**
   - ✅ Created `TENANT_SCHEMA_TABLES.md` - Reference for which tables are in tenant schemas
   - ✅ Added JSDoc comments to key tables in `shared/schema.ts` indicating they are tenant schema tables
   - ✅ Created `SERVICE_MIGRATION_GUIDE.md` - Guide for updating services

2. **Infrastructure**
   - ✅ `TenantQueryBuilder` utility ready and tested
   - ✅ Example service (`client.service.ts`) with migration pattern documented

### 🔄 In Progress

1. **Services Requiring Updates**

   **High Priority (Frequently Used):**
   - [ ] `tenant.service.ts` - `user_tenants` queries (special case: cross-tenant queries)
   - [ ] `client.service.ts` - Clients CRUD (has pattern, needs implementation)
   - [ ] Route handlers: `crm.ts`, `inventory.ts`, `financeiro.ts`, `compras.ts`

   **Medium Priority:**
   - [ ] `module.service.ts` - Module management
   - [ ] `context.service.ts` - User context (partially updated)
   - [ ] `assistbuild-context.service.ts` - AssistBuild context

   **Lower Priority:**
   - [ ] Background jobs and workers
   - [ ] Integration services
   - [ ] Other route handlers

---

## Special Cases

### `user_tenants` Table

**Challenge:** `user_tenants` is tenant-scoped but needs cross-tenant queries (e.g., "get all tenants for a user").

**Current Status:** Table has been migrated to tenant schemas, but queries still use public schema.

**Solution Options:**
1. **Cross-Schema Query Helper**: Query all tenant schemas and UNION results
2. **Denormalized View**: Keep a read-only view in public schema
3. **Hybrid Approach**: Write to tenant schema, read from public view

**Recommended:** Option 3 (Hybrid) - Write operations use `TenantQueryBuilder`, read operations use a materialized view or denormalized table in public schema.

**Implementation:**
```typescript
// Write operations (use TenantQueryBuilder)
const queryBuilder = createTenantQueryBuilder(tenantId, environment);
await queryBuilder.insert('user_tenants', { userId, role, ... });

// Read operations (cross-tenant - use public schema view)
// TODO: Create materialized view or denormalized table
const userTenants = await db.select().from(userTenantsView).where(...);
```

---

## Migration Pattern

### Before (Public Schema)
```typescript
const clients = await db
  .select()
  .from(clients)
  .where(
    and(
      eq(clients.tenantId, tenantId),
      eq(clients.environment, environment)
    )
  );
```

### After (Tenant Schema)
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

// DELETE
await queryBuilder.delete('clients', {
  id: clientId
});
```

---

## Next Steps

1. **Immediate:**
   - [ ] Create helper for cross-tenant `user_tenants` queries
   - [ ] Update `tenant.service.ts` to use `TenantQueryBuilder` for write operations
   - [ ] Update `client.service.ts` to actually use `TenantQueryBuilder` (currently has TODOs)

2. **Short Term:**
   - [ ] Update route handlers (`crm.ts`, `inventory.ts`, etc.) to use `TenantQueryBuilder`
   - [ ] Update `module.service.ts` for module management queries
   - [ ] Test each service after update

3. **Medium Term:**
   - [ ] Update all remaining services
   - [ ] Update background jobs and workers
   - [ ] Performance testing and optimization

---

## Testing Checklist

For each service update:
- [ ] Unit tests pass
- [ ] Integration tests with real tenant schema
- [ ] Verify queries work correctly
- [ ] Verify data isolation (no cross-tenant leakage)
- [ ] Performance is acceptable

---

## Related Documentation

- `docs/TENANT_SCHEMA_TABLES.md` - Which tables are in tenant schemas
- `docs/SERVICE_MIGRATION_GUIDE.md` - Detailed migration guide
- `apps/api/utils/tenant-query-builder.ts` - Query builder implementation
- `apps/api/services/client.service.ts` - Example service with migration pattern

