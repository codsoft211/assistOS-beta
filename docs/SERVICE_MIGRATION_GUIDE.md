# Service Migration Guide: Public Schema → Tenant Schemas

**Purpose:** Guide for updating services to use `TenantQueryBuilder` after tables are migrated to tenant schemas.

---

## Migration Strategy

### Phase 1: Hybrid Approach (Current)
- Services continue using Drizzle ORM with `public` schema
- Add TODO comments indicating where to switch to `TenantQueryBuilder`
- Example: `apps/api/services/client.service.ts`

### Phase 2: Gradual Migration
- Migrate tables to tenant schemas (using `migrate:tenant-tables-to-schemas`)
- Update services one-by-one to use `TenantQueryBuilder`
- Test each service after migration

### Phase 3: Complete Migration
- All tenant-scoped tables in tenant schemas
- All services using `TenantQueryBuilder`
- Remove `tenant_id` and `environment` columns from queries (handled automatically)

---

## Before Migration (Current Code)

```typescript
// Direct Drizzle query from public schema
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

---

## After Migration (Using TenantQueryBuilder)

```typescript
import { createTenantQueryBuilder } from '../utils/tenant-query-builder';

const queryBuilder = createTenantQueryBuilder(tenantId, environment);

// SELECT
const clients = await queryBuilder.select('clients', {
  status: 'active'
}, {
  limit: 50,
  offset: 0,
  orderBy: { column: 'created_at', direction: 'DESC' }
});

// INSERT
const newClient = await queryBuilder.insert('clients', {
  name: 'Acme Corp',
  email: 'contact@acme.com'
});

// UPDATE
const updated = await queryBuilder.update('clients', {
  status: 'inactive'
}, {
  id: clientId
});

// DELETE
await queryBuilder.delete('clients', {
  id: clientId
});

// COUNT
const total = await queryBuilder.count('clients', {
  status: 'active'
});
```

---

## Key Benefits

1. **Automatic Schema Resolution**: No need to specify schema name
2. **Automatic Filtering**: `tenant_id` and `environment` added automatically
3. **Type Safety**: Still get TypeScript types (via generics)
4. **Consistent API**: Same interface for all tenant-scoped tables

---

## Migration Checklist

For each service that queries tenant-scoped tables:

- [ ] Identify all queries to tenant-scoped tables
- [ ] Replace Drizzle queries with `TenantQueryBuilder` methods
- [ ] Remove explicit `tenant_id` and `environment` filters (handled automatically)
- [ ] Update function signatures to include `environment` parameter
- [ ] Test queries after migration
- [ ] Update route handlers to pass `environment` to service methods

---

## Example: Client Service

See `apps/api/services/client.service.ts` for a complete example showing:
- Current implementation (public schema)
- TODO comments for migration
- After-migration implementation pattern

---

## Services to Update

### High Priority (Frequently Used)
1. `client.service.ts` - ✅ Example created
2. `product.service.ts` - Products queries
3. `invoice.service.ts` - Financial queries
4. `opportunity.service.ts` - CRM queries

### Medium Priority
5. `module.service.ts` - Module management
6. `context.service.ts` - User context (partially updated)
7. `assistbuild-context.service.ts` - AssistBuild context

### Lower Priority
8. All route handlers that directly query tenant-scoped tables
9. Background jobs and workers
10. Integration services

---

## Testing After Migration

1. **Unit Tests**: Test service methods with mock TenantQueryBuilder
2. **Integration Tests**: Test with real tenant schema
3. **E2E Tests**: Test full user flows
4. **Performance Tests**: Verify query performance hasn't degraded

---

## Rollback Plan

If issues arise:
1. Tables remain in both `public` and tenant schemas during migration
2. Can switch back to public schema queries by reverting service changes
3. Data in tenant schemas is preserved
4. Can re-run migration after fixes

---

## Notes

- **Cross-Schema Foreign Keys**: Supported (e.g., `tenant_schema.clients` → `public.users`)
- **Joins**: Use raw SQL with schema qualification for complex joins
- **Transactions**: TenantQueryBuilder doesn't handle transactions yet - use Drizzle's transaction API with schema-aware queries

