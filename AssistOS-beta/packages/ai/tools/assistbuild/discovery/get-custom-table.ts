import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { Pool } from 'pg';

// Create a pool for raw SQL queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const inputSchema = z.object({
  tenantId: z.string().optional(),
  tableName: z.string(),
  includeActualSchema: z.boolean().optional().default(true),
  includeSampleData: z.boolean().optional().default(false),
  sampleLimit: z.number().optional().default(5),
});

type GetCustomTableInput = z.infer<typeof inputSchema>;

export class GetCustomTableTool extends ToolBase<GetCustomTableInput, any> {
  manifest: ToolManifest = {
    name: 'get_custom_table',
    category: 'discovery',
    description: 'Get detailed information about a specific custom table, including metadata and actual database schema. Use this to understand table structure before modifications.',
    parameters: [
      { name: 'tenantId', type: 'string', description: 'Tenant ID (optional, uses context if not provided)', required: false },
      { name: 'tableName', type: 'string', description: 'Name of the table to inspect', required: true },
      { name: 'includeActualSchema', type: 'boolean', description: 'Include actual PostgreSQL schema info (default: true)', required: false },
      { name: 'includeSampleData', type: 'boolean', description: 'Include sample rows from the table (default: false)', required: false },
      { name: 'sampleLimit', type: 'number', description: 'Number of sample rows to include (default: 5)', required: false },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: GetCustomTableInput,
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
        message: 'Tenant schema must be created before inspecting tables',
      };
    }

    // Get metadata
    const metadataTableName = `"${schemaName}"."custom_tables"`;
    
    let metadataResult;
    try {
      metadataResult = await pool.query(`
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
          updated_at as "updatedAt"
        FROM ${metadataTableName}
        WHERE tenant_id = $1 AND table_name = $2 AND is_deleted = false
        LIMIT 1
      `, [tenantId, validated.tableName]);
    } catch (error: any) {
      // Handle case where custom_tables doesn't exist
      if (error.code === '42P01') {
        return {
          success: false,
          error: 'Table not found',
          message: `No metadata found for table "${validated.tableName}". The custom_tables registry may not exist yet.`,
        };
      }
      throw error;
    }

    const metadata = metadataResult.rows[0];
    
    if (!metadata) {
      return {
        success: false,
        error: 'Table not found',
        message: `Table "${validated.tableName}" not found in metadata. Use list_custom_tables to see available tables.`,
      };
    }

    // Parse columns from metadata
    let metadataColumns: any[] = [];
    try {
      metadataColumns = typeof metadata.columns === 'string' 
        ? JSON.parse(metadata.columns) 
        : (metadata.columns || []);
    } catch (e) {
      metadataColumns = [];
    }

    // Parse additional metadata
    let additionalMetadata: any = {};
    try {
      additionalMetadata = typeof metadata.metadata === 'string'
        ? JSON.parse(metadata.metadata)
        : (metadata.metadata || {});
    } catch (e) {
      additionalMetadata = {};
    }

    // Check if physical table exists
    const tableExistsResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      ) as exists
    `, [schemaName, validated.tableName]);
    
    const physicalTableExists = tableExistsResult.rows[0]?.exists || false;

    const response: any = {
      success: true,
      schemaName,
      tableName: validated.tableName,
      description: metadata.description,
      category: metadata.category,
      isEditable: metadata.isEditable,
      isSystemTable: metadata.isSystemTable,
      isActive: metadata.isActive,
      isDeleted: metadata.isDeleted,
      physicalTableExists,
      metadata: additionalMetadata,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      metadataColumns,
    };

    // Get actual PostgreSQL schema if requested and table exists
    if (validated.includeActualSchema && physicalTableExists) {
      const actualColumnsResult = await pool.query(`
        SELECT 
          c.column_name as name,
          c.data_type as type,
          c.is_nullable = 'YES' as nullable,
          c.column_default as "default",
          c.character_maximum_length as "maxLength",
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
      `, [schemaName, validated.tableName]);

      response.actualColumns = actualColumnsResult.rows;

      // Get foreign key constraints
      const fkResult = await pool.query(`
        SELECT
          kcu.column_name as "columnName",
          ccu.table_name as "referencedTable",
          ccu.column_name as "referencedColumn",
          rc.delete_rule as "onDelete"
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = $1 
          AND tc.table_name = $2 
          AND tc.constraint_type = 'FOREIGN KEY'
      `, [schemaName, validated.tableName]);

      if (fkResult.rows.length > 0) {
        response.foreignKeys = fkResult.rows;
      }

      // Get indexes
      const indexResult = await pool.query(`
        SELECT
          i.relname as "indexName",
          array_agg(a.attname ORDER BY x.n) as columns,
          ix.indisunique as "isUnique",
          ix.indisprimary as "isPrimary"
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
        WHERE n.nspname = $1 AND t.relname = $2
        GROUP BY i.relname, ix.indisunique, ix.indisprimary
      `, [schemaName, validated.tableName]);

      if (indexResult.rows.length > 0) {
        response.indexes = indexResult.rows;
      }

      // Compare metadata columns with actual columns
      const metadataColumnNames = new Set(metadataColumns.map((c: any) => c.name.toLowerCase()));
      const actualColumnNames = new Set(response.actualColumns.map((c: any) => c.name.toLowerCase()));

      const missingInDb = metadataColumns
        .filter((c: any) => !actualColumnNames.has(c.name.toLowerCase()))
        .map((c: any) => c.name);
      const missingInMetadata = response.actualColumns
        .filter((c: any) => !metadataColumnNames.has(c.name.toLowerCase()))
        .map((c: any) => c.name);

      if (missingInDb.length > 0 || missingInMetadata.length > 0) {
        response.schemaMismatch = {
          missingInDatabase: missingInDb,
          missingInMetadata: missingInMetadata,
          message: 'The metadata and actual database schema are out of sync. Consider using modify_table_structure to fix.',
        };
      }

      // Get row count
      try {
        const countResult = await pool.query(
          `SELECT COUNT(*) as count FROM "${schemaName}"."${validated.tableName}"`
        );
        response.rowCount = parseInt(countResult.rows[0].count, 10);
      } catch (e) {
        response.rowCount = null;
      }
    }

    // Include sample data if requested
    if (validated.includeSampleData && physicalTableExists) {
      try {
        const sampleResult = await pool.query(
          `SELECT * FROM "${schemaName}"."${validated.tableName}" LIMIT $1`,
          [validated.sampleLimit]
        );
        response.sampleData = sampleResult.rows;
      } catch (e: any) {
        response.sampleData = [];
        response.sampleDataError = e.message;
      }
    }

    response.message = `Table "${validated.tableName}" details retrieved successfully`;

    return response;
  }
}
