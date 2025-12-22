/**
 * Schema Template Generator Service
 * 
 * Dynamically generates table templates from existing schema.ts definitions
 * This eliminates the need to manually duplicate 158 table definitions
 */

import * as schema from '../../../shared/schema';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { 
  getModuleTableList as getModuleTableListFromJson, 
  normalizeModuleId as normalizeModuleIdFromJson,
  hasColumnDefinitions,
  getModuleTableDefinitions,
  generateCreateTableSQL,
  generateIndexSQL,
  type TableDefinition
} from '../../../packages/modules/templates/tables';

export interface DynamicTableTemplate {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    primaryKey?: boolean;
  }>;
  indexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
  }>;
}

export class SchemaTemplateGeneratorService {
  private pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set');
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Get table structure from public schema
   * Reads actual table definition from PostgreSQL information_schema
   */
  async getTableStructure(tableName: string): Promise<DynamicTableTemplate> {
    // Get columns
    const columnsResult = await this.pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    // Get primary key
    const pkResult = await this.pool.query(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = (
        SELECT oid FROM pg_class 
        WHERE relname = $1 AND relnamespace = (
          SELECT oid FROM pg_namespace WHERE nspname = 'public'
        )
      )
      AND i.indisprimary
    `, [tableName]);

    const pkColumns = pkResult.rows.map(r => r.column_name);

    // Get indexes
    const indexResult = await this.pool.query(`
      SELECT
        i.relname as index_name,
        a.attname as column_name,
        ix.indisunique as is_unique
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relkind = 'r'
        AND t.relname = $1
        AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND NOT ix.indisprimary
      ORDER BY i.relname, a.attnum
    `, [tableName]);

    // Group indexes
    const indexMap = new Map<string, { columns: string[]; unique: boolean }>();
    for (const row of indexResult.rows) {
      if (!indexMap.has(row.index_name)) {
        indexMap.set(row.index_name, {
          columns: [],
          unique: row.is_unique,
        });
      }
      indexMap.get(row.index_name)!.columns.push(row.column_name);
    }

    const indexes = Array.from(indexMap.entries()).map(([name, config]) => ({
      name,
      columns: config.columns,
      unique: config.unique,
    }));

    // Build column definitions, excluding tenant_id and environment
    const excludedColumns = ['tenant_id', 'environment'];
    const columns = columnsResult.rows
      .filter(row => !excludedColumns.includes(row.column_name))
      .map(row => ({
        name: row.column_name,
        type: this.mapPostgresType(row.data_type, row.character_maximum_length),
        nullable: row.is_nullable === 'YES',
        default: this.parseDefault(row.column_default),
        primaryKey: pkColumns.includes(row.column_name),
      }));

    // Filter indexes to remove those that reference excluded columns
    const filteredIndexes = indexes.filter(idx => 
      !idx.columns.some(col => excludedColumns.includes(col))
    );

    return {
      name: tableName,
      columns,
      indexes: filteredIndexes,
    };
  }

  /**
   * Generate CREATE TABLE DDL for tenant schema
   * Copies structure from public schema table
   */
  async generateCreateTableDDL(tableName: string, targetSchema: string): Promise<string> {
    const template = await this.getTableStructure(tableName);

    const columnDefs = template.columns.map(col => {
      let def = `"${col.name}" ${col.type}`;
      
      if (col.primaryKey) {
        def += ' PRIMARY KEY';
      }
      
      if (!col.nullable && !col.primaryKey) {
        def += ' NOT NULL';
      }
      
      if (col.default !== undefined) {
        def += ` DEFAULT ${col.default}`;
      }
      
      return def;
    });

    const ddl = `CREATE TABLE "${targetSchema}"."${tableName}" (\n  ${columnDefs.join(',\n  ')}\n);`;

    return ddl;
  }

  /**
   * Columns to exclude when copying tables to tenant schema
   * These columns are redundant because tenant isolation is handled by the schema itself
   */
  private readonly EXCLUDED_COLUMNS = ['tenant_id', 'environment'];

  /**
   * Copy table structure from public to tenant schema
   * Excludes tenant_id and environment columns since they're redundant in tenant schemas
   */
  async copyTableStructure(tableName: string, targetSchema: string): Promise<void> {
    // First create the table using LIKE (includes all columns)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "${targetSchema}"."${tableName}" 
      (LIKE public."${tableName}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)
    `);
    
    // Then drop the redundant tenant_id and environment columns
    for (const column of this.EXCLUDED_COLUMNS) {
      try {
        await this.pool.query(`
          ALTER TABLE "${targetSchema}"."${tableName}" 
          DROP COLUMN IF EXISTS "${column}" CASCADE
        `);
      } catch (error: any) {
        // Ignore errors if column doesn't exist
        if (!error.message?.includes('does not exist')) {
          console.warn(`[SchemaTemplateGenerator] Could not drop ${column} from ${tableName}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Create all module tables in tenant schema
   * Uses JSON column definitions if available, otherwise copies from public schema
   */
  async createModuleTables(
    tenantId: string,
    moduleId: string,
    targetSchema: string
  ): Promise<{ tablesCreated: number; tables: string[] }> {
    console.log(`[SchemaTemplateGenerator] 🔧 Creating tables for module ${moduleId} in ${targetSchema}`);
    
    const normalizedModuleId = this.normalizeModuleId(moduleId);
    const tableNames = this.getModuleTableListForModule(moduleId);
    const useJsonDefinitions = hasColumnDefinitions(moduleId);
    const tableDefinitions = useJsonDefinitions ? getModuleTableDefinitions(moduleId) : {};

    console.log(`[SchemaTemplateGenerator] Module ID: ${moduleId} -> normalized: ${normalizedModuleId}`);
    console.log(`[SchemaTemplateGenerator] Found ${tableNames.length} tables in JSON definition`);
    console.log(`[SchemaTemplateGenerator] Using JSON column definitions: ${useJsonDefinitions}`);

    if (tableNames.length === 0) {
      console.log(`[SchemaTemplateGenerator] ❌ No tables defined for module ${moduleId} (normalized: ${normalizedModuleId})`);
      console.log(`[SchemaTemplateGenerator] Check if JSON file exists: packages/modules/templates/tables/${normalizedModuleId}.json`);
      return { tablesCreated: 0, tables: [] };
    }

    const createdTables: string[] = [];
    const skippedTables: string[] = [];

    for (const tableName of tableNames) {
      try {
        // Check if table already exists in tenant schema
        const existsInTenant = await this.tableExistsInSchema(tableName, targetSchema);
        if (existsInTenant) {
          console.log(`  ℹ️ Skipped ${tableName} (already exists in ${targetSchema})`);
          skippedTables.push(tableName);
          continue;
        }

        // If we have JSON column definitions, create from JSON
        if (useJsonDefinitions && tableDefinitions[tableName]) {
          await this.createTableFromDefinition(tableDefinitions[tableName], targetSchema);
          createdTables.push(tableName);
          console.log(`  ✅ Created ${targetSchema}.${tableName} (from JSON definition)`);
        } else {
          // Fallback: Copy from public schema
          const existsInPublic = await this.tableExistsInPublic(tableName);
          
          if (!existsInPublic) {
            console.log(`  ⚠️ Skipped ${tableName} (no JSON definition and doesn't exist in public schema)`);
            skippedTables.push(tableName);
            continue;
          }
          
          await this.copyTableStructure(tableName, targetSchema);
          createdTables.push(tableName);
          console.log(`  ✅ Created ${targetSchema}.${tableName} (from public schema)`);
        }
      } catch (error: any) {
        console.error(`  ❌ Failed to create ${tableName}:`, error.message);
        skippedTables.push(tableName);
      }
    }

    console.log(`[SchemaTemplateGenerator] Summary: ${createdTables.length} created, ${skippedTables.length} skipped`);

    return {
      tablesCreated: createdTables.length,
      tables: createdTables,
    };
  }

  /**
   * Create a table from JSON definition
   */
  private async createTableFromDefinition(tableDef: TableDefinition, targetSchema: string): Promise<void> {
    // Generate and execute CREATE TABLE SQL
    const createSQL = generateCreateTableSQL(tableDef, targetSchema);
    await this.pool.query(createSQL);
    
    // Generate and execute CREATE INDEX SQL statements
    const indexStatements = generateIndexSQL(tableDef, targetSchema);
    for (const indexSQL of indexStatements) {
      try {
        await this.pool.query(indexSQL);
      } catch (error: any) {
        // Ignore index creation errors (index may already exist)
        if (!error.message?.includes('already exists')) {
          console.warn(`  ⚠️ Index creation warning for ${tableDef.tableName}:`, error.message);
        }
      }
    }
  }

  private async tableExistsInSchema(tableName: string, schemaName: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_name = $2
      ) as exists
    `, [schemaName, tableName]);

    return result.rows[0]?.exists || false;
  }

  private async tableExistsInPublic(tableName: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      ) as exists
    `, [tableName]);

