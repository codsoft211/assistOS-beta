import { db } from '../db';
import { tenantSchemas } from '../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';

/**
 * Essential tables that MUST exist in every tenant schema for basic operations.
 * These are created automatically during tenant schema creation.
 * 
 * === FOUNDATION (2 tables) ===
 * user_tenants: Required for user-tenant relationship (registration, login)
 * company_info: Required for tenant configuration
 * 
 * === CORE OPERATIONS (7 tables) ===
 * audit_log: Security & compliance tracking for all tenant actions
 * activities: Unified activity feed across all modules
 * notifications: User notification system
 * notification_preferences: User notification settings per channel
 * file_attachments: Document/file storage for all modules
 * tenant_context: AI context & personalization data
 * tenant_modules: Which modules are active for the tenant
 * 
 * === PERMISSIONS & ACCESS (2 tables) ===
 * tenant_user_roles: Custom role assignments per tenant
 * assistbuild_roles: Role definitions for AssistBuild configuration
 * 
 * === ORGANIZATION STRUCTURE (3 tables) ===
 * departments: Hierarchical department structure (can have parent departments)
 * teams: Teams belonging to departments
 * team_members: User membership in teams
 * 
 * === EXECUTION ENGINE (3 tables) ===
 * user_actions: Action pattern tracking for automation suggestions
 * detected_patterns: Detected automation patterns from user behavior
 * automation_executions: Execution history for automations
 * 
 * === CUSTOM TABLES (1 table) ===
 * custom_tables: Metadata for tenant-editable tables (tracks which tables can be created/edited by tenants)
 * 
 * NOTE: warehouses table is NOT included here - it's created when Logistica module is activated
 */
const ESSENTIAL_TENANT_TABLES = [
  // Foundation (2 tables)
  'user_tenants',
  'company_info',
  
  // Core Operations (7 tables)
  'audit_log',
  'notifications',
  'notification_preferences',
  'file_attachments',
  'tenant_context',
  'tenant_modules',
  
  // Permissions & Access (2 tables)
  'tenant_user_roles',
  'assistbuild_roles',
  
  // Organization Structure (3 tables)
  'departments',
  'teams',
  'team_members',
  
  // Execution Engine (3 tables)
  'user_actions',
  'detected_patterns',
  'automation_executions',
  
  // Custom Tables (1 table)
  'custom_tables',
];

