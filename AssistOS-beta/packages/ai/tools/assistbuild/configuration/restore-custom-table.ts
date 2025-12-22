import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { canModifySchema } from '../../../../../apps/api/services/schema-permissions.service';
import { CustomTableSqlService, type ColumnDefinition } from '../../../../../packages/modules/base/custom-table-sql.service';
import { realtimeEvents } from '../../../../../apps/api/services/event-emitter';
import { Pool } from 'pg';

// Create a pool for raw SQL queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const inputSchema = z.object({
  tenantId: z.string().optional(),
  tableId: z.string().optional(),
  tableName: z.string().optional(),
  category: z.string().optional(),
  restoreAll: z.boolean().optional().default(false),
  preview: z.boolean().optional().default(false),
}).refine(
  (data) => data.tableId || data.tableName || data.category || data.restoreAll,
  { message: 'At least one of tableId, tableName, category, or restoreAll must be provided' }
);

type RestoreCustomTableInput = z.infer<typeof inputSchema>;

interface ArchivedTableMetadata {
  id: string;
  tableName: string;
  description: string | null;
  category: string | null;
  columns: any;
  isSystemTable: boolean;
  isEditable: boolean;
}

export class RestoreCustomTableTool extends ToolBase<RestoreCustomTableInput, any> {
  manifest: ToolManifest = {
    name: 'restore_custom_table',
    category: 'configuration',
    description: 'Restore archived custom tables. Archived tables have their SQL dropped but metadata preserved. This tool recreates the SQL table and marks metadata as active. Supports: (1) restore by table ID, (2) restore by table name, (3) restore all tables in a category, (4) restore all archived tables.',
    parameters: [
      { name: 'tenantId', type: 'string', description: 'Tenant ID (optional, uses context if not provided)', required: false },
      { name: 'tableId', type: 'string', description: 'ID of a specific archived table to restore', required: false },
      { name: 'tableName', type: 'string', description: 'Name of a specific archived table to restore', required: false },
      { name: 'category', type: 'string', description: 'Restore all archived tables matching this category (e.g., module ID like "crm", "financial")', required: false },
      { name: 'restoreAll', type: 'boolean', description: 'Restore ALL archived tables', required: false },
      { name: 'preview', type: 'boolean', description: 'Preview only, do not restore', required: false },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: true,
  };

  protected async executeInternal(
    input: RestoreCustomTableInput,
    context: any,
    onProgress?: (progress: number, message: string) => void
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

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      return {
        success: false,
        error: `No schema found for tenant ${tenantId}`,
        message: 'Tenant schema must exist to restore tables',
      };
    }

    onProgress?.(10, 'Finding archived tables to restore...');

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Build the query based on restore mode
    let tablesToRestore: ArchivedTableMetadata[] = [];
    let restoreMode: 'single' | 'category' | 'all' = 'single';

    if (validated.restoreAll) {
      // Mode 4: Restore all archived tables
      restoreMode = 'all';
      const result = await pool.query(`
        SELECT id, table_name as "tableName", description, category, columns, 
               is_system_table as "isSystemTable", is_editable as "isEditable"
        FROM ${metadataTableName}
        WHERE tenant_id = $1 AND (is_active = false OR is_deleted = true)
      `, [tenantId]);
      tablesToRestore = result.rows;

    } else if (validated.category) {
      // Mode 3: Restore all archived tables in category
      restoreMode = 'category';
      const result = await pool.query(`
        SELECT id, table_name as "tableName", description, category, columns, 
               is_system_table as "isSystemTable", is_editable as "isEditable"
        FROM ${metadataTableName}
        WHERE tenant_id = $1 AND category = $2 AND (is_active = false OR is_deleted = true)
      `, [tenantId, validated.category]);
      tablesToRestore = result.rows;

    } else if (validated.tableId) {
      // Mode 1: Restore by table ID
      restoreMode = 'single';
      const result = await pool.query(`
        SELECT id, table_name as "tableName", description, category, columns, 
               is_system_table as "isSystemTable", is_editable as "isEditable"
        FROM ${metadataTableName}
        WHERE id = $1 AND tenant_id = $2 AND (is_active = false OR is_deleted = true)
        LIMIT 1
      `, [validated.tableId, tenantId]);
      tablesToRestore = result.rows;

    } else if (validated.tableName) {
      // Mode 2: Restore by table name
      restoreMode = 'single';
      const result = await pool.query(`
        SELECT id, table_name as "tableName", description, category, columns, 
               is_system_table as "isSystemTable", is_editable as "isEditable"
        FROM ${metadataTableName}
        WHERE table_name = $1 AND tenant_id = $2 AND (is_active = false OR is_deleted = true)
        LIMIT 1
      `, [validated.tableName, tenantId]);
      tablesToRestore = result.rows;
    }

    if (tablesToRestore.length === 0) {
      const modeDescription = restoreMode === 'all' 
        ? 'No archived tables found' 
        : restoreMode === 'category' 
          ? `No archived tables found with category "${validated.category}"`
          : validated.tableId 
            ? `Archived table with ID "${validated.tableId}" not found`
            : `Archived table "${validated.tableName}" not found`;
      
      return {
        success: false,
        error: 'No archived tables found',
        message: `${modeDescription}. Tables must be archived (is_active=false or is_deleted=true) to be restored.`,
        restoreMode,
      };
    }

    onProgress?.(20, `Found ${tablesToRestore.length} archived table(s) to restore...`);

    // Build preview info
    const tableDetails = tablesToRestore.map(table => {
      let columns: any[] = [];
      try {
        columns = typeof table.columns === 'string' 
          ? JSON.parse(table.columns) 
          : (table.columns || []);
      } catch (e) {
        columns = [];
      }

      return {
        id: table.id,
        tableName: table.tableName,
        category: table.category,
        description: table.description,
        columnCount: columns.length,
        isSystemTable: table.isSystemTable,
      };
    });

    if (validated.preview) {
      return {
        success: true,
        preview: true,
        restoreMode,
        category: validated.category || null,
        schemaName,
        tablesCount: tablesToRestore.length,
        tables: tableDetails,
        message: `Preview: ${tablesToRestore.length} table(s) will be restored (SQL tables recreated, metadata marked active)`,
      };
    }

    onProgress?.(30, `Restoring ${tablesToRestore.length} table(s)...`);

    // Execute restoration
    const restoredTables: string[] = [];
    const errors: { tableName: string; error: string }[] = [];
    const progressIncrement = 60 / tablesToRestore.length;
    let currentProgress = 30;

    const sqlService = new CustomTableSqlService(schemaName);

    for (const table of tablesToRestore) {
      try {
        // Parse columns
        let columns: ColumnDefinition[] = [];
        try {
          columns = typeof table.columns === 'string' 
            ? JSON.parse(table.columns) 
            : (table.columns || []);
        } catch (e) {
          throw new Error('Invalid column definitions in metadata');
        }

        if (columns.length === 0) {
          throw new Error('No columns defined - cannot restore SQL table');
        }

        // Validate columns
        const validation = sqlService.validateColumns(columns);
        if (!validation.valid) {
          throw new Error(`Column validation failed: ${validation.errors.join(', ')}`);
        }

        // Check if physical table exists
        const tableExists = await sqlService.tableExists(table.tableName);
        
        let sqlAction: 'created' | 'synced' = 'created';
        if (!tableExists) {
          // Create the SQL table
          await sqlService.createTable(table.tableName, columns);
          sqlAction = 'created';
          console.log(`[RestoreCustomTableTool] Created SQL table "${table.tableName}"`);
        } else {
          // Table exists - sync columns
          await sqlService.alterTable(table.tableName, columns);
          sqlAction = 'synced';
          console.log(`[RestoreCustomTableTool] SQL table "${table.tableName}" already exists, synced columns`);
        }

        // Update metadata to mark as active
        await pool.query(`
          UPDATE ${metadataTableName}
          SET is_active = true, is_deleted = false, updated_at = NOW(), updated_by = $1
          WHERE id = $2
        `, [context.userId, table.id]);

        console.log(`[RestoreCustomTableTool] Restored table "${table.tableName}" (SQL ${sqlAction})`);
        restoredTables.push(table.tableName);
        
        currentProgress += progressIncrement;
        onProgress?.(Math.min(90, currentProgress), `Restored ${table.tableName}`);

      } catch (error: any) {
        console.error(`[RestoreCustomTableTool] Failed to restore "${table.tableName}":`, error.message);
        errors.push({ tableName: table.tableName, error: error.message });
      }
    }

    // Increment schema version
    await tenantSchemaService.incrementSchemaVersion(tenantId);

    // Emit SSE event to trigger frontend cache invalidation
    realtimeEvents.emitForTenant('custom-tables.updated', tenantId, {
      action: 'restored',
      restoredCount: restoredTables.length,
      restoredTables,
    });

    onProgress?.(100, 'Restoration complete');

    return {
      success: errors.length === 0,
      restoreMode,
      category: validated.category || null,
      schemaName,
      restoredCount: restoredTables.length,
      errorCount: errors.length,
      restoredTables,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length === 0
        ? `Successfully restored ${restoredTables.length} table(s)`
        : `Restored ${restoredTables.length} table(s) with ${errors.length} error(s)`,
    };
  }
}

