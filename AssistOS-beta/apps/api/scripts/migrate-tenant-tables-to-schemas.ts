#!/usr/bin/env tsx

/**
 * Migrate Tenant-Scoped Tables from Public Schema to Tenant Schemas
 * 
 * This script migrates existing tenant-scoped tables from the public schema
 * to each tenant's private schema. It:
 * 1. Identifies all tenant-scoped tables (tables with tenant_id column)
 * 2. For each tenant, creates the table in their schema
 * 3. Migrates data filtered by tenant_id
 * 4. Creates indexes and foreign keys
 * 
 * Usage: npm run migrate:tenant-tables-to-schemas [--tenant-id=<id>]
 * 
 * Options:
 *   --tenant-id=<id>  Migrate tables for a specific tenant only
 *   --dry-run         Preview what would be migrated without executing
 *   --table=<name>    Migrate a specific table only
 */

import '../../../load-env';
import { tableMigrationService } from '../services/table-migration.service';
import { tenantSchemaService } from '../services/tenant-schema.service';
import { db } from '../db';
import { tenants } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';

interface MigrationOptions {
  tenantId?: string;
  dryRun?: boolean;
  tableName?: string;
}

async function migrateTenantTablesToSchemas(options: MigrationOptions = {}) {
  console.log('🚀 Starting Tenant Tables Migration to Tenant Schemas...\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Step 1: Get list of tenant-scoped tables (tables with tenant_id column)
    console.log('📋 Identifying tenant-scoped tables...');
    const tenantTablesQuery = `
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'tenant_id'
        AND table_name NOT IN (
          'tenant_schemas',
          'migrations',
          'schema_versions'
        )
      ORDER BY table_name;
    `;
    const tenantTablesResult = await pool.query(tenantTablesQuery);
    const tenantTables = tenantTablesResult.rows.map(r => r.table_name);

    if (tenantTables.length === 0) {
      console.log('⚠️  No tenant-scoped tables found in public schema');
      return;
    }

    console.log(`✅ Found ${tenantTables.length} tenant-scoped tables:\n`);
    tenantTables.forEach((table, idx) => {
      console.log(`   ${idx + 1}. ${table}`);
    });
    console.log('');

    // Filter by table name if specified
    const tablesToMigrate = options.tableName
      ? tenantTables.filter(t => t === options.tableName)
      : tenantTables;

    if (tablesToMigrate.length === 0) {
      console.log(`⚠️  Table "${options.tableName}" not found or not tenant-scoped`);
      return;
    }

    // Step 2: Get tenants to migrate
    let tenantsToMigrate;
    if (options.tenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, options.tenantId))
        .limit(1);
      if (!tenant) {
        throw new Error(`Tenant ${options.tenantId} not found`);
      }
      tenantsToMigrate = [tenant];
    } else {
      tenantsToMigrate = await db.select().from(tenants);
    }

    console.log(`📦 Migrating tables for ${tenantsToMigrate.length} tenant(s)...\n`);

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    // Step 3: For each tenant, migrate each table
    for (const tenant of tenantsToMigrate) {
      console.log(`\n🏢 Processing tenant: ${tenant.id} (${tenant.name})`);
      
      // Ensure tenant schema exists
      let schemaName = await tenantSchemaService.getTenantSchemaName(tenant.id);
      if (!schemaName) {
        if (options.dryRun) {
          console.log(`   ⚠️  Schema would be created for tenant ${tenant.id}`);
          schemaName = `tenant_${tenant.id.substring(0, 8)}`;
        } else {
          // Create schema using tenant ID
          await tenantSchemaService.createTenantSchema(tenant.id);
          schemaName = await tenantSchemaService.getTenantSchemaName(tenant.id);
          console.log(`   ✅ Created schema: ${schemaName}`);
        }
      } else {
        console.log(`   ✅ Using existing schema: ${schemaName}`);
      }

      // Migrate each table
      for (const tableName of tablesToMigrate) {
        console.log(`\n   📝 Migrating table: ${tableName}`);
        
        try {
          // Get table structure
          const tableDef = await tableMigrationService.getTableStructure(tableName);
          if (!tableDef) {
            console.log(`   ⚠️  Could not get structure for ${tableName}, skipping`);
            continue;
          }

          if (options.dryRun) {
            console.log(`   🔍 Would migrate ${tableName} to ${schemaName}`);
            console.log(`      Columns: ${tableDef.columns.length}`);
            console.log(`      Primary Key: ${tableDef.primaryKey || 'none'}`);
            continue;
          }

          // Migrate table
          const result = await tableMigrationService.migrateTable(
            tenant.id,
            tableDef,
            true // preserveData
          );

          console.log(`   ✅ Migrated ${tableName}: ${result.rowsMigrated} rows`);
        } catch (error: any) {
          console.error(`   ❌ Failed to migrate ${tableName}:`, error.message);
          // Continue with next table
        }
      }
    }

    console.log('\n✅ Migration completed!');
    console.log('\n📋 Summary:');
    console.log(`   - Tables processed: ${tablesToMigrate.length}`);
    console.log(`   - Tenants processed: ${tenantsToMigrate.length}`);
    console.log(`   - Total migrations: ${tablesToMigrate.length * tenantsToMigrate.length}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: MigrationOptions = {};

args.forEach(arg => {
  if (arg.startsWith('--tenant-id=')) {
    options.tenantId = arg.split('=')[1];
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg.startsWith('--table=')) {
    options.tableName = arg.split('=')[1];
  }
});

// Run migration
migrateTenantTablesToSchemas(options)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

