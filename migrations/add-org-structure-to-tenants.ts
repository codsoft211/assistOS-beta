/**
 * Migration: Add departments, teams, and team_members tables to all existing tenant schemas
 * 
 * This script adds the organization structure tables to all existing tenant schemas.
 * These tables are used for hierarchical department/team management.
 * 
 * Tables created:
 * - departments: Hierarchical department structure
 * - teams: Teams belonging to departments
 * - team_members: User membership in teams
 * 
 * Usage:
 *   npx tsx migrations/add-org-structure-to-tenants.ts
 *   npx tsx migrations/add-org-structure-to-tenants.ts --tenant-id=<specific-tenant-id>
 */

import { db } from '../apps/api/db';
import { tenantSchemas } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';

const ORG_STRUCTURE_TABLES = ['departments', 'teams', 'team_members'];

interface MigrationResult {
  tenantId: string;
  schemaName: string;
  table: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
}

/**
 * Escape PostgreSQL identifier to prevent SQL injection
 */
function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Check if a table exists in a schema
 */
async function tableExists(pool: Pool, schemaName: string, tableName: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = $1 
      AND table_name = $2
    ) as exists
  `, [schemaName, tableName]);
  return result.rows[0]?.exists || false;
}

/**
 * Create organization structure tables in public schema if they don't exist
 */
async function ensurePublicTablesExist(pool: Pool): Promise<void> {
  console.log('Checking public schema tables...');
  
  // Check and create departments table
  if (!(await tableExists(pool, 'public', 'departments'))) {
    console.log('  Creating departments table in public schema...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.departments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        environment text DEFAULT 'production' NOT NULL,
        name text NOT NULL,
        description text,
        parent_department_id varchar,
        manager_id varchar REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    
    await pool.query(`CREATE INDEX IF NOT EXISTS departments_tenant_idx ON public.departments(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS departments_parent_idx ON public.departments(parent_department_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS departments_manager_idx ON public.departments(manager_id)`);
    
    console.log('  ✅ Created departments table');
  } else {
    console.log('  ✅ departments table already exists');
  }
  
  // Check and create teams table
  if (!(await tableExists(pool, 'public', 'teams'))) {
    console.log('  Creating teams table in public schema...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.teams (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        environment text DEFAULT 'production' NOT NULL,
        department_id varchar REFERENCES departments(id) ON DELETE SET NULL,
        name text NOT NULL,
        description text,
        team_lead_id varchar REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    
    await pool.query(`CREATE INDEX IF NOT EXISTS teams_tenant_idx ON public.teams(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS teams_department_idx ON public.teams(department_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS teams_team_lead_idx ON public.teams(team_lead_id)`);
    
    console.log('  ✅ Created teams table');
  } else {
    console.log('  ✅ teams table already exists');
  }
  
  // Check and create team_members table
  if (!(await tableExists(pool, 'public', 'team_members'))) {
    console.log('  Creating team_members table in public schema...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.team_members (
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        team_id varchar NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        role text DEFAULT 'member' NOT NULL,
        joined_at timestamp DEFAULT now() NOT NULL,
        PRIMARY KEY (user_id, team_id)
      )
    `);
    
    await pool.query(`CREATE INDEX IF NOT EXISTS team_members_team_idx ON public.team_members(team_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS team_members_user_idx ON public.team_members(user_id)`);
    
    console.log('  ✅ Created team_members table');
  } else {
    console.log('  ✅ team_members table already exists');
  }
  
  console.log();
}

/**
 * Create table in tenant schema by copying structure from public schema
 * Drops tenant_id and environment columns as they're redundant in tenant schemas
 */
async function createTableInTenantSchema(
  pool: Pool,
  schemaName: string,
  tableName: string
): Promise<void> {
  const escapedSchema = escapeIdentifier(schemaName);
  const escapedTable = escapeIdentifier(tableName);
  
  // Create table by copying structure from public
  await pool.query(`
    CREATE TABLE ${escapedSchema}.${escapedTable}
    (LIKE public.${escapedTable} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)
  `);
  
  // Drop redundant columns (tenant_id and environment)
  // These are handled by the schema itself
  const columnsToDrops = ['tenant_id', 'environment'];
  
  for (const column of columnsToDrops) {
    try {
      await pool.query(`
        ALTER TABLE ${escapedSchema}.${escapedTable}
        DROP COLUMN IF EXISTS ${escapeIdentifier(column)} CASCADE
      `);
    } catch (error: any) {
      // Ignore errors if column doesn't exist
      if (!error.message?.includes('does not exist')) {
        console.warn(`    ⚠️  Could not drop ${column} from ${tableName}: ${error.message}`);
      }
    }
  }
}

async function addOrgStructureToTenants(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Migration: Add organization structure tables to all tenant schemas');
  console.log('Tables: departments, teams, team_members');
  console.log('='.repeat(80));
  console.log();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable must be set');
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const tenantIdArg = args.find(arg => arg.startsWith('--tenant-id='));
  const specificTenantId = tenantIdArg?.split('=')[1];

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const results: MigrationResult[] = [];

  try {
    // Ensure public tables exist first
    await ensurePublicTablesExist(pool);

    // Get tenant schemas to migrate
    let schemas;
    if (specificTenantId) {
      schemas = await db
        .select()
        .from(tenantSchemas)
        .where(eq(tenantSchemas.tenantId, specificTenantId));
      
      if (schemas.length === 0) {
        throw new Error(`No schema found for tenant ${specificTenantId}`);
      }
      console.log(`Migrating specific tenant: ${specificTenantId}`);
    } else {
      schemas = await db.select().from(tenantSchemas);
      console.log(`Found ${schemas.length} tenant schema(s) to migrate`);
    }
    console.log();

    // Process each tenant schema
    for (const schema of schemas) {
      const { tenantId, schemaName } = schema;
      
      console.log(`Processing tenant: ${tenantId}`);
      console.log(`  Schema: ${schemaName}`);

      // Process each table
      for (const tableName of ORG_STRUCTURE_TABLES) {
        try {
          // Check if table already exists in tenant schema
          const exists = await tableExists(pool, schemaName, tableName);

          if (exists) {
            console.log(`  ⏭️  ${tableName} - already exists`);
            results.push({
              tenantId,
              schemaName,
              table: tableName,
              status: 'skipped',
              message: 'Table already exists'
            });
            continue;
          }

          // Create the table
          await createTableInTenantSchema(pool, schemaName, tableName);

          console.log(`  ✅ ${tableName} - created successfully`);
          results.push({
            tenantId,
            schemaName,
            table: tableName,
            status: 'success',
            message: 'Table created successfully'
          });

        } catch (error: any) {
          console.error(`  ❌ ${tableName} - ${error.message}`);
          results.push({
            tenantId,
            schemaName,
            table: tableName,
            status: 'error',
            message: error.message
          });
          // Continue with other tables/tenants
        }
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

    console.log(`Total table operations: ${results.length}`);
    console.log(`✅ Successfully created: ${successCount}`);
    console.log(`⏭️  Skipped (already exists): ${skippedCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log();

    if (errorCount > 0) {
      console.log('Failed operations:');
      results
        .filter(r => r.status === 'error')
        .forEach(r => {
          console.log(`  - ${r.schemaName}.${r.table}: ${r.message}`);
        });
      console.log();
    }

    // Show per-tenant summary
    const tenantSummary = new Map<string, { success: number; skipped: number; error: number }>();
    for (const result of results) {
      if (!tenantSummary.has(result.tenantId)) {
        tenantSummary.set(result.tenantId, { success: 0, skipped: 0, error: 0 });
      }
      const summary = tenantSummary.get(result.tenantId)!;
      summary[result.status === 'success' ? 'success' : result.status === 'skipped' ? 'skipped' : 'error']++;
    }

    console.log('Per-tenant summary:');
    for (const [tenantId, summary] of tenantSummary) {
      const schema = schemas.find(s => s.tenantId === tenantId);
      console.log(`  ${tenantId} (${schema?.schemaName}): ${summary.success} created, ${summary.skipped} skipped, ${summary.error} failed`);
    }
    console.log();

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
addOrgStructureToTenants()
  .then(() => {
    console.log('✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:');
    console.error(error);
    process.exit(1);
  });