    return result.rows[0]?.exists || false;
  }

  /**
   * Normalize module ID using the centralized JSON loader
   */
  private normalizeModuleId(moduleId: string): string {
    return normalizeModuleIdFromJson(moduleId);
  }

  /**
   * Get table list for a module from JSON definitions
   */
  private getModuleTableListForModule(moduleId: string): string[] {
    return getModuleTableListFromJson(moduleId);
  }

  private mapPostgresType(pgType: string, maxLength?: number): string {
    switch (pgType) {
      case 'character varying':
        return maxLength ? `VARCHAR(${maxLength})` : 'VARCHAR';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'numeric':
        return 'DECIMAL(19, 4)';
      case 'boolean':
        return 'BOOLEAN';
      case 'timestamp without time zone':
      case 'timestamp with time zone':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'jsonb':
        return 'JSONB';
      default:
        return 'TEXT';
    }
  }

  private parseDefault(defaultValue: string | null): string | undefined {
    if (!defaultValue) return undefined;
    
    // Handle function calls like NOW(), gen_random_uuid()
    if (defaultValue.includes('(')) {
      if (defaultValue.includes('now()')) return 'NOW()';
      if (defaultValue.includes('gen_random_uuid()')) return 'gen_random_uuid()';
    }
    
    // Handle quoted strings
    if (defaultValue.startsWith("'")) {
      return defaultValue;
    }
    
    return defaultValue;
  }
}

export const schemaTemplateGenerator = new SchemaTemplateGeneratorService();


