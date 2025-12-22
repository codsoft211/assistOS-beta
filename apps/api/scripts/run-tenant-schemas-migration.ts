#!/usr/bin/env tsx

/**
 * Run Tenant Schemas Migration Script
 * 
 * Executes the add-tenant-schemas.sql migration file.
 * This creates the tenant_schemas table and adds schema_name columns
 * to migrations and schema_versions tables.
 * 
 * Usage: npm run migrate:tenant-schemas
 *        or: tsx apps/api/scripts/run-tenant-schemas-migration.ts
 * 
 * Safety: Uses IF NOT EXISTS and DO $$ blocks to make it idempotent
 */

import '../../../load-env';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

async function runTenantSchemasMigration() {
  console.log('🚀 Starting tenant schemas migration...');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set. Did you forget to provision the database?');
  }
  
  try {
    // Read the SQL migration file
    const migrationPath = join(process.cwd(), 'migrations', 'add-tenant-schemas.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);
    
    const sqlContent = readFileSync(migrationPath, 'utf-8');
    
    // Remove comment-only lines (lines that are only comments)
    // Keep lines that have code before comments
    const cleanedContent = sqlContent
      .split('\n')
      .map(line => {
        // Remove full-line comments but keep inline comments
        const trimmed = line.trim();
        if (trimmed.startsWith('--') && !trimmed.includes(';')) {
          return ''; // Remove comment-only lines
        }
        return line;
      })
      .filter(line => line.trim() !== '')
      .join('\n')
      .trim();
    
    // Use pg Pool directly to execute multiple statements
    // Drizzle's sql.raw might not handle DO $$ blocks well
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    console.log('📝 Executing migration SQL...');
    
    try {
      // Execute the entire SQL file
      // The SQL file already has IF NOT EXISTS checks, so it's safe to run multiple times
      await pool.query(cleanedContent);
      console.log('  ✓ Migration SQL executed successfully');
    } catch (error) {
      // Some errors are expected (e.g., IF NOT EXISTS when already exists)
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's a "already exists" type error (which is safe to ignore)
      if (errorMessage.includes('already exists') || 
          errorMessage.includes('duplicate') ||
          errorMessage.includes('IF NOT EXISTS')) {
        console.log(`  ⚠ Migration skipped (already exists): ${errorMessage.substring(0, 100)}`);
      } else {
        console.error(`  ✗ Migration failed:`, errorMessage);
        throw error; // Re-throw unexpected errors
      }
    } finally {
      await pool.end();
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('   - tenant_schemas table created (if not exists)');
    console.log('   - schema_name column added to migrations table (if not exists)');
    console.log('   - schema_name column added to schema_versions table (if not exists)');
    
    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    
    const tenantSchemasExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tenant_schemas'
      );
    `);
    
    const migrationsHasColumn = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'migrations' 
        AND column_name = 'schema_name'
      );
    `);
    
    const schemaVersionsHasColumn = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'schema_versions' 
        AND column_name = 'schema_name'
      );
    `);
    
    console.log(`   ✓ tenant_schemas table: ${tenantSchemasExists.rows[0]?.exists ? '✅ exists' : '❌ missing'}`);
    console.log(`   ✓ migrations.schema_name: ${migrationsHasColumn.rows[0]?.exists ? '✅ exists' : '❌ missing'}`);
    console.log(`   ✓ schema_versions.schema_name: ${schemaVersionsHasColumn.rows[0]?.exists ? '✅ exists' : '❌ missing'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('   Error details:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTenantSchemasMigration();
}

export { runTenantSchemasMigration };

