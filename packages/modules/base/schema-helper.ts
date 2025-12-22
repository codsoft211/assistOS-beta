import { sql } from 'drizzle-orm';
import { db } from '../../../apps/api/db';

/**
 * Get schema-qualified table reference
 */
export function getSchemaQualifiedTable(table: any, schema: string = 'public') {
  // Try to get table name from Drizzle table object
  const tableName = table[Symbol.for('drizzle:Name')] || 
                    table.name || 
                    (table as any)._[Symbol.for('drizzle:Name')];
  
  if (!tableName) {
    throw new Error('Could not determine table name');
  }
  
  return sql.raw(`"${schema}"."${tableName}"`);
}

/**
 * Execute query with schema support
 */
export async function executeWithSchema(
  queryBuilder: any,
  schema: string = 'public'
) {
  // This is a helper that can be used in query builders
  // Implementation depends on how you want to handle schema switching
}
