/**
 * Custom Table SQL Service
 * Handles actual PostgreSQL DDL operations for custom tables in tenant schemas
 * 
 * This service creates, alters, and drops actual database tables
 * based on the column definitions stored in the custom_tables metadata table.
 */

import { Pool } from "pg";

// Create a pool for raw SQL queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Column definition interface (matches frontend/schema)
 */
export interface ColumnDefinition {
  name: string;
  type: string;
  nullable?: boolean;
  unique?: boolean;
  isArray?: boolean;
  default?: any;
  primaryKey?: boolean;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: string;
  };
}

/**
 * Maps column type strings to PostgreSQL types
 */
const TYPE_MAPPING: Record<string, string> = {
  // Text types
  "text": "TEXT",
  "varchar": "VARCHAR(255)",
  "char": "CHAR(1)",
  
  // Numeric types
  "integer": "INTEGER",
  "bigint": "BIGINT",
  "smallint": "SMALLINT",
  "decimal": "DECIMAL(10,2)",
  "numeric": "NUMERIC",
  "real": "REAL",
  "double": "DOUBLE PRECISION",
  "serial": "SERIAL",
  "bigserial": "BIGSERIAL",
  
  // Boolean
  "boolean": "BOOLEAN",
  
  // Date/Time types
  "date": "DATE",
  "time": "TIME",
  "timestamp": "TIMESTAMP",
  "timestamptz": "TIMESTAMPTZ",
  "interval": "INTERVAL",
  
  // UUID
  "uuid": "UUID",
  
  // JSON types
  "json": "JSON",
  "jsonb": "JSONB",
  
  // Binary
  "bytea": "BYTEA",
  
  // Network types
  "inet": "INET",
  "cidr": "CIDR",
  "macaddr": "MACADDR",
  
  // Geometric types
  "point": "POINT",
  "line": "LINE",
  "polygon": "POLYGON",
  
  // Money
  "money": "MONEY",
};

/**
 * Get PostgreSQL type from column definition
 */
function getPgType(column: ColumnDefinition): string {
  const baseType = TYPE_MAPPING[column.type.toLowerCase()] || column.type.toUpperCase();
  return column.isArray ? `${baseType}[]` : baseType;
}

/**
 * Escape identifier (table/column name) for SQL
 */
function escapeIdentifier(name: string): string {
  // Remove any existing quotes and escape properly
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Generate column definition SQL
 */
function generateColumnSql(column: ColumnDefinition, schemaName: string): string {
  const parts: string[] = [];
  
  // Column name and type
  parts.push(escapeIdentifier(column.name));
  parts.push(getPgType(column));
  
  // Primary key
  if (column.primaryKey) {
    parts.push("PRIMARY KEY");
  }
  
  // Not null constraint
  if (column.nullable === false && !column.primaryKey) {
    parts.push("NOT NULL");
  }
  
  // Unique constraint (if not primary key)
  if (column.unique && !column.primaryKey) {
    parts.push("UNIQUE");
  }
  
  // Default value
  if (column.default !== undefined && column.default !== null && column.default !== "") {
    let defaultValue = String(column.default);
    
    // Clean up PostgreSQL cast syntax if present (e.g., 'EUR'::text -> 'EUR')
    // This handles defaults that were retrieved from information_schema
    if (defaultValue.includes("::")) {
      // Extract the value before the :: cast
      const match = defaultValue.match(/^'([^']*)'::[\w\s]+$/);
      if (match) {
        // It's a string value with cast - use just the string
        defaultValue = match[1];
      } else {
        // It might be a numeric cast like '0'::numeric
        const numMatch = defaultValue.match(/^'([^']*)'::(?:numeric|integer|bigint|decimal|real|double precision)$/i);
        if (numMatch) {
          defaultValue = numMatch[1];
        } else {
          // For other casts, strip the cast and use as-is
          defaultValue = defaultValue.replace(/::[\w\s()]+$/, '');
        }
      }
    }
    
    // Handle special defaults
    if (defaultValue === "gen_random_uuid()" || defaultValue === "uuid_generate_v4()") {
      parts.push("DEFAULT gen_random_uuid()");
    } else if (defaultValue === "NOW()" || defaultValue === "CURRENT_TIMESTAMP" || defaultValue.toLowerCase() === "now()") {
      parts.push("DEFAULT NOW()");
    } else if (defaultValue === "true" || defaultValue === "false") {
      parts.push(`DEFAULT ${defaultValue}`);
    } else if (typeof column.default === "boolean") {
      parts.push(`DEFAULT ${column.default}`);
    } else if (typeof column.default === "number") {
      parts.push(`DEFAULT ${column.default}`);
    } else if (!isNaN(Number(defaultValue)) && defaultValue.trim() !== "") {
      // It's a numeric string - don't quote it
      parts.push(`DEFAULT ${defaultValue}`);
    } else if (typeof defaultValue === "string") {
      // Check if it's a SQL expression (contains parentheses or is a function call)
      if (defaultValue.includes("(") && defaultValue.includes(")")) {
        parts.push(`DEFAULT ${defaultValue}`);
      } else {
        // Regular string value - escape quotes
        parts.push(`DEFAULT '${defaultValue.replace(/'/g, "''")}'`);
      }
    }
  }
  
  return parts.join(" ");
}

