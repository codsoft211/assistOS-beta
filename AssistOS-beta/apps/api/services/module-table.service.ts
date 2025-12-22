import { tenantSchemaService } from './tenant-schema.service';
import { MODULE_TABLE_TEMPLATES, type TableDefinition } from '../../../packages/modules/templates/module-tables';
import { schemaTemplateGenerator } from './schema-template-generator.service';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { 
  insertIntoTenantTable, 
  selectFromTenantTable, 
  deleteFromTenantTable,
  getTenantTableRef 
} from '../utils/tenant-db-helper';
import { 
  getModuleTableList, 
  normalizeModuleId as normalizeModuleIdFromJson,
  getCachedModuleTableDefinitions,
  getTableDefinition as getTableDefinitionFromJson,
  type TableDefinition as JsonTableDefinition
} from '../../../packages/modules/templates/tables';

export class ModuleTableService {
  /**
   * Normalize module ID to match JSON file names
   * Uses the centralized normalizer from the JSON loader
   */
  private normalizeModuleId(moduleId: string): string {
    return normalizeModuleIdFromJson(moduleId);
  }
  
  /**
   * Get table list for a module from JSON definitions
   */
  private getModuleTableList(moduleId: string): string[] {
    return getModuleTableList(moduleId);
  }

  /**
   * Generate CREATE TABLE DDL from table definition
   */
  private generateCreateTableDDL(tableDef: TableDefinition, schemaName: string): string {
    const columns = tableDef.columns.map(col => {
      let colDef = `${this.escapeIdentifier(col.name)} ${this.getPostgresType(col)}`;
      
      if (col.primaryKey) {
        colDef += ' PRIMARY KEY';
      }
      
      if (!col.nullable && !col.primaryKey) {
        colDef += ' NOT NULL';
      }
      
      if (col.default !== undefined) {
        colDef += ` DEFAULT ${this.formatDefault(col.default)}`;
      }
      
      return colDef;
    }).join(',\n    ');

    // Add foreign keys as constraints
    const foreignKeys = tableDef.columns
      .filter(col => col.foreignKey)
      .map(col => {
        const fk = col.foreignKey!;
        const onDelete = fk.onDelete || 'RESTRICT';
        return `    CONSTRAINT ${this.escapeIdentifier(`fk_${tableDef.name}_${col.name}`)} ` +
               `FOREIGN KEY (${this.escapeIdentifier(col.name)}) ` +
               `REFERENCES ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(fk.table)}(${this.escapeIdentifier(fk.column)}) ` +
               `ON DELETE ${onDelete}`;
      });

    // Combine columns and foreign keys
    const allDefs = foreignKeys.length > 0 
      ? columns + ',\n' + foreignKeys.join(',\n')
      : columns;

    return `CREATE TABLE ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableDef.name)} (\n    ${allDefs}\n);`;
  }

  /**
   * Generate CREATE INDEX DDL
   */
  private generateCreateIndexDDL(
    indexDef: { name: string; columns: string[]; unique?: boolean },
    tableName: string,
    schemaName: string
  ): string {
    const unique = indexDef.unique ? 'UNIQUE ' : '';
    const columns = indexDef.columns.map(c => this.escapeIdentifier(c)).join(', ');
    return `CREATE ${unique}INDEX ${this.escapeIdentifier(indexDef.name)} ` +
           `ON ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)} (${columns});`;
  }

