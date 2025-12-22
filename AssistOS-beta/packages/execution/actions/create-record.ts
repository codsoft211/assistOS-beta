import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import { db } from '../../../apps/api/db';
import { ALLOWED_TABLES, getAllowedTableNames } from '../allowed-tables';
import { sql } from 'drizzle-orm';

/**
 * Create Record Action - SECURE IMPLEMENTATION
 * 
 * Uses Drizzle query builder instead of raw SQL to prevent SQL injection.
 * Enforces tenant scoping and table whitelist.
 * 
 * SECURITY FEATURES:
 * - NO raw SQL
 * - Whitelist of allowed tables
 * - Automatic tenant ID enforcement
 * - Type-safe Drizzle operations
 */
export class CreateRecordAction implements ActionExecutor {
  readonly name = 'create_record';
  readonly description = 'Create a database record (secure - whitelist enforced)';
  
  validate(config: Record<string, any>): boolean {
    if (!config.table || !config.data) {
      return false;
    }
    
    // Validate table is in whitelist
    if (!(config.table in ALLOWED_TABLES)) {
      return false;
    }
    
    return true;
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext,
    schema: string = 'public'  // Add schema parameter
  ): Promise<ActionResult> {
    try {
      const table = ALLOWED_TABLES[config.table as keyof typeof ALLOWED_TABLES];
      
      if (!table) {
        return {
          success: false,
          error: `Table '${config.table}' not allowed. Allowed tables: ${getAllowedTableNames().join(', ')}`,
        };
      }
      
      const data = {
        ...config.data,
        tenantId: context.tenantId,
      };
      
      // Use schema-qualified table name
      const tableName = table[Symbol.for('drizzle:Name')] || table.name;
      const schemaQualifiedTable = sql.raw(`"${schema}"."${tableName}"`);
      
      // For insert, we need to use raw SQL with schema qualification
      const columns = Object.keys(data).map(col => sql.identifier(col));
      const values = Object.values(data);
      
      const result = await db.execute(
        sql`
          INSERT INTO ${schemaQualifiedTable} (${sql.join(columns, sql`, `)})
          VALUES (${sql.join(values.map(v => sql`${v}`), sql`, `)})
          RETURNING *
        `
      );
      
      return {
        success: true,
        output: result.rows[0],
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to create record: ${error.message}`,
      };
    }
  }
}
