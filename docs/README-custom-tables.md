# Custom Tables Migration

## Overview

This migration adds the `custom_tables` table to all existing tenant schemas. This table tracks metadata about tenant-editable tables (tables that can be created and edited by tenants).

## Prerequisites

Before running this migration:

1. **Deploy the schema changes** - Ensure the `custom_tables` table definition exists in the `public` schema:
   ```bash
   npx drizzle-kit push
   # or
   npx drizzle-kit migrate
   ```

2. **Verify database connection** - Ensure `DATABASE_URL` environment variable is set correctly

## Running the Migration

### Option 1: Using tsx (recommended)
```bash
npx tsx migrations/add-custom-tables-to-tenants.ts
```

### Option 2: Using ts-node
```bash
npx ts-node migrations/add-custom-tables-to-tenants.ts
```

### Option 3: Compile and run
```bash
tsc migrations/add-custom-tables-to-tenants.ts
node migrations/add-custom-tables-to-tenants.js
```

## What the Migration Does

1. **Checks all tenant schemas** - Queries the `tenant_schemas` table to get all existing tenant schemas
2. **Validates public schema** - Ensures `custom_tables` exists in the `public` schema before proceeding
3. **Creates table in each tenant** - For each tenant schema:
   - Checks if `custom_tables` already exists
   - If not, creates it by copying structure from `public.custom_tables` (including constraints, indexes, defaults)
   - Logs the result (success, skipped, or error)
4. **Provides summary** - Shows counts of successful, skipped, and failed migrations

## Safety Features

- **Idempotent** - Safe to run multiple times; skips tenants that already have the table
- **Non-destructive** - Only creates tables, never drops or modifies existing data
- **Continues on error** - If one tenant fails, continues with remaining tenants
- **Detailed logging** - Shows progress and results for each tenant

## Output Example

```
================================================================================
Migration: Add custom_tables to all tenant schemas
================================================================================

Found 5 tenant schema(s) to migrate

✅ custom_tables table exists in public schema

Processing tenant: abc123 (tenant_abc123)
  ✅ Success - custom_tables table created

Processing tenant: def456 (tenant_def456)
  ⏭️  Skipped - custom_tables already exists

Processing tenant: ghi789 (tenant_ghi789)
  ✅ Success - custom_tables table created

================================================================================
Migration Summary
================================================================================

Total schemas processed: 5
✅ Successfully migrated: 3
⏭️  Skipped (already exists): 2
❌ Failed: 0

Migration complete!
✅ Migration script completed successfully
```

## Rollback

To rollback this migration (remove `custom_tables` from all tenant schemas):

```sql
-- Run this for each tenant schema
DROP TABLE IF EXISTS tenant_<schema_name>.custom_tables;
```

Or create a rollback script:

```bash
# Example rollback query
SELECT 'DROP TABLE IF EXISTS ' || schema_name || '.custom_tables;'
FROM tenant_schemas;
```

## Troubleshooting

### Error: "custom_tables table does not exist in public schema"
**Solution**: Run `npx drizzle-kit push` first to create the table definition in the public schema

### Error: "permission denied for schema tenant_xxx"
**Solution**: Ensure your database user has CREATE permission on tenant schemas

### Migration fails for specific tenant
**Solution**: Check the error message in the output. The migration continues with other tenants, so you can manually fix the failed tenant and re-run (it will skip successful ones)

## Related Files

- Schema definition: `shared/schema.ts` (customTables table)
- Essential tables list: `apps/api/services/tenant-schema.service.ts` (ESSENTIAL_TENANT_TABLES)
- Migration script: `migrations/add-custom-tables-to-tenants.ts`