  /**
   * Create ALL tables for a module in tenant schema (RECOMMENDED)
   * Dynamically copies table structures from public schema
   * This automatically includes ALL 158 tables across modules
   * Also registers each table in custom_tables metadata (tenant-scoped)
   */
  async createModuleTablesFromSchema(
    tenantId: string,
    moduleId: string,
    userId?: string // Optional: used for custom_tables created_by field
  ): Promise<{ tablesCreated: number; tables: string[]; errors: string[]; customTableIds: string[] }> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[ModuleTableService] 🚀 Starting table creation for module: ${moduleId}`);
    console.log(`[ModuleTableService] 📌 Tenant: ${tenantId}`);
    console.log(`[ModuleTableService] 👤 UserId: ${userId || 'NOT PROVIDED (custom_tables registration will be skipped!)'}`);
    console.log(`${'='.repeat(80)}`);
    
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      console.error(`[ModuleTableService] ❌ No schema found for tenant ${tenantId}`);
      throw new Error(`No schema found for tenant ${tenantId}. Schema must be created first.`);
    }

    console.log(`[ModuleTableService] 📋 Creating tables for module ${moduleId} in schema ${schemaName}...`);
    
    // Check what tables are expected for this module (loaded from JSON)
    const normalizedId = this.normalizeModuleId(moduleId);
    const expectedTables = this.getModuleTableList(moduleId);
    console.log(`[ModuleTableService] 📝 Module ${moduleId} -> normalized: ${normalizedId}`);
    console.log(`[ModuleTableService] 📝 Expected tables from JSON (${expectedTables.length}): ${expectedTables.join(', ') || 'NONE FOUND!'}`);
    
    if (expectedTables.length === 0) {
      console.log(`[ModuleTableService] ⚠️ WARNING: No tables found in JSON definition!`);
      console.log(`[ModuleTableService] ⚠️ Check if file exists: packages/modules/templates/tables/${normalizedId}.json`);
    }

    // Use dynamic generator to create all tables
    const result = await schemaTemplateGenerator.createModuleTables(tenantId, moduleId, schemaName);

    console.log(`[ModuleTableService] ✅ Created ${result.tablesCreated} table(s) for module ${moduleId}`);
    if (result.tables.length > 0) {
      console.log(`[ModuleTableService] Tables created: ${result.tables.join(', ')}`);
    } else {
      console.log(`[ModuleTableService] ⚠️ No tables were created - tables may not exist in public schema or already exist in tenant schema`);
    }

    // Register each created table in custom_tables metadata (tenant-scoped)
    const customTableIds: string[] = [];
    
    // Skip custom_tables registration if no userId is provided
    // The created_by column has a NOT NULL foreign key constraint to users.id
    if (!userId) {
      console.log(`[ModuleTableService] ⚠️ No userId provided - skipping custom_tables metadata registration`);
      if (result.tables.length > 0) {
        console.log(`[ModuleTableService] Tables were created but not registered in custom_tables: ${result.tables.join(', ')}`);
      }
      return {
        tablesCreated: result.tablesCreated,
        tables: result.tables,
        errors: ['No userId provided - custom_tables metadata not registered'],
        customTableIds: [],
      };
    }
    
    // Use normalized module ID for category (consistent with deletion)
    const categoryId = normalizedId;
    console.log(`[ModuleTableService] 📝 Registering ${result.tables.length} table(s) in custom_tables with category: ${categoryId}`);
    
    for (const tableName of result.tables) {
      try {
        console.log(`[ModuleTableService]   🔄 Processing: ${tableName}`);
        
        // Get table definition from JSON (preferred) or fall back to querying the database
        const jsonDef = getTableDefinitionFromJson(moduleId, tableName);
        let columns: any[] = [];
        let indexes: any[] = [];
        
        if (jsonDef && jsonDef.columns) {
          // Use JSON definition directly - this is more reliable
          columns = jsonDef.columns.map(col => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable !== false,
            primaryKey: col.primaryKey || false,
            default: col.default,
          }));
          indexes = jsonDef.indexes || [];
          console.log(`[ModuleTableService]   📊 Got structure from JSON: ${columns.length} columns`);
        } else {
          // Fall back to querying the database (for tables copied from public schema)
          const structure = await schemaTemplateGenerator.getTableStructure(tableName);
          columns = structure.columns;
          indexes = structure.indexes;
          console.log(`[ModuleTableService]   📊 Got structure from DB: ${columns.length} columns`);
        }
        
        // Insert into tenant's custom_tables metadata
        const customTableRecord = await insertIntoTenantTable(tenantId, 'custom_tables', {
          tenant_id: tenantId,
          table_name: tableName,
          description: jsonDef?.description || `Module ${moduleId} table: ${tableName}`,
          category: categoryId, // Use normalized moduleId as category for easy cleanup
          columns: JSON.stringify(columns),
          is_editable: false, // Module tables are not directly editable
          is_system_table: true, // These are system tables from module
          is_active: true,
          is_deleted: false,
          metadata: JSON.stringify({ 
            moduleId: categoryId, // Store normalized ID
            originalModuleId: moduleId, // Store original for reference
            createdByModule: true,
            indexes
          }),
          created_by: userId,
          environment: 'production',
        });
        
        customTableIds.push(customTableRecord.id);
        console.log(`[ModuleTableService]   ✅ Registered ${tableName} in custom_tables (id: ${customTableRecord.id})`);
      } catch (error: any) {
        console.error(`[ModuleTableService]   ❌ Failed to register ${tableName} in custom_tables:`, error.message);
        console.error(`[ModuleTableService]   Full error:`, error);
        // Continue - table was created, just metadata registration failed
      }
    }

    return {
      tablesCreated: result.tablesCreated,
      tables: result.tables,
      errors: [],
      customTableIds,
    };
  }

  /**
   * Remove all tables for a module from tenant schema
   * Also removes entries from custom_tables metadata
   * 
   * Falls back to removing tables from the module's table list if no custom_tables entries exist
   * 
   * @param tenantId - Tenant ID
   * @param moduleId - Module ID (used as category in custom_tables)
   * @param hardDelete - If true, physically drop tables. If false, soft delete (rename with _deleted suffix)
   */
  async removeModuleTables(
    tenantId: string,
    moduleId: string,
    hardDelete: boolean = false
  ): Promise<{ tablesRemoved: number; tables: string[]; errors: string[] }> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${tenantId}`);
    }

    // Normalize moduleId to match how tables were created
    const normalizedId = this.normalizeModuleId(moduleId);
    console.log(`[ModuleTableService] Removing tables for module ${moduleId} (normalized: ${normalizedId}) from schema ${schemaName}...`);

    // Get all custom_tables entries for this module (category = normalizedId)
    let moduleTables = await selectFromTenantTable<{
      id: string;
      table_name: string;
      is_deleted: boolean;
    }>(
      tenantId,
      'custom_tables',
      sql`category = ${normalizedId} AND is_deleted = false`
    );

    // If no custom_tables entries found, fallback to module table list (from JSON) and check which exist in schema
    if (moduleTables.length === 0) {
      console.log(`[ModuleTableService] No custom_tables entries found for ${moduleId}, checking module table list...`);
      
      // Get the module's table list from JSON definition
      const moduleTableList = this.getModuleTableList(moduleId);
      
      if (moduleTableList.length > 0) {
        // Check which of these tables actually exist in the tenant schema
        const existingTablesResult = await db.execute(sql`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = ${schemaName}
          AND table_name = ANY(${moduleTableList})
        `);
        
        // Create temporary entries for removal
        moduleTables = (existingTablesResult.rows as any[]).map((row: any) => ({
          id: '', // No custom_tables entry
          table_name: row.table_name,
          is_deleted: false,
        }));
        
        console.log(`[ModuleTableService] Found ${moduleTables.length} tables from module ${moduleId} in tenant schema`);
      }
    }

    const removedTables: string[] = [];
    const errors: string[] = [];

    for (const tableRecord of moduleTables) {
      try {
        // Always DROP the physical SQL table (for both soft and hard delete)
        // Soft delete keeps metadata for restore capability, hard delete removes metadata
        await db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(`"${schemaName}"."${tableRecord.table_name}"`)} CASCADE`);
        console.log(`[ModuleTableService] ✅ Dropped SQL table ${schemaName}.${tableRecord.table_name}`);

        // Update custom_tables metadata (use table_name if id is empty)
        const tableRef = await getTenantTableRef(tenantId, 'custom_tables');
        const whereClause = tableRecord.id 
          ? sql`id = ${tableRecord.id}` 
          : sql`table_name = ${tableRecord.table_name}`;
        
        if (hardDelete) {
          // Hard delete - remove metadata entry completely
          try {
            await db.execute(sql`DELETE FROM ${tableRef} WHERE ${whereClause}`);
            console.log(`[ModuleTableService] ✅ Deleted custom_tables metadata for ${tableRecord.table_name}`);
          } catch (deleteError: any) {
            console.log(`[ModuleTableService] ℹ️ No custom_tables entry found for ${tableRecord.table_name}`);
          }
        } else {
          // Soft delete/Archive - keep metadata but mark as inactive (can be restored later)
          try {
            await db.execute(sql`
              UPDATE ${tableRef}
              SET is_deleted = true, is_active = false, updated_at = NOW()
              WHERE ${whereClause}
            `);
            console.log(`[ModuleTableService] ✅ Archived custom_tables entry for ${tableRecord.table_name} (SQL dropped, metadata kept)`);
          } catch (updateError: any) {
            console.log(`[ModuleTableService] ℹ️ No custom_tables entry found for ${tableRecord.table_name}`);
          }
        }

        removedTables.push(tableRecord.table_name);
      } catch (error: any) {
        console.error(`[ModuleTableService] ❌ Failed to remove ${tableRecord.table_name}:`, error.message);
        errors.push(`${tableRecord.table_name}: ${error.message}`);
      }
    }

    console.log(`[ModuleTableService] ✅ Removed ${removedTables.length} table(s) for module ${moduleId}`);

    return {
      tablesRemoved: removedTables.length,
      tables: removedTables,
      errors,
    };
  }

  /**
   * Create default tables for a module in tenant schema (LEGACY)
   * Uses static MODULE_TABLE_TEMPLATES - only has 1-2 tables per module
   * 
   * @deprecated Use createModuleTablesFromSchema() instead for complete table sets
   */
  async createModuleTables(
    tenantId: string,
    moduleId: string
  ): Promise<{ tablesCreated: number; ddl: string[] }> {
    const template = MODULE_TABLE_TEMPLATES[moduleId];
    if (!template) {
      throw new Error(`No table template found for module ${moduleId}`);
    }

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${tenantId}. Schema must be created first.`);
    }

    const ddlStatements: string[] = [];

    // Create tables
    for (const tableDef of template.tables) {
      const createTableDDL = this.generateCreateTableDDL(tableDef, schemaName);
      ddlStatements.push(createTableDDL);

      // Create indexes
      if (tableDef.indexes) {
        for (const indexDef of tableDef.indexes) {
          const createIndexDDL = this.generateCreateIndexDDL(indexDef, tableDef.name, schemaName);
          ddlStatements.push(createIndexDDL);
        }
      }
    }

    // Execute all DDL statements in tenant schema
    await tenantSchemaService.executeInTenantSchema(tenantId, ddlStatements);

    console.log(`[ModuleTableService] ✅ Created ${template.tables.length} table(s) for module ${moduleId} in schema ${schemaName}`);

    return {
      tablesCreated: template.tables.length,
      ddl: ddlStatements,
    };
  }

  /**
   * Preview module tables (generate DDL without executing)
   * Used to show user what tables will be created before installation
   */
  async previewModuleTables(tenantId: string, moduleId: string): Promise<{
    tables: TableDefinition[];
    ddl: string[];
  }> {
    const template = MODULE_TABLE_TEMPLATES[moduleId];
    if (!template) {
      throw new Error(`No table template found for module ${moduleId}`);
    }

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${tenantId}`);
    }

    const ddlStatements: string[] = [];

    for (const tableDef of template.tables) {
      ddlStatements.push(this.generateCreateTableDDL(tableDef, schemaName));
      
      if (tableDef.indexes) {
        for (const indexDef of tableDef.indexes) {
          ddlStatements.push(this.generateCreateIndexDDL(indexDef, tableDef.name, schemaName));
        }
      }
    }

    return {
      tables: template.tables,
      ddl: ddlStatements,
    };
  }

  /**
   * Convert column type to PostgreSQL type
   */
  private getPostgresType(col: { type: string; length?: number }): string {
    switch (col.type) {
      case 'varchar':
        return col.length ? `VARCHAR(${col.length})` : 'VARCHAR';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'decimal':
        return 'DECIMAL(19, 4)';
      case 'boolean':
        return 'BOOLEAN';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'jsonb':
        return 'JSONB';
      default:
        return 'TEXT';
    }
  }

  /**
   * Format default value for PostgreSQL
   */
  private formatDefault(value: string | number | boolean): string {
    if (typeof value === 'string') {
      // If it's a function call like NOW(), don't quote it
      if (value.includes('(') && value.includes(')')) {
        return value;
      }
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  /**
   * Escape PostgreSQL identifier to prevent SQL injection
   */
  private escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
}

export const moduleTableService = new ModuleTableService();