/**
 * Generate foreign key constraint SQL
 */
function generateForeignKeySql(
  tableName: string,
  column: ColumnDefinition,
  schemaName: string
): string | null {
  if (!column.foreignKey) return null;
  
  const constraintName = `fk_${tableName}_${column.name}`;
  const refTable = escapeIdentifier(schemaName) + "." + escapeIdentifier(column.foreignKey.table);
  const refColumn = escapeIdentifier(column.foreignKey.column);
  const onDelete = column.foreignKey.onDelete || "NO ACTION";
  
  return `CONSTRAINT ${escapeIdentifier(constraintName)} FOREIGN KEY (${escapeIdentifier(column.name)}) REFERENCES ${refTable}(${refColumn}) ON DELETE ${onDelete}`;
}

export class CustomTableSqlService {
  private schemaName: string;
  
  constructor(schemaName: string) {
    this.schemaName = schemaName;
  }
  
  /**
   * Create a new table in the tenant's schema
   */
  async createTable(tableName: string, columns: ColumnDefinition[]): Promise<void> {
    const fullTableName = `${escapeIdentifier(this.schemaName)}.${escapeIdentifier(tableName)}`;
    
    // Generate column definitions
    const columnDefs: string[] = [];
    const foreignKeys: string[] = [];
    
    for (const column of columns) {
      columnDefs.push(generateColumnSql(column, this.schemaName));
      
      const fkSql = generateForeignKeySql(tableName, column, this.schemaName);
      if (fkSql) {
        foreignKeys.push(fkSql);
      }
    }
    
    // Combine columns and foreign keys
    const allDefs = [...columnDefs, ...foreignKeys];
    
    const sql = `
      CREATE TABLE IF NOT EXISTS ${fullTableName} (
        ${allDefs.join(",\n        ")}
      )
    `;
    
    console.log(`[CustomTableSqlService] Creating table: ${fullTableName}`);
    console.log(`[CustomTableSqlService] SQL: ${sql}`);
    
    await pool.query(sql);
    
    // Create indexes for unique columns (if not handled by UNIQUE constraint)
    for (const column of columns) {
      if (column.unique && !column.primaryKey) {
        const indexName = `idx_${tableName}_${column.name}_unique`;
        const indexSql = `
          CREATE UNIQUE INDEX IF NOT EXISTS ${escapeIdentifier(indexName)}
          ON ${fullTableName} (${escapeIdentifier(column.name)})
        `;
        await pool.query(indexSql);
      }
    }
    
    console.log(`[CustomTableSqlService] Table ${fullTableName} created successfully`);
  }
  
  /**
   * Alter an existing table to match new column definitions
   * This handles adding new columns, modifying existing columns, and dropping removed columns
   */
  async alterTable(
    tableName: string,
    newColumns: ColumnDefinition[],
    existingColumns?: ColumnDefinition[]
  ): Promise<void> {
    const fullTableName = `${escapeIdentifier(this.schemaName)}.${escapeIdentifier(tableName)}`;
    
    // Get current table structure from database
    const currentColumnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [this.schemaName, tableName]);
    
    const currentColumnNames = new Set(currentColumnsResult.rows.map(r => r.column_name));
    const newColumnNames = new Set(newColumns.map(c => c.name));
    
    // Add new columns
    for (const column of newColumns) {
      if (!currentColumnNames.has(column.name)) {
        const columnSql = generateColumnSql(column, this.schemaName);
        const alterSql = `ALTER TABLE ${fullTableName} ADD COLUMN ${columnSql}`;
        console.log(`[CustomTableSqlService] Adding column: ${alterSql}`);
        await pool.query(alterSql);
        
        // Add foreign key if specified
        const fkSql = generateForeignKeySql(tableName, column, this.schemaName);
        if (fkSql) {
          const addFkSql = `ALTER TABLE ${fullTableName} ADD ${fkSql}`;
          await pool.query(addFkSql);
        }
      }
    }
    
