import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { canModifySchema } from '../../../../../apps/api/services/schema-permissions.service';
import { realtimeEvents } from '../../../../../apps/api/services/event-emitter';
import { Pool } from 'pg';

// Create a pool for raw SQL queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const inputSchema = z.object({
  tenantId: z.string().optional(),
  tableName: z.string().optional(),
  category: z.string().optional(),
  deleteAll: z.boolean().optional().default(false),
  hardDelete: z.boolean().optional().default(true),
  preview: z.boolean().optional().default(false),
}).refine(
  (data) => data.tableName || data.category || data.deleteAll,
  { message: 'At least one of tableName, category, or deleteAll must be provided' }
);

type DeleteCustomTableInput = z.infer<typeof inputSchema>;

interface TableMetadata {
  id: string;
  tableName: string;
  description: string | null;
  category: string | null;
  columns: any;
  isSystemTable: boolean;
  isEditable: boolean;
}

export class DeleteCustomTableTool extends ToolBase<DeleteCustomTableInput, any> {
  manifest: ToolManifest = {
    name: 'delete_custom_table',
    category: 'configuration',
    description: 'Delete custom tables from tenant schema. Supports three modes: (1) delete a single table by name, (2) delete all tables matching a category (e.g., module ID), or (3) delete all custom tables. By default, performs hard delete (drops physical tables and removes metadata). Use hardDelete=false to archive instead. All tables including system/module tables can be deleted or archived.',
    parameters: [
      { name: 'tenantId', type: 'string', description: 'Tenant ID (optional, uses context if not provided)', required: false },
      { name: 'tableName', type: 'string', description: 'Name of a specific table to delete', required: false },
      { name: 'category', type: 'string', description: 'Delete all tables matching this category (e.g., module ID like "crm", "financial")', required: false },
      { name: 'deleteAll', type: 'boolean', description: 'Delete ALL custom tables (WARNING: destructive operation)', required: false },
      { name: 'hardDelete', type: 'boolean', description: 'If true (default), drops physical SQL tables and removes metadata. If false, archives (soft delete) - keeps metadata for restore.', required: false },
      { name: 'preview', type: 'boolean', description: 'Preview only, do not delete', required: false },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: true,
  };

  protected async executeInternal(
    input: DeleteCustomTableInput,
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
        message: 'Tenant schema must exist to delete tables',
      };
    }

    onProgress?.(10, 'Finding tables to delete...');

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Build the query based on deletion mode
    // All tables (including system tables) can be deleted/archived
    let tablesToDelete: TableMetadata[] = [];
    let deletionMode: 'single' | 'category' | 'all' = 'single';

    if (validated.deleteAll) {
      // Mode 3: Delete all tables
      deletionMode = 'all';
      const result = await pool.query(`
        SELECT id, table_name as "tableName", description, category, columns, 
               is_system_table as "isSystemTable", is_editable as "isEditable"
        FROM ${metadataTableName}
        WHERE tenant_id = $1 AND is_deleted = false
      `, [tenantId]);
      tablesToDelete = result.rows;

    } else if (validated.category) {
      // Mode 2: Delete all tables in category
      deletionMode = 'category';
      const result = await pool.query(`
        SELECT id, table_name as "tableName", description, category, columns, 
               is_system_table as "isSystemTable", is_editable as "isEditable"
        FROM ${metadataTableName}
        WHERE tenant_id = $1 AND category = $2 AND is_deleted = false
      `, [tenantId, validated.category]);
      tablesToDelete = result.rows;

    } else if (validated.tableName) {
      // Mode 1: Delete single table
      deletionMode = 'single';
      const result = await pool.query(`
        SELECT id, table_name as "tableName", description, category, columns, 
               is_system_table as "isSystemTable", is_editable as "isEditable"
        FROM ${metadataTableName}
        WHERE tenant_id = $1 AND table_name = $2 AND is_deleted = false
        LIMIT 1
      `, [tenantId, validated.tableName]);
      tablesToDelete = result.rows;
    }

    if (tablesToDelete.length === 0) {
      const modeDescription = deletionMode === 'all' 
        ? 'No custom tables found' 
        : deletionMode === 'category' 
          ? `No tables found with category "${validated.category}"`
          : `Table "${validated.tableName}" not found`;
      
      return {
        success: false,
        error: 'No tables found',
        message: `${modeDescription}. Use list_custom_tables to see available tables.`,
        deletionMode,
      };
    }

    onProgress?.(20, `Found ${tablesToDelete.length} table(s) to process...`);

