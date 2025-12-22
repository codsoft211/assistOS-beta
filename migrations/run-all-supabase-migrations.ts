/**
 * Migration Runner: Execute all SQL migrations from supabase/migrations folder
 * 
 * Usage:
 *   npx tsx migrations/run-all-supabase-migrations.ts
 */

import '../load-env';
import { Pool } from 'pg';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

async function runAllMigrations(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Running all Supabase migrations');
  console.log('='.repeat(80));
  console.log();

  const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or SUPABASE_DATABASE_URL environment variable must be set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

  try {
    // Get all SQL files sorted by name (they're timestamped)
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    console.log(`Found ${sqlFiles.length} migration files to execute`);
    console.log();

    let successCount = 0;
    let errorCount = 0;

    for (const file of sqlFiles) {
      const filePath = join(migrationsDir, file);
      console.log(`=== Executing: ${file} ===`);

      try {
        const sql = await readFile(filePath, 'utf-8');
        await pool.query(sql);
        console.log(`✅ Success`);
        successCount++;
      } catch (error: any) {
        // Check if it's a "already exists" type error (safe to ignore)
        if (error.message?.includes('already exists') || 
            error.message?.includes('duplicate key') ||
            error.code === '42710' || // duplicate_object
            error.code === '42P07') { // duplicate_table
          console.log(`⏭️  Skipped (already exists)`);
          successCount++;
        } else {
          console.error(`❌ Error: ${error.message}`);
          errorCount++;
        }
      }
      console.log();
    }

    console.log('='.repeat(80));
    console.log('Migration Summary');
    console.log('='.repeat(80));
    console.log(`Total migrations: ${sqlFiles.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);

    if (errorCount > 0) {
      process.exit(1);
    }

  } catch (error: any) {
    console.error('Fatal error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runAllMigrations()
  .then(() => {
    console.log();
    console.log('✅ Migration runner completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration runner failed:', error);
    process.exit(1);
  });

