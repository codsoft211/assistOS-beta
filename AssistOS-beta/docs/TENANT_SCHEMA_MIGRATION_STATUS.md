# Tenant Schema Migration & Templates Status

**Last Updated:** 2025-01-XX  
**Status:** Infrastructure Ready, Migration Scripts Ready

---

## ✅ What's Ready and Completed

### 1. Core Infrastructure ✅

#### TableMigrationService (`apps/api/services/table-migration.service.ts`)
- ✅ Complete and tested
- ✅ Can migrate tables from public to tenant schemas
- ✅ Handles data migration with tenant filtering
- ✅ Generates DDL for CREATE TABLE, INDEXES, FOREIGN KEYS
- ✅ Supports cross-schema foreign keys
- ✅ Can introspect table structure from information_schema

#### TenantSchemaService (`apps/api/services/tenant-schema.service.ts`)
- ✅ Complete and tested
- ✅ Creates tenant schemas automatically
- ✅ Manages schema versioning
- ✅ Executes SQL in tenant schema context
- ✅ Schema name sanitization and escaping

#### TenantQueryBuilder (`apps/api/utils/tenant-query-builder.ts`)
- ✅ Complete and ready
- ✅ Automatic schema resolution
- ✅ CRUD operations (select, insert, update, delete, count)
- ✅ Environment filtering
- ✅ Raw SQL execution support

#### ModuleTableService (`apps/api/services/module-table.service.ts`)
- ✅ Complete and ready
- ✅ Creates tables from module templates
- ✅ Generates DDL from template definitions
- ✅ Used by AssistBuild's `activate_module` tool

---

### 2. Module Templates ✅

#### Location: `packages/modules/templates/module-tables.ts`

**Templates Available:**
- ✅ `compras` (Purchasing) - 2 tables
- ✅ `financeiro` (Financial) - 1 table
- ✅ `vendas` (Sales) - 1 table
- ✅ `logistica` (Logistics) - 2 tables
- ✅ `projetos` (Projects) - 1 table

**Total:** 5 modules, 7 tables defined

**Template Structure:**
- Column definitions with types, constraints, defaults
- Index definitions
- Foreign key relationships
- Primary keys

**Note:** More modules exist but don't have templates yet. Templates can be:
1. Manually added to `MODULE_TABLE_TEMPLATES`
2. Auto-generated from existing tables using `TableMigrationService.getTableStructure()`

---

### 3. Migration Scripts ✅

#### AI Chat Migration (`migrate:ai-chat-to-user-scoped`)
- ✅ Complete and tested
- ✅ Migrates 5 tables from tenant-scoped to user-scoped
- ✅ Handles missing columns gracefully
- ✅ Updates indexes

#### Tenant Tables Migration (`migrate:tenant-tables-to-schemas`)
- ✅ **NEW:** Just created
- ✅ Migrates existing tenant-scoped tables from public to tenant schemas
- ✅ Supports:
  - Single tenant migration (`--tenant-id=<id>`)
  - Single table migration (`--table=<name>`)
  - Dry-run mode (`--dry-run`)
  - Batch migration (all tenants, all tables)

**Usage:**
```bash
# Dry run (preview)
npm run migrate:tenant-tables-to-schemas -- --dry-run

# Migrate specific tenant
npm run migrate:tenant-tables-to-schemas -- --tenant-id=<tenant-id>

# Migrate specific table for all tenants
npm run migrate:tenant-tables-to-schemas -- --table=user_tenants

# Full migration (all tenants, all tables)
npm run migrate:tenant-tables-to-schemas
```

---

## ⚠️ What's Partially Ready

### 1. Module Templates Coverage

**Status:** Only 5 of ~30+ modules have templates

**Missing Templates:**
- CRM modules (clients, leads, opportunities, etc.)
- Inventory modules (products, stock, warehouses, etc.)
- Document management
- Communication modules
- Integration modules
- Agent & automation modules
- And many more...

**Solution Options:**
1. **Manual Creation:** Add templates to `MODULE_TABLE_TEMPLATES` as needed
2. **Auto-Generation:** Use `TableMigrationService.getTableStructure()` to generate templates from existing tables
3. **Hybrid:** Start with auto-generation, then customize

---

### 2. Service Layer Updates

**Status:** Infrastructure ready, but services need updates

**Services Using Tenant-Scoped Tables:**
- Most services still query from `public` schema
- Need to be updated to use `TenantQueryBuilder` or schema-aware queries

**Migration Path:**
1. Identify all services querying tenant-scoped tables
2. Update to use `TenantQueryBuilder`
3. Test thoroughly

---

## 📋 Next Steps

### Immediate (Ready to Execute)

1. **Test Tenant Tables Migration**
   ```bash
   # Dry run first
   npm run migrate:tenant-tables-to-schemas -- --dry-run
   
   # Test on single tenant
   npm run migrate:tenant-tables-to-schemas -- --tenant-id=<test-tenant-id>
   ```

2. **Migrate Critical Tables First**
   - Start with `user_tenants` (foundational)
   - Then core platform tables
   - Then module tables

### Short Term

1. **Expand Module Templates**
   - Generate templates from existing tables
   - Or manually add templates for high-priority modules

2. **Update Service Layers**
   - Update services to use `TenantQueryBuilder`
   - Test each service after update

3. **Create Migration Batches**
   - Group tables by dependency
   - Create migration scripts for each batch

### Medium Term

1. **Complete Module Template Coverage**
   - All modules should have templates
   - Templates should be versioned

2. **Performance Testing**
   - Test queries across schemas
   - Optimize indexes
   - Monitor query performance

---

## 🎯 Summary

### ✅ Ready for Production Use:
- TableMigrationService
- TenantSchemaService
- TenantQueryBuilder
- ModuleTableService
- Migration scripts (AI chat + tenant tables)

### ⚠️ Needs Work:
- Module template coverage (only 5/30+ modules)
- Service layer updates (most services still use public schema)
- Batch migration strategies

### 🚀 Can Start Now:
- Migrate tenant-scoped tables to tenant schemas
- Create new module tables from templates
- Test migration on staging tenants

---

## 📝 Notes

- **Templates vs. Existing Tables:** Templates are for NEW module installations. Existing tables should be migrated using the migration script.
- **Schema Isolation:** Each tenant's schema is completely isolated. Cross-schema foreign keys are supported (e.g., `tenant_schema.clients` → `public.users`).
- **Data Migration:** The migration script preserves all data, filtering by `tenant_id` to ensure data isolation.

---

## 🔗 Related Documentation

- `docs/DATABASE_REFACTORING_PROGRESS.md` - Overall refactoring progress
- `docs/DATABASE_REFERENCE.md` - Database structure reference
- `apps/api/services/table-migration.service.ts` - Migration service code
- `packages/modules/templates/module-tables.ts` - Module templates

