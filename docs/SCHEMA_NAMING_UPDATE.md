# Tenant Schema Naming Update

**Date:** 2025-11-27  
**Change:** Schema names now use `tenant_{tenantId}` instead of `tenant_{tenantSlug}`

---

## Summary

Tenant schema names have been updated to use the tenant ID instead of the tenant slug. This provides:
- **Consistency**: Schema names are always based on the immutable tenant ID
- **Uniqueness**: UUIDs guarantee unique schema names
- **Stability**: Schema names don't change if tenant slug changes

---

## Changes Made

### 1. TenantSchemaService (`apps/api/services/tenant-schema.service.ts`)
- ✅ Updated `sanitizeSchemaName()` to accept `tenantId` instead of `slug`
- ✅ Updated `createTenantSchema()` to use `tenantId` for schema naming
- ✅ Schema name format: `tenant_{tenantId}` (e.g., `tenant_810f22c3_5e5d_4be2_b062_615fa489996f`)

### 2. Tenant Service (`apps/api/services/tenant.service.ts`)
- ✅ Updated `createTenant()` to pass `tenant.id` instead of `tenant.slug`

### 3. Migration Script (`apps/api/scripts/migrate-tenant-tables-to-schemas.ts`)
- ✅ Updated to use `tenant.id` for schema creation

### 4. Schema Name Update Script (`apps/api/scripts/update-schema-names.ts`)
- ✅ New script to migrate existing schemas from old to new naming
- ✅ Moves all tables from old schema to new schema
- ✅ Updates `tenant_schemas` table

---

## Schema Name Format

### Before
```
tenant_{slug}
Example: tenant_narex
```

### After
```
tenant_{tenantId}
Example: tenant_810f22c3_5e5d_4be2_b062_615fa489996f
```

**Note:** Hyphens in UUIDs are replaced with underscores for PostgreSQL compatibility.

---

## Migration Steps

### For Existing Tenants

If you have existing tenants with schemas using the old naming (`tenant_{slug}`), run the update script:

```bash
# Dry run (preview changes)
npm run update:schema-names -- --dry-run

# Update specific tenant
npm run update:schema-names -- --tenant-id=810f22c3-5e5d-4be2-b062-615fa489996f

# Update all tenants
npm run update:schema-names
```

### What the Script Does

1. Finds all tenant schemas with old naming
2. Creates new schemas with correct naming (`tenant_{id}`)
3. Moves all tables from old schema to new schema using `ALTER TABLE ... SET SCHEMA`
4. Updates `tenant_schemas` table to point to new schema
5. Drops old (now empty) schema

---

## Testing

### Test New Tenant Creation

```bash
# Create a new tenant (will use new naming automatically)
# Test via API or directly in code
```

### Test Schema Name Update

```bash
# 1. Check current schema name
# Query: SELECT schema_name FROM tenant_schemas WHERE tenant_id = '...';

# 2. Run update script (dry-run first)
npm run update:schema-names -- --tenant-id=810f22c3-5e5d-4be2-b062-615fa489996f --dry-run

# 3. Run actual update
npm run update:schema-names -- --tenant-id=810f22c3-5e5d-4be2-b062-615fa489996f

# 4. Verify schema name updated
# Query: SELECT schema_name FROM tenant_schemas WHERE tenant_id = '...';
# Should show: tenant_810f22c3_5e5d_4be2_b062_615fa489996f

# 5. Verify tables migrated
# Query: SELECT table_name FROM information_schema.tables 
#        WHERE table_schema = 'tenant_810f22c3_5e5d_4be2_b062_615fa489996f';
```

### Test Table Migration

```bash
# After schema name update, test migrating a table
npm run migrate:tenant-tables-to-schemas -- --table=clients --tenant-id=810f22c3-5e5d-4be2-b062-615fa489996f
```

---

## Verification Checklist

- [ ] New tenants create schemas with `tenant_{id}` format
- [ ] Existing schemas migrated to new naming
- [ ] All tables successfully moved to new schemas
- [ ] `tenant_schemas` table updated correctly
- [ ] Old schemas dropped (or verified empty)
- [ ] Table migrations work with new schema names
- [ ] Services can query tables in new schemas

---

## Rollback Plan

If issues arise:

1. **Old schemas are preserved** until explicitly dropped
2. **Can revert `tenant_schemas` table** to point back to old schema names
3. **Tables can be moved back** using `ALTER TABLE ... SET SCHEMA`

**Note:** The update script uses `ALTER TABLE ... SET SCHEMA` which is atomic and reversible.

---

## Related Files

- `apps/api/services/tenant-schema.service.ts` - Schema creation logic
- `apps/api/services/tenant.service.ts` - Tenant creation
- `apps/api/scripts/update-schema-names.ts` - Schema name migration script
- `apps/api/scripts/migrate-tenant-tables-to-schemas.ts` - Table migration script

---

## Notes

- Schema names are limited to 63 characters (PostgreSQL limit)
- UUIDs with hyphens replaced by underscores are ~50 characters, well within limit
- Schema names are case-insensitive in PostgreSQL (stored as lowercase)

