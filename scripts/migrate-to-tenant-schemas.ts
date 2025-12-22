#!/usr/bin/env tsx
/**
 * Migration Script: Move data from public schema to tenant schemas
 * 
 * This script migrates existing tenant data from the public schema to per-tenant schemas.
 * 
 * Usage:
 *   npm run migrate:to-tenant-schemas [--tenant-id=<id>] [--dry-run]
 * 
 * Options:
 *   --tenant-id=<id>  Migrate specific tenant only
 *   --dry-run         Preview changes without applying
 *   --force           Skip confirmation prompts
 */

import '../apps/api/load-env';
import { db } from '../apps/api/db';
import { tenants, tenantSchemas } from '../shared/schema';
import { tenantSchemaService } from '../apps/api/services/tenant-schema.service';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface MigrationStats {
  tenantId: string;
  tenantName: string;
  schemaName: string;
  tablesMigrated: number;
  rowsMigrated: number;
  errors: string[];
}

// Tables to migrate (tenant-scoped tables)
const TENANT_SCOPED_TABLES = [
  'company_info',
  'tenant_blueprints',
  'tenant_modules',
  'tenant_workflows',
  'tenant_automations',
  'audit_log',
  'sequence_counters',
  'departments',
  'teams',
  'team_members',
  'user_profiles',
  'user_actions',
  'tenant_invitations',
  'invite_billing_events',
  'module_pages',
  'module_features',
  'module_interface_config',
  'user_module_preferences',
  'tenant_context',
  // Add more tables as needed
];

async function migrateTenantData(
  tenantId: string,
  tenantName: string,
  dryRun: boolean = false
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    tenantId,
    tenantName,
    schemaName: '',
    tablesMigrated: 0,
    rowsMigrated: 0,
    errors: [],
  };

  console.log(`\n[Migration] Starting migration for tenant: ${tenantName} (${tenantId})`);

  try {
    // 1. Ensure tenant schema exists
    let schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      console.log(`[Migration] Creating schema for tenant ${tenantId}...`);
      if (!dryRun) {
        schemaName = await tenantSchemaService.createTenantSchema(tenantId);
      } else {
        schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
        console.log(`[DRY RUN] Would create schema: ${schemaName}`);
      }
    }

    stats.schemaName = schemaName;
    console.log(`[Migration] Using schema: ${schemaName}`);

    // 2. Migrate each table
    for (const tableName of TENANT_SCOPED_TABLES) {
      try {
        await migrateTable(tenantId, tableName, schemaName, dryRun, stats);
      } catch (error: any) {
        const errorMsg = `Failed to migrate ${tableName}: ${error.message}`;
        console.error(`[Migration] ❌ ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }

    console.log(`[Migration] ✅ Completed for ${tenantName}`);
    console.log(`  - Tables migrated: ${stats.tablesMigrated}`);
    console.log(`  - Rows migrated: ${stats.rowsMigrated}`);
    if (stats.errors.length > 0) {
      console.log(`  - Errors: ${stats.errors.length}`);
    }

  } catch (error: any) {
    console.error(`[Migration] ❌ Failed for tenant ${tenantName}:`, error.message);
    stats.errors.push(`Migration failed: ${error.message}`);
  }

  return stats;
}

async function migrateTable(
  tenantId: string,
  tableName: string,
  schemaName: string,
  dryRun: boolean,
  stats: MigrationStats
): Promise<void> {
  // Check if table exists in public schema
  const tableExists = await pool.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );

  if (!tableExists.rows[0].exists) {
    console.log(`[Migration] ⏭️  Skipping ${tableName} (doesn't exist in public)`);
    return;
  }

  // Count rows for this tenant
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM public.${escapeIdentifier(tableName)} WHERE tenant_id = $1`,
    [tenantId]
  );

  const rowCount = parseInt(countResult.rows[0].count, 10);

  if (rowCount === 0) {
    console.log(`[Migration] ⏭️  Skipping ${tableName} (no data for tenant)`);
    return;
  }

  console.log(`[Migration] 📦 Migrating ${tableName} (${rowCount} rows)...`);

  if (dryRun) {
    console.log(`[DRY RUN] Would migrate ${rowCount} rows from public.${tableName} to ${schemaName}.${tableName}`);
    stats.tablesMigrated++;
    stats.rowsMigrated += rowCount;
    return;
  }

  // Create table in tenant schema if it doesn't exist
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)} 
     (LIKE public.${escapeIdentifier(tableName)} INCLUDING ALL)`
  );

  // Copy data
  const result = await pool.query(
    `INSERT INTO ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}
     SELECT * FROM public.${escapeIdentifier(tableName)}
     WHERE tenant_id = $1
     ON CONFLICT DO NOTHING`,
    [tenantId]
  );

  const migratedRows = result.rowCount || 0;
  console.log(`[Migration] ✅ Migrated ${migratedRows} rows to ${schemaName}.${tableName}`);

  stats.tablesMigrated++;
  stats.rowsMigrated += migratedRows;
}

function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
  const args = process.argv.slice(2);
  const tenantIdArg = args.find(arg => arg.startsWith('--tenant-id='));
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  console.log('='.repeat(80));
  console.log('TENANT SCHEMA MIGRATION');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE MIGRATION'}`);
  console.log('='.repeat(80));

  // Get tenants to migrate
  let tenantsToMigrate: Array<{ id: string; name: string }> = [];

  if (tenantIdArg) {
    const tenantId = tenantIdArg.split('=')[1];
    const [tenant] = await db.select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(sql`id = ${tenantId}`)
      .limit(1);

    if (!tenant) {
      console.error(`❌ Tenant not found: ${tenantId}`);
      process.exit(1);
    }

    tenantsToMigrate = [tenant];
  } else {
    tenantsToMigrate = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  }

  console.log(`\nFound ${tenantsToMigrate.length} tenant(s) to migrate\n`);

  if (!force && !dryRun) {
    console.log('⚠️  WARNING: This will migrate data from public schema to tenant schemas.');
    console.log('⚠️  Make sure you have a backup before proceeding!');
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const allStats: MigrationStats[] = [];

  for (const tenant of tenantsToMigrate) {
    const stats = await migrateTenantData(tenant.id, tenant.name, dryRun);
    allStats.push(stats);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Tenants processed: ${allStats.length}`);
  console.log(`Total tables migrated: ${allStats.reduce((sum, s) => sum + s.tablesMigrated, 0)}`);
  console.log(`Total rows migrated: ${allStats.reduce((sum, s) => sum + s.rowsMigrated, 0)}`);
  
  const tenantsWithErrors = allStats.filter(s => s.errors.length > 0);
  if (tenantsWithErrors.length > 0) {
    console.log(`\n⚠️  Tenants with errors: ${tenantsWithErrors.length}`);
    for (const stat of tenantsWithErrors) {
      console.log(`\n${stat.tenantName} (${stat.tenantId}):`);
      for (const error of stat.errors) {
        console.log(`  - ${error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  if (dryRun) {
    console.log('✅ DRY RUN completed successfully');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('✅ Migration completed successfully');
  }

  await pool.end();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

