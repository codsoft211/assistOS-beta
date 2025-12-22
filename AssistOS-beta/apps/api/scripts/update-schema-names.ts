#!/usr/bin/env tsx

/**
 * Update Tenant Schema Names
 * 
 * Migrates existing tenant schemas from tenant_{slug} to tenant_{id} naming.
 * This script:
 * 1. Finds all tenant schemas with old naming (based on slug)
 * 2. Creates new schemas with correct naming (based on tenant ID)
 * 3. Migrates data from old to new schema
 * 4. Updates tenant_schemas table
 * 5. Optionally drops old schemas
 * 
 * Usage: npm run update:schema-names [--dry-run] [--tenant-id=<id>]
 */

import '../../../load-env';
import { db } from '../db';
import { tenants, tenantSchemas } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { tenantSchemaService } from '../services/tenant-schema.service';

interface Options {
  dryRun?: boolean;
  tenantId?: string;
}

async function updateSchemaNames(options: Options = {}) {
  console.log('🔄 Updating Tenant Schema Names (tenant_{slug} → tenant_{id})...\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Get all tenants
    let tenantsToUpdate;
    if (options.tenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, options.tenantId))
        .limit(1);
      if (!tenant) {
        throw new Error(`Tenant ${options.tenantId} not found`);
      }
      tenantsToUpdate = [tenant];
    } else {
      tenantsToUpdate = await db.select().from(tenants);
    }

    console.log(`📋 Found ${tenantsToUpdate.length} tenant(s) to update\n`);

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    for (const tenant of tenantsToUpdate) {
      console.log(`\n🏢 Processing tenant: ${tenant.id} (${tenant.name})`);

      // Get current schema info
      const [currentSchema] = await db
        .select()
        .from(tenantSchemas)
        .where(eq(tenantSchemas.tenantId, tenant.id))
        .limit(1);

      if (!currentSchema) {
        console.log(`   ⚠️  No schema found for tenant ${tenant.id}, creating new one...`);
        if (!options.dryRun) {
          await tenantSchemaService.createTenantSchema(tenant.id);
          console.log(`   ✅ Created new schema for tenant ${tenant.id}`);
        }
        continue;
      }

      // Generate expected schema name (tenant_{id})
      const expectedSchemaName = `tenant_${tenant.id.toLowerCase().replace(/-/g, '_')}`;

      // Check if schema name is already correct
      if (currentSchema.schemaName === expectedSchemaName) {
        console.log(`   ✅ Schema name is already correct: ${currentSchema.schemaName}`);
        continue;
      }

      console.log(`   📝 Current schema: ${currentSchema.schemaName}`);
      console.log(`   🎯 Expected schema: ${expectedSchemaName}`);

      if (options.dryRun) {
        console.log(`   🔍 Would rename schema from ${currentSchema.schemaName} to ${expectedSchemaName}`);
        continue;
      }

      // Check if new schema already exists
      const schemaExistsQuery = `
        SELECT EXISTS(
          SELECT 1 FROM information_schema.schemata 
          WHERE schema_name = $1
        ) as exists;
      `;
      const schemaExists = await pool.query(schemaExistsQuery, [expectedSchemaName]);
      
      if (schemaExists.rows[0].exists) {
        console.log(`   ⚠️  Target schema ${expectedSchemaName} already exists, skipping migration`);
        // Update tenant_schemas table to point to correct schema
        await db
          .update(tenantSchemas)
          .set({ schemaName: expectedSchemaName })
          .where(eq(tenantSchemas.tenantId, tenant.id));
        console.log(`   ✅ Updated tenant_schemas table to point to ${expectedSchemaName}`);
        continue;
      }

      // Helper to escape PostgreSQL identifiers
      const escapeIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;

      // Get all tables in old schema
      const tablesQuery = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
        ORDER BY table_name;
      `;
      const tablesResult = await pool.query(tablesQuery, [currentSchema.schemaName]);
      const tables = tablesResult.rows.map((r: any) => r.table_name);

      if (tables.length === 0) {
        console.log(`   ℹ️  No tables in old schema, just updating name`);
        // Create new schema
        await pool.query(`CREATE SCHEMA ${escapeIdentifier(expectedSchemaName)}`);
        
        // Update tenant_schemas table
        await db
          .update(tenantSchemas)
          .set({ schemaName: expectedSchemaName })
          .where(eq(tenantSchemas.tenantId, tenant.id));
        
        // Drop old schema
        await pool.query(`DROP SCHEMA IF EXISTS ${escapeIdentifier(currentSchema.schemaName)} CASCADE`);
        
        console.log(`   ✅ Renamed schema from ${currentSchema.schemaName} to ${expectedSchemaName}`);
        continue;
      }

      console.log(`   📦 Found ${tables.length} tables to migrate`);

      // Create new schema
      await pool.query(`CREATE SCHEMA ${escapeIdentifier(expectedSchemaName)}`);

      // Move all tables from old to new schema using ALTER TABLE ... SET SCHEMA
      // This is more efficient than recreating tables
      for (const tableName of tables) {
        console.log(`   📝 Moving table: ${tableName}`);
        try {
          await pool.query(`
            ALTER TABLE ${escapeIdentifier(currentSchema.schemaName)}.${escapeIdentifier(tableName)}
            SET SCHEMA ${escapeIdentifier(expectedSchemaName)};
          `);
          console.log(`   ✅ Moved table ${tableName} to new schema`);
        } catch (error: any) {
          console.error(`   ❌ Error moving table ${tableName}:`, error.message);
          // Rollback: drop new schema and stop
          await pool.query(`DROP SCHEMA IF EXISTS ${escapeIdentifier(expectedSchemaName)} CASCADE`);
          throw error;
        }
      }

      // Update tenant_schemas table
      await db
        .update(tenantSchemas)
        .set({ schemaName: expectedSchemaName })
        .where(eq(tenantSchemas.tenantId, tenant.id));

      // Drop old schema (now empty)
      await pool.query(`DROP SCHEMA IF EXISTS ${escapeIdentifier(currentSchema.schemaName)} CASCADE`);

      console.log(`   ✅ Successfully migrated schema from ${currentSchema.schemaName} to ${expectedSchemaName}`);
    }

    console.log('\n✅ Schema name update completed!');
  } catch (error) {
    console.error('❌ Error updating schema names:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: Options = {
  dryRun: args.includes('--dry-run'),
  tenantId: args.find(arg => arg.startsWith('--tenant-id='))?.split('=')[1],
};

updateSchemaNames(options).catch(console.error);

