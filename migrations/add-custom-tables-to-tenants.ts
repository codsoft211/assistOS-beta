/**
 * Migration: Add custom_tables to all existing tenant schemas
 * 
 * This script adds the custom_tables table to all existing tenant schemas.
 * The table tracks metadata about tenant-editable tables.
 * 
 * Usage:
 *   npx tsx migrations/add-custom-tables-to-tenants.ts
 */

import { db } from '../apps/api/db';
import { tenantSchemas } from '../shared/schema';
import { Pool } from 'pg';

interface MigrationResult {
  tenantId: string;
  schemaName: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
}

async function addCustomTablesToTenants(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Migration: Add custom_tables to all tenant schemas');
  console.log('='.repeat(80));
  console.log();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable must be set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const results: MigrationResult[] = [];

  try {
    // Get all tenant schemas
    const schemas = await db.select().from(tenantSchemas);
    
    console.log(`Found ${schemas.length} tenant schema(s) to migrate`);
    console.log();

    // Check if custom_tables exists in public schema
    const publicTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'custom_tables'
      ) as exists
    `);

    const publicTableExists = publicTableCheck.rows[0]?.exists || false;

    if (!publicTableExists) {
      console.log('⚠️  custom_tables table does not exist in public schema');
      console.log('   Creating it now...');
      
      try {
        // Create the table in public schema
        await pool.query(`
          CREATE TABLE IF NOT EXISTS public.custom_tables (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            tenant_id varchar NOT NULL REFERENCES tenants(id),
            environment text DEFAULT 'production' NOT NULL,
            table_name text NOT NULL,
            description text,
            icon text,
            color text,
            category text,
            columns jsonb,
            is_editable boolean DEFAULT true NOT NULL,
            is_system_table boolean DEFAULT false NOT NULL,
            is_active boolean DEFAULT true NOT NULL,
            is_deleted boolean DEFAULT false NOT NULL,
            metadata jsonb,
            created_by varchar NOT NULL REFERENCES users(id),
            updated_by varchar REFERENCES users(id),
            created_at timestamp DEFAULT now() NOT NULL,
            updated_at timestamp DEFAULT now() NOT NULL
          )
        `);
        
        // Create indexes
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS custom_tables_unique_tenant_table 
          ON public.custom_tables(tenant_id, table_name, environment)
        `);
        
        await pool.query(`
          CREATE INDEX IF NOT EXISTS custom_tables_tenant_idx 
          ON public.custom_tables(tenant_id)
        `);
        
        await pool.query(`
          CREATE INDEX IF NOT EXISTS custom_tables_table_name_idx 
          ON public.custom_tables(table_name)
        `);
        
        console.log('✅ Created custom_tables table in public schema');
        console.log();
      } catch (error: any) {
        console.error('❌ Failed to create custom_tables in public schema:', error.message);
        console.log('   Please run the SQL migration manually:');
        console.log('   psql $DATABASE_URL < migrations/0002_create_custom_tables.sql');
        process.exit(1);
      }
    } else {
      console.log('✅ custom_tables table exists in public schema');
      console.log();
    }

    // Process each tenant schema
    for (const schema of schemas) {
      const { tenantId, schemaName } = schema;
      
      console.log(`Processing tenant: ${tenantId} (${schemaName})`);

      try {
        // Check if table already exists in tenant schema
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_name = 'custom_tables'
          ) as exists
        `, [schemaName]);

        const tableExists = tableCheck.rows[0]?.exists || false;

        if (tableExists) {
          console.log(`  ⏭️  Skipped - custom_tables already exists`);
          results.push({
            tenantId,
            schemaName,
            status: 'skipped',
            message: 'Table already exists'
          });
          continue;
        }

        // Create the table by copying structure from public schema
        await pool.query(`
          CREATE TABLE "${schemaName}"."custom_tables" 
          (LIKE public.custom_tables INCLUDING ALL)
        `);

        console.log(`  ✅ Success - custom_tables table created`);
        results.push({
          tenantId,
          schemaName,
          status: 'success',
          message: 'Table created successfully'
        });

      } catch (error: any) {
        console.error(`  ❌ Error - ${error.message}`);
        results.push({
          tenantId,
          schemaName,
          status: 'error',
          message: error.message
        });
        // Continue with other tenants instead of failing completely
      }

      console.log();
    }

    // Print summary
    console.log('='.repeat(80));
    console.log('Migration Summary');
    console.log('='.repeat(80));
    console.log();

    const successCount = results.filter(r => r.status === 'success').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`Total schemas processed: ${results.length}`);
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`⏭️  Skipped (already exists): ${skippedCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log();

    if (errorCount > 0) {
      console.log('Failed tenants:');
      results
        .filter(r => r.status === 'error')
        .forEach(r => {
          console.log(`  - ${r.tenantId} (${r.schemaName}): ${r.message}`);
        });
      console.log();
    }

    console.log('Migration complete!');
    
    // Exit with error code if any migrations failed
    if (errorCount > 0) {
      process.exit(1);
    }

  } catch (error: any) {
    console.error('Fatal error during migration:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
addCustomTablesToTenants()
  .then(() => {
    console.log('✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:');
    console.error(error);
    process.exit(1);
  });

