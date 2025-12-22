/**
 * Migration: Remove icon and color columns from custom_tables
 * 
 * Usage:
 *   npx tsx migrations/0003_run_remove_icon_color.ts
 */

import '../load-env';
import { Pool } from 'pg';

async function runMigration(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Migration: Remove icon and color columns from custom_tables');
  console.log('='.repeat(80));
  console.log();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable must be set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check if columns exist before attempting to drop
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'custom_tables'
      AND column_name IN ('icon', 'color')
    `);

    const existingColumns = columnCheck.rows.map(r => r.column_name);
    
    if (existingColumns.length === 0) {
      console.log('✅ Columns icon and color have already been removed');
      return;
    }

    console.log(`Found columns to remove: ${existingColumns.join(', ')}`);
    console.log();

    // Drop columns from public schema
    if (existingColumns.includes('icon')) {
      await pool.query(`ALTER TABLE public.custom_tables DROP COLUMN IF EXISTS icon`);
      console.log('✅ Dropped column: icon');
    }

    if (existingColumns.includes('color')) {
      await pool.query(`ALTER TABLE public.custom_tables DROP COLUMN IF EXISTS color`);
      console.log('✅ Dropped column: color');
    }

    console.log();
    console.log('Migration completed successfully!');

  } catch (error: any) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
