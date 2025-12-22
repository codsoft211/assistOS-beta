/**
 * Run AssistBuild Foundation Migration
 * Creates assistbuild_workflows, assistbuild_executions, assistbuild_execution_logs tables
 */

import '../load-env.js';
import { Pool } from 'pg';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function runMigration() {
  console.log('='.repeat(80));
  console.log('Running AssistBuild Foundation Migration');
  console.log('='.repeat(80));
  console.log();

  const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or SUPABASE_DATABASE_URL environment variable must be set');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20251216000000_assistbuild_foundation.sql');
    console.log(`Reading migration file: ${migrationPath}`);
    
    const sql = await readFile(migrationPath, 'utf-8');
    
    console.log('Executing migration...');
    console.log();
    
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log();
    console.log('Created tables:');
    console.log('  - assistbuild_workflows');
    console.log('  - assistbuild_executions');
    console.log('  - assistbuild_execution_logs');
    console.log();
    console.log('Created views:');
    console.log('  - v_assistbuild_executions_latest');
    console.log('  - v_assistbuild_workflow_stats');
    console.log('  - v_assistbuild_node_performance');
    console.log();
    console.log('Created function:');
    console.log('  - get_assistbuild_execution_summary()');
    
  } catch (error: any) {
    console.error('❌ Migration failed:');
    console.error(error.message);
    
    if (error.message?.includes('already exists')) {
      console.log();
      console.log('⚠️  Tables may already exist. This is safe to ignore if re-running.');
    }
    
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