    // Modify existing columns (limited - PostgreSQL has restrictions)
    for (const column of newColumns) {
      if (currentColumnNames.has(column.name)) {
        const currentCol = currentColumnsResult.rows.find(r => r.column_name === column.name);
        
        // Change nullable constraint
        if (currentCol) {
          const isCurrentlyNullable = currentCol.is_nullable === "YES";
          const shouldBeNullable = column.nullable !== false;
          
          if (isCurrentlyNullable && !shouldBeNullable) {
            await pool.query(`ALTER TABLE ${fullTableName} ALTER COLUMN ${escapeIdentifier(column.name)} SET NOT NULL`);
          } else if (!isCurrentlyNullable && shouldBeNullable && !column.primaryKey) {
            await pool.query(`ALTER TABLE ${fullTableName} ALTER COLUMN ${escapeIdentifier(column.name)} DROP NOT NULL`);
          }
          
          // Change default value
          if (column.default !== undefined) {
            if (column.default === null || column.default === "") {
              await pool.query(`ALTER TABLE ${fullTableName} ALTER COLUMN ${escapeIdentifier(column.name)} DROP DEFAULT`);
            } else {
              let defaultValue = column.default;
              if (typeof defaultValue === "string" && !defaultValue.includes("(")) {
                defaultValue = `'${defaultValue.replace(/'/g, "''")}'`;
              }
              await pool.query(`ALTER TABLE ${fullTableName} ALTER COLUMN ${escapeIdentifier(column.name)} SET DEFAULT ${defaultValue}`);
            }
          }
        }
      }
    }
    
    // Note: Dropping columns is dangerous and not done automatically
    // Columns that are removed from the definition are kept in the database
    // to prevent data loss. Manual cleanup can be done if needed.
    
    console.log(`[CustomTableSqlService] Table ${fullTableName} altered successfully`);
  }
  
  /**
   * Drop a table from the tenant's schema
   * @param hardDelete If true, drops the table. If false, just renames it with _deleted suffix
   */
  /**
   * Drop a table from the schema
   * Always drops the physical SQL table - metadata retention is handled separately
   * @param tableName - Name of the table to drop
   */
  async dropTable(tableName: string): Promise<void> {
    const fullTableName = `${escapeIdentifier(this.schemaName)}.${escapeIdentifier(tableName)}`;
    
    const sql = `DROP TABLE IF EXISTS ${fullTableName} CASCADE`;
    console.log(`[CustomTableSqlService] Dropping table: ${fullTableName}`);
    await pool.query(sql);
    
    console.log(`[CustomTableSqlService] Table ${tableName} dropped successfully`);
  }
  
  /**
   * Check if a table exists in the schema
   */
  async tableExists(tableName: string): Promise<boolean> {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      ) as exists
    `, [this.schemaName, tableName]);
    
    return result.rows[0]?.exists || false;
  }
  
  /**
   * Get the current structure of a table
   */
  async getTableStructure(tableName: string): Promise<ColumnDefinition[]> {
    const result = await pool.query(`
      SELECT 
        c.column_name as name,
        c.data_type as type,
        c.is_nullable = 'YES' as nullable,
        c.column_default as "default",
        COALESCE(
          (SELECT true FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu 
           ON tc.constraint_name = kcu.constraint_name
           WHERE tc.table_schema = $1 
           AND tc.table_name = $2 
           AND tc.constraint_type = 'PRIMARY KEY'
           AND kcu.column_name = c.column_name
           LIMIT 1), false
        ) as "primaryKey",
        COALESCE(
          (SELECT true FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu 
           ON tc.constraint_name = kcu.constraint_name
           WHERE tc.table_schema = $1 
           AND tc.table_name = $2 
           AND tc.constraint_type = 'UNIQUE'
           AND kcu.column_name = c.column_name
           LIMIT 1), false
        ) as "unique"
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `, [this.schemaName, tableName]);
    
    return result.rows.map(row => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable,
      default: row.default,
      primaryKey: row.primaryKey,
      unique: row.unique,
    }));
  }
  
  /**
   * Validate column definitions before creating/altering table
   */
  validateColumns(columns: ColumnDefinition[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const columnNames = new Set<string>();
    
    // Check for required columns
    if (!columns || columns.length === 0) {
      errors.push("At least one column is required");
      return { valid: false, errors };
    }
    
    // Check for primary key
    const hasPrimaryKey = columns.some(c => c.primaryKey);
    if (!hasPrimaryKey) {
      errors.push("Table must have a primary key column");
    }
    
    for (const column of columns) {
      // Check for duplicate names
      if (columnNames.has(column.name.toLowerCase())) {
        errors.push(`Duplicate column name: ${column.name}`);
      }
      columnNames.add(column.name.toLowerCase());
      
      // Check for valid name
      if (!column.name || !/^[a-z][a-z0-9_]*$/i.test(column.name)) {
        errors.push(`Invalid column name: ${column.name}. Must start with a letter and contain only letters, numbers, and underscores.`);
      }
      
      // Check for reserved words
      const reservedWords = ["select", "from", "where", "table", "column", "index", "constraint"];
      if (reservedWords.includes(column.name.toLowerCase())) {
        errors.push(`Column name "${column.name}" is a reserved SQL keyword`);
      }
      
      // Check for valid type
      if (!column.type) {
        errors.push(`Column "${column.name}" must have a type`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}

/**
 * Helper function to create a CustomTableSqlService for a tenant
 */
export async function createCustomTableSqlService(
  tenantId: string,
  getTenantSchemaName: (tenantId: string) => Promise<string | null>
): Promise<CustomTableSqlService | null> {
  const schemaName = await getTenantSchemaName(tenantId);
  if (!schemaName) return null;
  return new CustomTableSqlService(schemaName);
}
