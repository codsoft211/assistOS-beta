import { db } from '../db';
import { tenantSchemaService } from './tenant-schema.service';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

export interface ColumnDefinition {
  name: string;
  type: string;
  notNull?: boolean;
  default?: string;
  references?: {
    schema: string;
    table: string;
    column: string;
  };
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface ForeignKeyDefinition {
  column: string;
  referenceSchema: string;
  referenceTable: string;
  referenceColumn: string;
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL';
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes?: IndexDefinition[];
  foreignKeys?: ForeignKeyDefinition[];
  primaryKey?: string | string[];
}

export class TableMigrationService {
  private pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set');
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Migrate a single table from public to tenant schema
   */
  async migrateTable(
    tenantId: string,
    tableDefinition: TableDefinition,
    preserveData: boolean = true
  ): Promise<{ rowsMigrated: number }> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${tenantId}`);
    }

    console.log(`[TableMigration] Starting migration of ${tableDefinition.name} to schema ${schemaName}`);

    // 1. Generate CREATE TABLE DDL
    const createTableDDL = this.generateCreateTableDDL(
      schemaName,
      tableDefinition
    );

    // 2. Execute CREATE TABLE in tenant schema
    await tenantSchemaService.executeInTenantSchema(tenantId, [createTableDDL]);

    // 3. Migrate data if preserveData = true
    let rowsMigrated = 0;
    if (preserveData) {
      rowsMigrated = await this.migrateTableData(
        tenantId,
        schemaName,
        tableDefinition
      );
    }

    // 4. Create indexes
    if (tableDefinition.indexes && tableDefinition.indexes.length > 0) {
      const indexDDLs = this.generateIndexDDLs(
        schemaName,
        tableDefinition.name,
        tableDefinition.indexes
      );
      await tenantSchemaService.executeInTenantSchema(tenantId, indexDDLs);
    }

    // 5. Create foreign keys
    if (tableDefinition.foreignKeys && tableDefinition.foreignKeys.length > 0) {
      const fkDDLs = this.generateForeignKeyDDLs(
        schemaName,
        tableDefinition.name,
        tableDefinition.foreignKeys
      );
      await tenantSchemaService.executeInTenantSchema(tenantId, fkDDLs);
    }

    console.log(`[TableMigration] ✅ Migrated ${tableDefinition.name}: ${rowsMigrated} rows`);
    return { rowsMigrated };
  }

  /**
   * Generate CREATE TABLE DDL
   */
  private generateCreateTableDDL(
    schemaName: string,
    def: TableDefinition
  ): string {
    const escapedSchema = this.escapeIdentifier(schemaName);
    const escapedTable = this.escapeIdentifier(def.name);

    const columns = def.columns.map(col => {
      let colDef = `${this.escapeIdentifier(col.name)} ${col.type}`;
      if (col.notNull) colDef += ' NOT NULL';
      if (col.default) colDef += ` DEFAULT ${col.default}`;
      return colDef;
    }).join(',\n    ');

    // Primary key
    let primaryKeyDef = '';
    if (def.primaryKey) {
      const pkColumns = Array.isArray(def.primaryKey) 
        ? def.primaryKey.map(c => this.escapeIdentifier(c)).join(', ')
        : this.escapeIdentifier(def.primaryKey);
      primaryKeyDef = `,\n    PRIMARY KEY (${pkColumns})`;
    }

    return `
CREATE TABLE IF NOT EXISTS ${escapedSchema}.${escapedTable} (
    ${columns}${primaryKeyDef}
);
    `.trim();
  }

  /**
   * Migrate table data from public to tenant schema
   */
  private async migrateTableData(
    tenantId: string,
    schemaName: string,
    def: TableDefinition
  ): Promise<number> {
    const escapedSchema = this.escapeIdentifier(schemaName);
    const escapedTable = this.escapeIdentifier(def.name);
    
    // Check if table has tenant_id column
    const hasTenantId = def.columns.some(c => c.name === 'tenant_id');
    
    let query: string;
    if (hasTenantId) {
      // Migrate only rows for this tenant
      query = `
        INSERT INTO ${escapedSchema}.${escapedTable}
        SELECT * FROM public.${escapedTable}
        WHERE tenant_id = $1
      `;
    } else {
      // For tables without tenant_id (shouldn't happen for tenant tables)
      console.warn(`[TableMigration] Table ${def.name} has no tenant_id, migrating all rows`);
      query = `
        INSERT INTO ${escapedSchema}.${escapedTable}
        SELECT * FROM public.${escapedTable}
      `;
    }

    const result = await this.pool.query(
      query,
      hasTenantId ? [tenantId] : []
    );
    
    return result.rowCount || 0;
  }

  /**
   * Generate CREATE INDEX DDLs
   */
  private generateIndexDDLs(
    schemaName: string,
    tableName: string,
    indexes: IndexDefinition[]
  ): string[] {
    const escapedSchema = this.escapeIdentifier(schemaName);
    const escapedTable = this.escapeIdentifier(tableName);

    return indexes.map(index => {
      const indexType = index.unique ? 'CREATE UNIQUE INDEX IF NOT EXISTS' : 'CREATE INDEX IF NOT EXISTS';
      const escapedIndexName = this.escapeIdentifier(index.name);
      const columns = index.columns.map(c => this.escapeIdentifier(c)).join(', ');
      
      return `${indexType} ${escapedIndexName} ON ${escapedSchema}.${escapedTable} (${columns});`;
    });
  }

  /**
   * Generate ALTER TABLE ADD FOREIGN KEY DDLs
   */
  private generateForeignKeyDDLs(
    schemaName: string,
    tableName: string,
    foreignKeys: ForeignKeyDefinition[]
  ): string[] {
    const escapedSchema = this.escapeIdentifier(schemaName);
    const escapedTable = this.escapeIdentifier(tableName);

    return foreignKeys.map(fk => {
      const fkName = `${tableName}_${fk.column}_fk`;
      const escapedFkName = this.escapeIdentifier(fkName);
      const escapedColumn = this.escapeIdentifier(fk.column);
      const escapedRefSchema = this.escapeIdentifier(fk.referenceSchema);
      const escapedRefTable = this.escapeIdentifier(fk.referenceTable);
      const escapedRefColumn = this.escapeIdentifier(fk.referenceColumn);
      
      const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
      
      return `
ALTER TABLE ${escapedSchema}.${escapedTable}
ADD CONSTRAINT ${escapedFkName}
FOREIGN KEY (${escapedColumn})
REFERENCES ${escapedRefSchema}.${escapedRefTable}(${escapedRefColumn})${onDelete};
      `.trim();
    });
  }

  /**
   * Escape PostgreSQL identifier to prevent SQL injection
   */
  private escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /**
   * Get table structure from information_schema
   * Handles ARRAY types by checking udt_name (which has _ prefix for arrays)
   */
  async getTableStructure(tableName: string): Promise<TableDefinition | null> {
    // Query to get column information including udt_name for ARRAY detection
    const query = `
      SELECT 
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = $1
      ORDER BY ordinal_position;
    `;

    const result = await this.pool.query(query, [tableName]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const columns: ColumnDefinition[] = result.rows.map(row => ({
      name: row.column_name,
      type: this.mapPostgresType(row.data_type, row.udt_name),
      notNull: row.is_nullable === 'NO',
      default: row.column_default || undefined,
    }));

    // Get primary key
    const pkQuery = `
      SELECT column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position;
    `;
    const pkResult = await this.pool.query(pkQuery, [tableName]);
    const primaryKey = pkResult.rows.length === 1 
      ? pkResult.rows[0].column_name
      : pkResult.rows.map(r => r.column_name);

    return {
      name: tableName,
      columns,
      primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
    };
  }

  /**
   * Map PostgreSQL data type to SQL type string
   * Handles ARRAY types by checking udt_name (which has _ prefix for arrays)
   */
  private mapPostgresType(dataType: string, udtName?: string, arrayElementType?: string): string {
    // Handle ARRAY types - udt_name starts with _ for arrays
    if (udtName && udtName.startsWith('_')) {
      const elementType = udtName.substring(1); // Remove _ prefix
      const baseType = this.mapBasePostgresType(elementType);
      return `${baseType}[]`;
    }

    // Handle regular types
    return this.mapBasePostgresType(dataType);
  }

  /**
   * Map base PostgreSQL data type (non-array)
   */
  private mapBasePostgresType(dataType: string): string {
    const typeMap: Record<string, string> = {
      'character varying': 'VARCHAR',
      'varchar': 'VARCHAR',
      'text': 'TEXT',
      'integer': 'INTEGER',
      'int4': 'INTEGER',
      'bigint': 'BIGINT',
      'int8': 'BIGINT',
      'boolean': 'BOOLEAN',
      'bool': 'BOOLEAN',
      'timestamp without time zone': 'TIMESTAMP',
      'timestamp': 'TIMESTAMP',
      'timestamptz': 'TIMESTAMP WITH TIME ZONE',
      'jsonb': 'JSONB',
      'numeric': 'NUMERIC',
      'decimal': 'DECIMAL',
      'real': 'REAL',
      'float4': 'REAL',
      'double precision': 'DOUBLE PRECISION',
      'float8': 'DOUBLE PRECISION',
      'date': 'DATE',
      'uuid': 'UUID',
      'user-defined': 'TEXT', // Fallback for custom types
    };

    const normalized = dataType.toLowerCase();
    return typeMap[normalized] || dataType.toUpperCase();
  }

  /**
   * Cleanup: Close pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const tableMigrationService = new TableMigrationService();

