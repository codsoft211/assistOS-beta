import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { canModifySchema } from '../../../../../apps/api/services/schema-permissions.service';
import { realtimeEvents } from '../../../../../apps/api/services/event-emitter';
import { Pool } from 'pg';

// Create a pool for raw SQL queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Normalize type aliases to valid PostgreSQL types
function normalizeColumnType(type: string): { type: string; length?: number } {
  const t = type.toLowerCase().trim();
  
  // Handle varchar(N) pattern
  const varcharMatch = t.match(/^varchar\((\d+)\)$/);
  if (varcharMatch) {
    return { type: 'varchar', length: parseInt(varcharMatch[1]) };
  }
  
  // Handle char(N) pattern
  const charMatch = t.match(/^char\((\d+)\)$/);
  if (charMatch) {
    return { type: 'varchar', length: parseInt(charMatch[1]) };
  }
  
  // Common aliases mapping
  const typeMap: Record<string, string> = {
    'string': 'text',
    'str': 'text',
    'int': 'integer',
    'int4': 'integer',
    'int8': 'bigint',
    'float': 'decimal',
    'double': 'decimal',
    'number': 'decimal',
    'bool': 'boolean',
    'datetime': 'timestamp',
    'time': 'timestamp',
    'json': 'jsonb',
    'serial': 'integer',
    'bigserial': 'bigint',
  };
  
  return { type: typeMap[t] || t };
}

const columnSchema = z.object({
  name: z.string(),
  type: z.string(), // Accept any string, will be normalized
  length: z.number().optional(),
  nullable: z.boolean().optional().default(true),
  unique: z.boolean().optional().default(false),
  isArray: z.boolean().optional().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  primaryKey: z.boolean().optional().default(false),
  foreignKey: z.object({
    table: z.string(),
    column: z.string(),
    onDelete: z.string().optional(), // Accept any string like 'CASCADE', 'SET NULL', etc.
  }).optional(),
});

const inputSchema = z.object({
  tenantId: z.string().optional(),
  tableName: z.string(),
  description: z.string().optional(),
  category: z.string().optional().default('custom'),
  columns: z.array(columnSchema).min(1),
  indexes: z.array(z.object({
    name: z.string(),
    columns: z.array(z.string()),
    unique: z.boolean().optional().default(false),
  })).optional(),
  metadata: z.record(z.any()).optional(),
  preview: z.boolean().optional().default(false),
  // If false, only creates metadata without SQL table (useful for planning)
  syncToDatabase: z.boolean().optional().default(true),
});

type CreateCustomTableInput = z.infer<typeof inputSchema>;

export class CreateCustomTableTool extends ToolBase<CreateCustomTableInput, any> {
  manifest: ToolManifest = {
    name: 'create_custom_table',
    category: 'configuration',
    description: 'Create a new custom table in tenant schema with metadata tracking. Creates both the physical SQL table and metadata record. Use preview=true to see DDL before creating.',
    parameters: [
      { name: 'tenantId', type: 'string', description: 'Tenant ID (optional, uses context if not provided)', required: false },
      { name: 'tableName', type: 'string', description: 'Table name (lowercase, letters/numbers/underscores)', required: true },
      { name: 'description', type: 'string', description: 'Human-readable description of the table purpose', required: false },
      { name: 'category', type: 'string', description: 'Category for organizing tables (e.g., crm, sales, hr, custom)', required: false },
      { 
        name: 'columns', 
        type: 'array', 
        description: 'Column definitions (at least 1 required). Include an "id" UUID primary key column.', 
        required: true,
        items: {
          type: 'object',
          description: 'Column definition',
          properties: {
            name: { type: 'string', description: 'Column name' },
            type: { type: 'string', description: 'Data type: uuid, varchar, text, integer, bigint, decimal, boolean, timestamp, timestamptz, jsonb, date' },
            length: { type: 'number', description: 'Length for varchar' },
            nullable: { type: 'boolean', description: 'Allow NULL values (default: true)' },
            unique: { type: 'boolean', description: 'Unique constraint (default: false)' },
            isArray: { type: 'boolean', description: 'Define as array type (default: false)' },
            default: { type: 'string', description: 'Default value (use gen_random_uuid() for UUID primary keys)' },
            primaryKey: { type: 'boolean', description: 'Primary key' },
            foreignKey: { 
              type: 'object', 
              description: 'Foreign key constraint with table, column, and optional onDelete (CASCADE, SET NULL, RESTRICT, NO ACTION)'
            }
          },
          required: ['name', 'type']
        }
      },
      { 
        name: 'indexes', 
        type: 'array', 
        description: 'Index definitions', 
        required: false,
        items: {
          type: 'object',
          description: 'Index definition',
          properties: {
            name: { type: 'string', description: 'Index name' },
            columns: { 
              type: 'array', 
              description: 'Columns to index',
              items: { type: 'string' }
            },
            unique: { type: 'boolean', description: 'Unique index' }
          },
          required: ['name', 'columns']
        }
      },
      { name: 'metadata', type: 'object', description: 'Additional metadata (key-value pairs)', required: false },
      { name: 'preview', type: 'boolean', description: 'Preview only, do not create', required: false },
      { name: 'syncToDatabase', type: 'boolean', description: 'Create physical SQL table (default: true)', required: false },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: CreateCustomTableInput,
    context: any
  ): Promise<any> {
    // ✅ SECURITY: Verify user has owner/config role
    const permissionCheck = await canModifySchema(context.userId, context.tenantId);
    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: 'Insufficient permissions',
        message: permissionCheck.reason,
        required: ['owner', 'config'],
        current: permissionCheck.role,
      };
    }