    // All tables (including system tables) can be deleted/archived
    const deletableTables: TableMetadata[] = tablesToDelete;

    // Check which physical tables exist
    const tableNames = deletableTables.map(t => t.tableName);
    const existingTablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 AND table_name = ANY($2)
    `, [schemaName, tableNames]);
    
    const existingPhysicalTables = new Set(existingTablesResult.rows.map(r => r.table_name));

    // Build preview/actions info
    // Note: Both hard and soft delete DROP the SQL table
    // Hard delete also removes metadata, soft delete keeps metadata for restore
    const tableDetails = deletableTables.map(table => {
      const physicalExists = existingPhysicalTables.has(table.tableName);
      let columns: any[] = [];
      try {
        columns = typeof table.columns === 'string' 
          ? JSON.parse(table.columns) 
          : (table.columns || []);
      } catch (e) {
        columns = [];
      }

      return {
        tableName: table.tableName,
        category: table.category,
        description: table.description,
        columnCount: columns.length,
        physicalTableExists: physicalExists,
        isSystemTable: table.isSystemTable,
        action: validated.hardDelete
          ? physicalExists ? 'DROP_AND_REMOVE_METADATA' : 'REMOVE_METADATA'
          : physicalExists ? 'DROP_AND_ARCHIVE' : 'ARCHIVE_METADATA',
      };
    });

    if (validated.preview) {
      return {
        success: true,
        preview: true,
        deletionMode,
        category: validated.category || null,
        schemaName,
        hardDelete: validated.hardDelete,
        tablesCount: deletableTables.length,
        tables: tableDetails,
        message: `Preview: ${deletableTables.length} table(s) will be ${validated.hardDelete ? 'permanently deleted' : 'archived (soft deleted)'}`,
      };
    }

    onProgress?.(30, `Deleting ${deletableTables.length} table(s)...`);

    // Execute deletion
    const deletedTables: string[] = [];
    const errors: { tableName: string; error: string }[] = [];
    let progressIncrement = 60 / deletableTables.length;
    let currentProgress = 30;

    for (const table of deletableTables) {
      const physicalExists = existingPhysicalTables.has(table.tableName);
      const fullTableName = `"${schemaName}"."${table.tableName}"`;

      try {
        // Always DROP the physical SQL table (for both hard and soft delete)
        // This allows metadata to be preserved for restore capability
        if (physicalExists) {
          await pool.query(`DROP TABLE IF EXISTS ${fullTableName} CASCADE`);
          console.log(`[DeleteCustomTableTool] Dropped physical table "${table.tableName}"`);
        }

        if (validated.hardDelete) {
          // Hard delete: also remove metadata record
          await pool.query(`DELETE FROM ${metadataTableName} WHERE id = $1`, [table.id]);
          console.log(`[DeleteCustomTableTool] Removed metadata record for "${table.tableName}"`);
        } else {
          // Soft delete/Archive: keep metadata for restore capability
          const now = new Date().toISOString();
          await pool.query(`
            UPDATE ${metadataTableName}
            SET is_deleted = true, is_active = false, updated_at = $2
            WHERE id = $1
          `, [table.id, now]);
          console.log(`[DeleteCustomTableTool] Archived metadata record for "${table.tableName}" (SQL dropped, metadata kept for restore)`);
        }

        deletedTables.push(table.tableName);
        currentProgress += progressIncrement;
        onProgress?.(Math.min(90, currentProgress), `${validated.hardDelete ? 'Deleted' : 'Archived'} ${table.tableName}`);

      } catch (error: any) {
        console.error(`[DeleteCustomTableTool] Failed to delete "${table.tableName}":`, error.message);
        errors.push({ tableName: table.tableName, error: error.message });
      }
    }

    // Increment schema version
    await tenantSchemaService.incrementSchemaVersion(tenantId);

    // Emit SSE event to trigger frontend cache invalidation
    realtimeEvents.emitForTenant('custom-tables.updated', tenantId, {
      action: validated.hardDelete ? 'deleted' : 'archived',
      deletedCount: deletedTables.length,
      deletedTables,
    });

    onProgress?.(100, 'Deletion complete');

    return {
      success: errors.length === 0,
      deletionMode,
      category: validated.category || null,
      schemaName,
      hardDelete: validated.hardDelete,
      deletedCount: deletedTables.length,
      errorCount: errors.length,
      deletedTables,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length === 0
        ? `Successfully ${validated.hardDelete ? 'permanently deleted' : 'archived'} ${deletedTables.length} table(s)`
        : `Deleted ${deletedTables.length} table(s) with ${errors.length} error(s)`,
    };
  }
}