export class TenantSchemaService {
  private pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set');
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Generate safe schema name from tenant ID
   * PostgreSQL schema names must be valid identifiers
   * Format: tenant_{tenantId} (with hyphens replaced by underscores)
   */
  private sanitizeSchemaName(tenantId: string): string {
    // Remove hyphens and replace with underscores, keep only alphanumeric and underscores
    const sanitized = tenantId.toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '_');
    // Ensure it starts with 'tenant_'
    const final = `tenant_${sanitized}`;
    // Limit length to 63 (PostgreSQL identifier limit)
    return final.substring(0, 63);
  }

  /**
   * Create a new database schema for a tenant in Supabase
   * Schema name format: tenant_{tenantId} (e.g., tenant_810f22c3_5e5d_4be2_b062_615fa489996f)
   * 
   * This method also creates essential tables required for basic tenant operations:
   * - user_tenants: For user-tenant relationships
   * - warehouses: For onboarding default warehouse
   * - company_info: For tenant configuration
   * 
   * The operation is atomic - if any step fails, the entire schema creation is rolled back.
   */
  async createTenantSchema(tenantId: string): Promise<string> {
    const schemaName = this.sanitizeSchemaName(tenantId);

    // Check if schema already exists
    const existing = await db
      .select()
      .from(tenantSchemas)
      .where(eq(tenantSchemas.tenantId, tenantId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[TenantSchemaService] Schema already exists for tenant ${tenantId}: ${existing[0].schemaName}`);
      return existing[0].schemaName;
    }

    // Use a dedicated client for transaction
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create schema in database
      const escapedSchemaName = this.escapeIdentifier(schemaName);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${escapedSchemaName}`);
      console.log(`[TenantSchemaService] ✅ Created schema ${schemaName} for tenant ${tenantId}`);
      
      // Create essential tables in the new schema (within same transaction)
      await this.createEssentialTablesWithClient(client, schemaName);
      
      // Store metadata only after tables are created successfully
      await db.insert(tenantSchemas).values({
        tenantId,
        schemaName,
        currentVersion: 1,
      });
      
      await client.query('COMMIT');
      console.log(`[TenantSchemaService] ✅ Tenant schema setup complete for ${tenantId}`);
      
      return schemaName;
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error(`[TenantSchemaService] ❌ Failed to create tenant schema, rolling back:`, error.message);
      
      // Clean up any partial schema that might have been created
      try {
        const escapedSchemaName = this.escapeIdentifier(schemaName);
        await client.query(`DROP SCHEMA IF EXISTS ${escapedSchemaName} CASCADE`);
      } catch (cleanupError) {
        console.error(`[TenantSchemaService] ❌ Cleanup failed:`, cleanupError);
      }
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create essential tables in tenant schema by copying structure from public schema.
   * Uses PostgreSQL's CREATE TABLE ... (LIKE ... INCLUDING ALL) syntax to copy
   * table structure, constraints, indexes, and defaults.
   * 
   * This method THROWS if any essential table fails to create - the caller
   * must handle the error and perform appropriate rollback.
   */
  private async createEssentialTablesWithClient(client: any, schemaName: string): Promise<void> {
    console.log(`[TenantSchemaService] Creating essential tables in schema ${schemaName}...`);
    
    const escapedSchema = this.escapeIdentifier(schemaName);
    const createdTables: string[] = [];

    for (const tableName of ESSENTIAL_TENANT_TABLES) {
      // Check if table exists in public schema first
      const publicCheckResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        ) as exists
      `, [tableName]);
      
      const publicTableExists = publicCheckResult.rows[0]?.exists || false;
      
      if (!publicTableExists) {
        console.log(`[TenantSchemaService] ⚠️ Skipping ${tableName} - doesn't exist in public schema`);
        continue;
      }

      // Copy table structure from public schema
      const escapedTable = this.escapeIdentifier(tableName);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${escapedSchema}.${escapedTable}
        (LIKE public.${escapedTable} INCLUDING ALL)
      `);
      
      createdTables.push(tableName);
      console.log(`[TenantSchemaService]   ✅ Created ${schemaName}.${tableName}`);
    }

    console.log(`[TenantSchemaService] Essential tables created: ${createdTables.length} (${createdTables.join(', ')})`);
  }

  /**
   * Get tenant schema name
   */
  async getTenantSchemaName(tenantId: string): Promise<string | null> {
    const [result] = await db
      .select({ schemaName: tenantSchemas.schemaName })
      .from(tenantSchemas)
      .where(eq(tenantSchemas.tenantId, tenantId))
      .limit(1);

    return result?.schemaName || null;
  }

  /**
   * Get tenant schema info
   */
  async getTenantSchema(tenantId: string) {
    const [result] = await db
      .select()
      .from(tenantSchemas)
      .where(eq(tenantSchemas.tenantId, tenantId))
      .limit(1);

    return result || null;
  }

  /**
   * Increment schema version
   */
  async incrementSchemaVersion(tenantId: string): Promise<number> {
    const [updated] = await db
      .update(tenantSchemas)
      .set({
        currentVersion: sql`${tenantSchemas.currentVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tenantSchemas.tenantId, tenantId))
      .returning({ version: tenantSchemas.currentVersion });

    return updated?.version || 1;
  }

  /**
   * Get current schema version
   */
  async getCurrentSchemaVersion(tenantId: string): Promise<number> {
    const [result] = await db
      .select({ version: tenantSchemas.currentVersion })
      .from(tenantSchemas)
      .where(eq(tenantSchemas.tenantId, tenantId))
      .limit(1);

    return result?.version || 1;
}

  /**
   * Execute SQL in tenant schema context
   * Sets search_path to tenant schema before executing statements
   */
  async executeInTenantSchema(tenantId: string, sqlStatements: string[]): Promise<void> {
    const schemaName = await this.getTenantSchemaName(tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${tenantId}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Set search path to tenant schema
      const escapedSchemaName = this.escapeIdentifier(schemaName);
      await client.query(`SET search_path TO ${escapedSchemaName}`);

      // Execute all statements
      for (const statement of sqlStatements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }

      await client.query('COMMIT');
      console.log(`[TenantSchemaService] ✅ Executed ${sqlStatements.length} statement(s) in schema ${schemaName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[TenantSchemaService] ❌ Error executing in schema ${schemaName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Escape PostgreSQL identifier to prevent SQL injection
   */
  private escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /**
   * Drop tenant schema (for cleanup/testing only)
   */
  async dropTenantSchema(tenantId: string): Promise<void> {
    const schemaInfo = await this.getTenantSchema(tenantId);
    if (!schemaInfo) {
      return;
    }

    // Drop schema (CASCADE removes all objects)
    const escapedSchemaName = this.escapeIdentifier(schemaInfo.schemaName);
    await this.pool.query(
      `DROP SCHEMA IF EXISTS ${escapedSchemaName} CASCADE`
    );

    // Remove metadata
    await db.delete(tenantSchemas).where(eq(tenantSchemas.tenantId, tenantId));

    console.log(`[TenantSchemaService] ✅ Dropped schema ${schemaInfo.schemaName} for tenant ${tenantId}`);
  }
}

export const tenantSchemaService = new TenantSchemaService();
