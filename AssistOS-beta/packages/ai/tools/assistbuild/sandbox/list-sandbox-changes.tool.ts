import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getTenantTableRef } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  tableName: z.string().optional()
});

type ListSandboxChangesInput = z.infer<typeof inputSchema>;

export class ListSandboxChangesTool extends ToolBase<ListSandboxChangesInput, any> {
  manifest: ToolManifest = {
    name: 'list_sandbox_changes',
    category: 'validation',
    description: 'Lists all changes/records created in sandbox environment that can be promoted to production. Shows affected tables, number of new records, and record IDs. Use to see what changed in sandbox before promoting.',
    parameters: [
      { 
        name: 'tableName', 
        type: 'string', 
        description: 'Optional table name to filter (e.g.: "invoices", "customers"). If omitted, lists changes from all tables.', 
        required: false 
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: ListSandboxChangesInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const { tenantId } = context;

      // STRICT allowlist of sandbox-enabled tables (only these support environment isolation)
      const SANDBOX_TABLES = [
        'schemas',
        'tenant_modules',
        'api_integrations',
        'workflows',
        'detected_patterns',
        'code_generations'
      ] as const;

      // Validate tableName if provided
      if (validated.tableName && !SANDBOX_TABLES.includes(validated.tableName as any)) {
        return {
          success: false,
          error: `Table "${validated.tableName}" does not support sandbox. Allowed tables: ${SANDBOX_TABLES.join(', ')}`
        };
      }

      const tablesToQuery = validated.tableName 
        ? [validated.tableName] 
        : SANDBOX_TABLES;

      const changes: any[] = [];

      for (const table of tablesToQuery) {
        try {
          // tenant_modules is in tenant schema, other tables are in public
          const TENANT_SCOPED_TABLES = ['tenant_modules'];
          const tableRef = TENANT_SCOPED_TABLES.includes(table)
            ? await getTenantTableRef(tenantId, table)
            : sql.identifier(table);

          // Count sandbox records
          const sandboxCount = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM ${tableRef}
            WHERE tenant_id = ${tenantId}
            AND environment = 'sandbox'
          `);

          // Count production records with same IDs
          const sandboxIds = await db.execute(sql`
            SELECT id
            FROM ${tableRef}
            WHERE tenant_id = ${tenantId}
            AND environment = 'sandbox'
          `);

          const ids = sandboxIds.rows.map((r: any) => r.id);

          if (ids.length === 0) {
            continue;
          }

          const productionCount = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM ${tableRef}
            WHERE tenant_id = ${tenantId}
            AND environment = 'production'
            AND id = ANY(ARRAY[${sql.join(ids.map(id => sql`${id}`), sql`, `)}])
          `);

          const newRecords = Number(sandboxCount.rows[0]?.count || 0) - Number(productionCount.rows[0]?.count || 0);

          if (newRecords > 0) {
            changes.push({
              tableName: table,
              sandboxRecords: Number(sandboxCount.rows[0]?.count || 0),
              productionRecords: Number(productionCount.rows[0]?.count || 0),
              newRecords,
              recordIds: ids.slice(0, 10), // First 10 IDs
            });
          }
        } catch (error) {
          console.error(`[list_sandbox_changes] Error querying table ${table}:`, error);
          // Skip tables that don't exist or don't have environment column
          continue;
        }
      }

      const totalChanges = changes.reduce((sum, c) => sum + c.newRecords, 0);

      return {
        success: true,
        totalChanges,
        affectedTables: changes.length,
        changes: changes.sort((a, b) => b.newRecords - a.newRecords),
        message: totalChanges > 0
          ? `Found ${totalChanges} changes in ${changes.length} table(s)`
          : 'No changes found in sandbox'
      };
    } catch (error: any) {
      console.error('[list_sandbox_changes] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Validation error',
          details: error.errors,
          suggestion: 'Check the provided parameters'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Error listing sandbox changes',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
