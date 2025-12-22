import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { canModifySchema } from '../../../../../apps/api/services/schema-permissions.service';
import { CustomTableSqlService, ColumnDefinition } from '../../../../../packages/modules/base/custom-table-sql.service';
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
  nullable: z.boolean().optional(),
  unique: z.boolean().optional(),
  isArray: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  primaryKey: z.boolean().optional(),
  foreignKey: z.object({
    table: z.string(),
    column: z.string(),
    onDelete: z.string().optional(), // Accept any string like 'CASCADE', 'SET NULL', etc.
  }).optional(),
});

const inputSchema = z.object({
  tenantId: z.string().optional(),
  tableName: z.string(),
  newTableName: z.string().optional(), // For renaming the table itself
  description: z.string().optional(),
  category: z.string().optional(),
  // Option 1: Pass complete columns array (like API) - recommended for adding multiple columns
  columns: z.array(columnSchema).optional(),
  // Option 2: Pass individual changes (for granular control)
  changes: z.object({
    addColumns: z.array(columnSchema).optional(),
    renameColumns: z.array(z.object({
      old: z.string(),
      new: z.string(),
    })).optional(),
    dropColumns: z.array(z.string()).optional(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
  preview: z.boolean().optional().default(false),
  syncToDatabase: z.boolean().optional().default(true),
});

type ModifyTableStructureInput = z.infer<typeof inputSchema>;

export class ModifyTableStructureTool extends ToolBase<ModifyTableStructureInput, any> {
  manifest: ToolManifest = {
    name: 'modify_table_structure',
    category: 'configuration',
    description: 'ALWAYS use this tool to modify existing tables. Supports: renaming tables, adding columns, updating description/category. Pass "columns" array with all columns (including existing + new ones) to add multiple columns at once. Updates both physical SQL table and metadata.',
    parameters: [
      { name: 'tenantId', type: 'string', description: 'Tenant ID (optional, uses context if not provided)', required: false },
      { name: 'tableName', type: 'string', description: 'Current table name to modify', required: true },
      { name: 'newTableName', type: 'string', description: 'New table name (for renaming the table)', required: false },
      { name: 'description', type: 'string', description: 'Update table description', required: false },
      { name: 'category', type: 'string', description: 'Update table category', required: false },
      { 
        name: 'columns', 
        type: 'array', 
        description: 'Complete columns array (existing + new columns). Use this to add multiple columns. The service will detect new columns and add them.', 
        required: false,
      },
      { 
        name: 'changes', 
        type: 'object', 
        description: 'Individual changes: { addColumns?: [...], renameColumns?: [{old, new}], dropColumns?: [string] }', 
        required: false,
      },
      { name: 'metadata', type: 'object', description: 'Update additional metadata', required: false },
      { name: 'preview', type: 'boolean', description: 'Preview only, do not apply', required: false },
      { name: 'syncToDatabase', type: 'boolean', description: 'Apply changes to physical SQL table (default: true)', required: false },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: ModifyTableStructureInput,
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

    // Log raw input for debugging
    console.log(`[ModifyTableStructureTool] Raw input received:`, JSON.stringify(input, null, 2));
    
    const validated = inputSchema.parse(input);
    const tenantId = validated.tenantId || context.tenantId;

    // Log parsed input
    console.log(`[ModifyTableStructureTool] Validated input:`, JSON.stringify(validated, null, 2));

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      return {
        success: false,
        error: `No schema found for tenant ${tenantId}`,
        message: 'Tenant schema must be created before modifying tables',
      };
    }

    // Get existing metadata
    const metadataTableName = `"${schemaName}"."custom_tables"`;
    const existingResult = await pool.query(`
      SELECT id, table_name as "tableName", columns, description, category, metadata, 
             is_editable as "isEditable", is_system_table as "isSystemTable"
      FROM ${metadataTableName}
      WHERE tenant_id = $1 AND table_name = $2
      LIMIT 1
    `, [tenantId, validated.tableName]);

    const existingMetadata = existingResult.rows[0];
    
    if (!existingMetadata) {
      return {
        success: false,
        error: 'Table not found',
        message: `Table "${validated.tableName}" not found in metadata. Use create_custom_table to create it first, or use list_custom_tables to see available tables.`,
      };
    }

    if (!existingMetadata.isEditable || existingMetadata.isSystemTable) {
      return {
        success: false,
        error: 'Table is not editable',
        message: `Table "${validated.tableName}" is marked as not editable or is a system table.`,
      };
    }

    // Parse existing columns
    let existingColumns: ColumnDefinition[] = [];
    try {
      existingColumns = typeof existingMetadata.columns === 'string' 
        ? JSON.parse(existingMetadata.columns) 
        : (existingMetadata.columns || []);
    } catch (e) {
      existingColumns = [];
    }

    // Determine final columns
    let finalColumns: ColumnDefinition[] = [...existingColumns];
    let tableRenamed = false;
    let currentTableName = validated.tableName;

    // Handle table rename
    if (validated.newTableName && validated.newTableName !== validated.tableName) {
      if (!/^[a-z][a-z0-9_]*$/.test(validated.newTableName)) {
        return {
          success: false,
          error: 'Invalid new table name',
          message: 'New table name must start with a letter and contain only lowercase letters, numbers, and underscores',
        };
      }

      // Check if new table name already exists
      const existingNewName = await pool.query(`
        SELECT id FROM ${metadataTableName}
        WHERE tenant_id = $1 AND table_name = $2
        LIMIT 1
      `, [tenantId, validated.newTableName]);

      if (existingNewName.rows.length > 0) {
        return {
          success: false,
          error: 'Table name already exists',
          message: `A table with name "${validated.newTableName}" already exists`,
        };
      }

      tableRenamed = true;
    }

    // Helper to normalize a column definition
    const normalizeColumn = (col: any): ColumnDefinition => {
      const { type: normalizedType, length: extractedLength } = normalizeColumnType(col.type);
      return {
        ...col,
        type: normalizedType,
        length: col.length ?? extractedLength, // Use provided length or extracted from type
      } as ColumnDefinition;
    };

    // Option 1: Complete columns array provided (preferred for adding multiple columns)
    if (validated.columns && validated.columns.length > 0) {
      finalColumns = validated.columns.map(normalizeColumn);
      console.log(`[ModifyTableStructureTool] Using complete columns array with ${finalColumns.length} columns`);
    }
    // Option 2: Individual changes provided
    else if (validated.changes) {
      // Add columns
      if (validated.changes.addColumns && validated.changes.addColumns.length > 0) {
        for (const col of validated.changes.addColumns) {
          const normalizedCol = normalizeColumn(col);
          if (finalColumns.some(c => c.name.toLowerCase() === normalizedCol.name.toLowerCase())) {
            return {
              success: false,
              error: 'Column already exists',
              message: `Column "${normalizedCol.name}" already exists in table "${validated.tableName}"`,
            };
          }
          finalColumns.push(normalizedCol);
        }
        console.log(`[ModifyTableStructureTool] Adding ${validated.changes.addColumns.length} column(s)`);
      }

      // Rename columns (update in finalColumns)
      if (validated.changes.renameColumns && validated.changes.renameColumns.length > 0) {
        for (const rename of validated.changes.renameColumns) {
          const colIndex = finalColumns.findIndex(c => c.name.toLowerCase() === rename.old.toLowerCase());
          if (colIndex !== -1) {
            finalColumns[colIndex] = { ...finalColumns[colIndex], name: rename.new };
          }
        }
        console.log(`[ModifyTableStructureTool] Renaming ${validated.changes.renameColumns.length} column(s)`);
      }

      // Drop columns
      if (validated.changes.dropColumns && validated.changes.dropColumns.length > 0) {
        for (const colName of validated.changes.dropColumns) {
          const col = finalColumns.find(c => c.name.toLowerCase() === colName.toLowerCase());
          if (col?.primaryKey) {
            return {
              success: false,
              error: 'Cannot drop primary key',
              message: `Cannot drop primary key column "${colName}"`,
            };
          }
          finalColumns = finalColumns.filter(c => c.name.toLowerCase() !== colName.toLowerCase());
        }
        console.log(`[ModifyTableStructureTool] Dropping ${validated.changes.dropColumns.length} column(s)`);
      }
    }

    // Check if we have any changes
    const hasColumnChanges = JSON.stringify(finalColumns) !== JSON.stringify(existingColumns);
    const hasMetadataChanges = validated.description !== undefined || 
                               validated.category !== undefined || 
                               validated.metadata !== undefined ||
                               tableRenamed;

    if (!hasColumnChanges && !hasMetadataChanges) {
      return {
        success: false,
        error: 'No changes specified',
        message: 'At least one change must be specified (columns, changes, newTableName, description, category, or metadata)',
      };
    }

    if (validated.preview) {
      return {
        success: true,
        preview: true,
        tableName: validated.tableName,
        newTableName: validated.newTableName,
        schemaName,
        existingColumns,
        finalColumns,
        changes: validated.changes,
        metadataChanges: {
          newTableName: validated.newTableName,
          description: validated.description,
          category: validated.category,
          metadata: validated.metadata,
        },
        message: `Preview: Table "${validated.tableName}" will be modified. ${hasColumnChanges ? 'Columns will be updated.' : ''} ${tableRenamed ? `Table will be renamed to "${validated.newTableName}".` : ''}`,
      };
    }

    let sqlTableAltered = false;
    const sqlService = new CustomTableSqlService(schemaName);

    // Execute SQL changes if syncToDatabase is true
    if (validated.syncToDatabase !== false) {
      try {
        // Rename table first if needed
        if (tableRenamed && validated.newTableName) {
          const renameSQL = `ALTER TABLE "${schemaName}"."${validated.tableName}" RENAME TO "${validated.newTableName}"`;
          console.log(`[ModifyTableStructureTool] Renaming table: ${renameSQL}`);
          await pool.query(renameSQL);
          currentTableName = validated.newTableName;
        }

        // Check if physical table exists
        const tableExists = await sqlService.tableExists(currentTableName);

        if (hasColumnChanges) {
          if (tableExists) {
            // Validate columns
            const validation = sqlService.validateColumns(finalColumns);
            if (!validation.valid) {
              return {
                success: false,
                error: 'Column validation failed',
                message: validation.errors.join(', '),
              };
            }

            // Alter existing table using the service (like API does)
            await sqlService.alterTable(currentTableName, finalColumns, existingColumns);
            sqlTableAltered = true;
            console.log(`[ModifyTableStructureTool] SQL table "${currentTableName}" altered in schema ${schemaName}`);
          } else if (finalColumns.length > 0) {
            // Create table if it doesn't exist
            await sqlService.createTable(currentTableName, finalColumns);
            sqlTableAltered = true;
            console.log(`[ModifyTableStructureTool] SQL table "${currentTableName}" created in schema ${schemaName} (was missing)`);
          }
        }
      } catch (error: any) {
        console.error(`[ModifyTableStructureTool] SQL operation failed:`, error);
        return {
          success: false,
          error: 'Failed to modify SQL table',
          message: error.message || 'Database error occurred while modifying the table',
          errorDetails: error.detail || error.hint || null,
        };
      }
    }

    // Update metadata record
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Update table_name if renamed
    if (tableRenamed && validated.newTableName) {
      setClauses.push(`table_name = $${paramIndex++}`);
      params.push(validated.newTableName);
    }

    // Update columns
    if (hasColumnChanges) {
      setClauses.push(`columns = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(finalColumns));
    }

    if (validated.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(validated.description);
    }

    if (validated.category !== undefined) {
      setClauses.push(`category = $${paramIndex++}`);
      params.push(validated.category);
    }

    if (validated.metadata !== undefined) {
      // Merge with existing metadata
      const existingMeta = typeof existingMetadata.metadata === 'string'
        ? JSON.parse(existingMetadata.metadata || '{}')
        : (existingMetadata.metadata || {});
      const mergedMetadata = { ...existingMeta, ...validated.metadata };
      setClauses.push(`metadata = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(mergedMetadata));
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(existingMetadata.id);

    try {
      await pool.query(`
        UPDATE ${metadataTableName}
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
      `, params);
      console.log(`[ModifyTableStructureTool] Metadata updated for "${currentTableName}"`);
    } catch (error: any) {
      return {
        success: false,
        error: 'Failed to update metadata',
        message: error.message || 'Database error occurred while updating metadata',
        sqlTableAltered,
      };
    }

    // Increment schema version
    await tenantSchemaService.incrementSchemaVersion(tenantId);

    return {
      success: true,
      tableName: tableRenamed ? validated.newTableName : validated.tableName,
      previousTableName: tableRenamed ? validated.tableName : undefined,
      tableRenamed,
      schemaName,
      columns: finalColumns,
      sqlTableAltered,
      metadataUpdated: true,
      message: tableRenamed
        ? `Table renamed from "${validated.tableName}" to "${validated.newTableName}" and modified successfully.`
        : `Table "${validated.tableName}" modified successfully.`,
    };
  }
}