    const validated = inputSchema.parse(input);
    const tenantId = validated.tenantId || context.tenantId;
    // Default to 'sandbox' to match API behavior
    const environment = context.environment || 'sandbox';

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      return {
        success: false,
        error: `No schema found for tenant ${tenantId}`,
        message: 'Tenant schema must be created before creating custom tables',
      };
    }

    // Validate table name
    if (!/^[a-z][a-z0-9_]*$/.test(validated.tableName)) {
      return {
        success: false,
        error: 'Invalid table name',
        message: 'Table name must start with a letter and contain only lowercase letters, numbers, and underscores',
      };
    }

    // Check for existing table in metadata (no environment filter)
    const metadataTableName = `"${schemaName}"."custom_tables"`;
    const existingCheck = await pool.query(`
      SELECT id, is_deleted as "isDeleted" FROM ${metadataTableName}
      WHERE tenant_id = $1 AND table_name = $2
      LIMIT 1
    `, [tenantId, validated.tableName]);

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      
      if (!existing.isDeleted) {
        return {
          success: false,
          error: 'Table already exists',
          message: `A table with name "${validated.tableName}" already exists. Use modify_table_structure to update it.`,
        };
      }
      
      // Soft-deleted table exists - hard delete the metadata first
      console.log(`[CreateCustomTableTool] Removing soft-deleted metadata for "${validated.tableName}"`);
      await pool.query(`DELETE FROM ${metadataTableName} WHERE id = $1`, [existing.id]);
    }

    // Helper to normalize a column definition
    const normalizeColumn = (col: any) => {
      const { type: normalizedType, length: extractedLength } = normalizeColumnType(col.type);
      return {
        ...col,
        type: normalizedType,
        length: col.length ?? extractedLength, // Use provided length or extracted from type
      };
    };

    // Normalize all columns
    const normalizedColumns = validated.columns.map(normalizeColumn);

    // Generate DDL
    const ddlStatements: string[] = [];
    
    // CREATE TABLE
    const columnDefs = normalizedColumns.map(col => {
      let def = this.escapeIdentifier(col.name) + ' ' + this.getPostgresType(col);
      
      if (col.primaryKey) {
        def += ' PRIMARY KEY';
      }
      
      if (!col.nullable && !col.primaryKey) {
        def += ' NOT NULL';
      }
      
      if (col.unique && !col.primaryKey) {
        def += ' UNIQUE';
      }
      
      if (col.default !== undefined) {
        def += ' DEFAULT ' + this.formatDefault(col.default);
      }
      
      return def;
    });

    // Add foreign keys as constraints
    const foreignKeys = normalizedColumns
      .filter(col => col.foreignKey)
      .map(col => {
        const fk = col.foreignKey!;
        const onDelete = fk.onDelete || 'RESTRICT';
        return `CONSTRAINT ${this.escapeIdentifier(`fk_${validated.tableName}_${col.name}`)} ` +
               `FOREIGN KEY (${this.escapeIdentifier(col.name)}) ` +
               `REFERENCES ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(fk.table)}(${this.escapeIdentifier(fk.column)}) ` +
               `ON DELETE ${onDelete}`;
      });

    const allDefs = [...columnDefs, ...foreignKeys].join(',\n    ');
    const createTableDDL = `CREATE TABLE IF NOT EXISTS ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(validated.tableName)} (\n    ${allDefs}\n);`;
    ddlStatements.push(createTableDDL);

    // CREATE INDEXES
    if (validated.indexes) {
      for (const indexDef of validated.indexes) {
        const unique = indexDef.unique ? 'UNIQUE ' : '';
        const cols = indexDef.columns.map(c => this.escapeIdentifier(c)).join(', ');
        const createIndexDDL = `CREATE ${unique}INDEX IF NOT EXISTS ${this.escapeIdentifier(indexDef.name)} ` +
                               `ON ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(validated.tableName)} (${cols});`;
        ddlStatements.push(createIndexDDL);
      }
    }

    if (validated.preview) {
      return {
        success: true,
        preview: true,
        tableName: validated.tableName,
        description: validated.description,
        category: validated.category,
        schemaName,
        columns: normalizedColumns,
        indexes: validated.indexes,
        ddl: ddlStatements,
        message: `Preview: Table "${validated.tableName}" will be created with ${normalizedColumns.length} column(s) in schema ${schemaName}`,
      };
    }

    let sqlTableCreated = false;

    // Execute DDL if syncToDatabase is true
    if (validated.syncToDatabase !== false) {
      try {
        await tenantSchemaService.executeInTenantSchema(tenantId, ddlStatements);
        sqlTableCreated = true;
        console.log(`[CreateCustomTableTool] SQL table "${validated.tableName}" created in schema ${schemaName}`);
      } catch (error: any) {
        return {
          success: false,
          error: 'Failed to create SQL table',
          message: error.message || 'Database error occurred while creating the table',
          ddl: ddlStatements,
        };
      }
    }

    // Insert metadata record
    const metadataId = crypto.randomUUID();
    const now = new Date().toISOString();
    const columnsJson = JSON.stringify(normalizedColumns);
    const metadataJson = JSON.stringify(validated.metadata || {});

    try {
      await pool.query(`
        INSERT INTO ${metadataTableName} (
          id, tenant_id, table_name, description, category, columns,
          is_editable, is_system_table, is_active, is_deleted, metadata,
          created_by, created_at, updated_at, environment
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb,
          true, false, true, false, $7::jsonb,
          $8, $9, $9, $10
        )
      `, [
        metadataId,
        tenantId,
        validated.tableName,
        validated.description || '',
        validated.category || 'custom',
        columnsJson,
        metadataJson,
        context.userId,
        now,
        environment,
      ]);
      console.log(`[CreateCustomTableTool] Metadata record created for "${validated.tableName}"`);
    } catch (error: any) {
      // If metadata insert fails but SQL table was created, we should clean up
      if (sqlTableCreated) {
        console.error(`[CreateCustomTableTool] Metadata insert failed, but SQL table was created. Manual cleanup may be needed.`);
      }
      return {
        success: false,
        error: 'Failed to create metadata record',
        message: error.message || 'Database error occurred while creating metadata',
        sqlTableCreated,
      };
    }

    // Increment schema version
    await tenantSchemaService.incrementSchemaVersion(tenantId);

    // Emit SSE event to trigger frontend cache invalidation
    realtimeEvents.emitForTenant('custom-tables.updated', tenantId, {
      action: 'created',
      tableName: validated.tableName,
      category: validated.category || 'custom',
    });

    return {
      success: true,
      tableName: validated.tableName,
      description: validated.description,
      category: validated.category,
      schemaName,
      columns: validated.columns,
      indexes: validated.indexes,
      ddl: ddlStatements,
      metadataId,
      sqlTableCreated,
      message: `Table "${validated.tableName}" created successfully with ${validated.columns.length} column(s) in schema ${schemaName}`,
    };
  }

  private getPostgresType(col: { type: string; length?: number; isArray?: boolean }): string {
    let baseType: string;
    
    switch (col.type) {
      case 'uuid': baseType = 'UUID'; break;
      case 'varchar': baseType = col.length ? `VARCHAR(${col.length})` : 'VARCHAR(255)'; break;
      case 'text': baseType = 'TEXT'; break;
      case 'integer': baseType = 'INTEGER'; break;
      case 'bigint': baseType = 'BIGINT'; break;
      case 'decimal': baseType = 'DECIMAL(19, 4)'; break;
      case 'boolean': baseType = 'BOOLEAN'; break;
      case 'timestamp': baseType = 'TIMESTAMP'; break;
      case 'timestamptz': baseType = 'TIMESTAMPTZ'; break;
      case 'date': baseType = 'DATE'; break;
      case 'jsonb': baseType = 'JSONB'; break;
      default: baseType = 'TEXT';
    }
    
    return col.isArray ? `${baseType}[]` : baseType;
  }

  private formatDefault(value: string | number | boolean): string {
    if (typeof value === 'string') {
      // Check if it's a SQL function/expression
      if (value.includes('(') && value.includes(')')) return value;
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  private escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
}
