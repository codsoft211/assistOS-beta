import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { Pool } from 'pg';

// Create a pool for raw SQL queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const inputSchema = z.object({
  tenantId: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});

type ListCustomTablesInput = z.infer<typeof inputSchema>;

export class ListCustomTablesTool extends ToolBase<ListCustomTablesInput, any> {
  manifest: ToolManifest = {
    name: 'list_custom_tables',
    category: 'discovery',
    description: 'List all custom tables in the tenant schema with their metadata. Filter by category or search by name/description. Use this before modifying or deleting tables.',
    parameters: [
      { name: 'tenantId', type: 'string', description: 'Tenant ID (optional, uses context if not provided)', required: false },
      { name: 'category', type: 'string', description: 'Filter by category (e.g., crm, sales, hr, custom)', required: false },
      { name: 'search', type: 'string', description: 'Search by table name or description', required: false },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: ListCustomTablesInput,
    context: any
  ): Promise<any> {
    const validated = inputSchema.parse(input);
    const tenantId = validated.tenantId || context.tenantId;
    // Default to 'sandbox' to match API behavior
    const environment = context.environment || 'sandbox';

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      return {
        success: false,
        error: `No schema found for tenant ${tenantId}`,
        message: 'Tenant schema must be created before listing tables',
        tables: [],
      };
    }

    // Build query conditions - simple query without is_deleted or is_system_table filters
    const conditions: string[] = [
      'tenant_id = $1',
    ];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (validated.category) {
      conditions.push(`category = $${paramIndex}`);
      values.push(validated.category);
      paramIndex++;
    }

    if (validated.search) {
      conditions.push(`(table_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      values.push(`%${validated.search}%`);
      paramIndex++;
    }

    const metadataTableName = `"${schemaName}"."custom_tables"`;
    
    try {
      // Debug: First get total count without filters
      const debugResult = await pool.query(`
        SELECT COUNT(*) as total FROM ${metadataTableName}
        WHERE tenant_id = $1
      `, [tenantId]);
      const totalInSchema = parseInt(debugResult.rows[0]?.total || '0', 10);
      
      console.log(`[ListCustomTablesTool] Schema: ${schemaName}, TenantId: ${tenantId}, Total records in schema: ${totalInSchema}`);
      console.log(`[ListCustomTablesTool] Query conditions: ${conditions.join(' AND ')}`);
      console.log(`[ListCustomTablesTool] Query values: ${JSON.stringify(values)}`);

      const result = await pool.query(`
        SELECT 
          id,
          table_name as "tableName",
          description,
          category,
          columns,
          is_editable as "isEditable",
          is_system_table as "isSystemTable",
          is_active as "isActive",
          is_deleted as "isDeleted",
          metadata,
          created_by as "createdBy",
          created_at as "createdAt",
          updated_at as "updatedAt",
          environment
        FROM ${metadataTableName}
        WHERE ${conditions.join(' AND ')}
        ORDER BY table_name ASC
      `, values);

      // Parse columns JSON for each table
      const tables = result.rows.map(row => {
        let columns: any[] = [];
        try {
          columns = typeof row.columns === 'string' 
            ? JSON.parse(row.columns) 
            : (row.columns || []);
        } catch (e) {
          columns = [];
        }

        let metadata: any = {};
        try {
          metadata = typeof row.metadata === 'string'
            ? JSON.parse(row.metadata)
            : (row.metadata || {});
        } catch (e) {
          metadata = {};
        }

        return {
          id: row.id,
          tableName: row.tableName,
          description: row.description,
          category: row.category,
          columnCount: columns.length,
          columns: columns.map((c: any) => ({
            name: c.name,
            type: c.type,
            primaryKey: c.primaryKey || false,
            nullable: c.nullable !== false,
          })),
          isEditable: row.isEditable,
          isSystemTable: row.isSystemTable,
          isActive: row.isActive,
          isDeleted: row.isDeleted,
          environment: row.environment,
          metadata,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });

      // Get unique categories for reference
      const categories = Array.from(new Set(tables.map(t => t.category).filter(Boolean)));

      return {
        success: true,
        schemaName,
        tenantId,
        totalTables: tables.length,
        totalInSchema, // Debug: total records in schema for this tenant
        categories,
        tables,
        filters: {
          category: validated.category || null,
          search: validated.search || null,
        },
        debug: {
          conditions: conditions.join(' AND '),
          metadataTableName,
        },
        message: tables.length > 0 
          ? `Found ${tables.length} custom table(s) in schema "${schemaName}"`
          : `No custom tables found in schema "${schemaName}" (${totalInSchema} total records for tenant)`,
      };
    } catch (error: any) {
      // Handle case where custom_tables table doesn't exist yet
      if (error.code === '42P01') {
        return {
          success: true,
          schemaName,
          totalTables: 0,
          categories: [],
          tables: [],
          message: `No custom tables have been created yet in schema "${schemaName}"`,
        };
      }

      return {
        success: false,
        error: 'Failed to list tables',
        message: error.message || 'Database error occurred while listing tables',
        tables: [],
      };
    }
  }
}
