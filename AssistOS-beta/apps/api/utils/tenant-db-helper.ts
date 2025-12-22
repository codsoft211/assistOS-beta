import { sql, SQL } from 'drizzle-orm';
import { db } from '../db';
import { tenantSchemaService } from '../services/tenant-schema.service';

/**
 * Helper to get schema-qualified table reference
 * Returns a SQL identifier for the table in the tenant's schema
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name (e.g., 'company_info', 'clients', etc.)
 * @returns SQL identifier for schema-qualified table
 */
export async function getTenantTableRef(tenantId: string, tableName: string): Promise<SQL> {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) {
    throw new Error(`No schema found for tenant ${tenantId}. Ensure tenant schema is created.`);
  }
  // Use sql.raw() with proper escaping for schema-qualified table name
  return sql.raw(`"${schemaName}"."${tableName}"`);
}

/**
 * Helper for tenant-scoped SELECT queries
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name
 * @param whereClause - Optional WHERE clause as SQL
 * @returns Array of rows
 */
export async function selectFromTenantTable<T = any>(
  tenantId: string,
  tableName: string,
  whereClause?: SQL
): Promise<T[]> {
  const tableRef = await getTenantTableRef(tenantId, tableName);
  let query = sql`SELECT * FROM ${tableRef}`;
  
  if (whereClause) {
    query = sql`${query} WHERE ${whereClause}`;
  }
  
  const result = await db.execute(query);
  return result.rows as T[];
}

/**
 * Helper for tenant-scoped SELECT with LIMIT 1
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name
 * @param whereClause - Optional WHERE clause as SQL
 * @returns Single row or null
 */
export async function selectOneFromTenantTable<T = any>(
  tenantId: string,
  tableName: string,
  whereClause?: SQL
): Promise<T | null> {
  const tableRef = await getTenantTableRef(tenantId, tableName);
  let query = sql`SELECT * FROM ${tableRef}`;
  
  if (whereClause) {
    query = sql`${query} WHERE ${whereClause}`;
  }
  
  query = sql`${query} LIMIT 1`;
  
  const result = await db.execute(query);
  return (result.rows[0] as T) || null;
}

/**
 * Helper for tenant-scoped INSERT queries
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name
 * @param values - Object with column names and values
 * @returns Inserted row
 */
export async function insertIntoTenantTable<T = any>(
  tenantId: string,
  tableName: string,
  values: Record<string, any>
): Promise<T> {
  const tableRef = await getTenantTableRef(tenantId, tableName);
  
  // Build columns and values arrays
  const columns = Object.keys(values).map(col => sql.identifier(col));
  const valuePlaceholders = Object.values(values).map(v => sql`${v}`);
  
  const result = await db.execute(
    sql`INSERT INTO ${tableRef} (${sql.join(columns, sql`, `)}) 
        VALUES (${sql.join(valuePlaceholders, sql`, `)}) 
        RETURNING *`
  );
  
  if (!result.rows || result.rows.length === 0) {
    throw new Error(`Failed to insert into ${tableName} for tenant ${tenantId}`);
  }
  
  return result.rows[0] as T;
}

/**
 * Helper for tenant-scoped UPDATE queries
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name
 * @param values - Object with column names and values to update
 * @param whereClause - WHERE clause as SQL (required to prevent accidental full table updates)
 * @returns Updated row
 */
export async function updateTenantTable<T = any>(
  tenantId: string,
  tableName: string,
  values: Record<string, any>,
  whereClause: SQL
): Promise<T> {
  if (!whereClause) {
    throw new Error('WHERE clause is required for UPDATE operations');
  }
  
  const tableRef = await getTenantTableRef(tenantId, tableName);
  
  // Build SET clause
  // Handle JSONB values: if value is object/array, cast to JSONB
  const setClauses = Object.entries(values).map(([key, val]) => {
    // If value is already a SQL fragment, use it directly
    if (val && typeof val === 'object' && 'sql' in val && 'chunks' in val) {
      return sql`${sql.identifier(key)} = ${val}`;
    }
    // If value is object/array, cast to JSONB for PostgreSQL
    if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      return sql`${sql.identifier(key)} = ${JSON.stringify(val)}::jsonb`;
    }
    // Otherwise use value as-is
    return sql`${sql.identifier(key)} = ${val}`;
  });
  
  const result = await db.execute(
    sql`UPDATE ${tableRef} 
        SET ${sql.join(setClauses, sql`, `)}, updated_at = NOW()
        WHERE ${whereClause}
        RETURNING *`
  );
  
  if (!result.rows || result.rows.length === 0) {
    throw new Error(`No rows updated in ${tableName} for tenant ${tenantId}`);
  }
  
  return result.rows[0] as T;
}

/**
 * Helper for tenant-scoped DELETE queries
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name
 * @param whereClause - WHERE clause as SQL (required to prevent accidental full table deletes)
 * @returns Number of deleted rows
 */
export async function deleteFromTenantTable(
  tenantId: string,
  tableName: string,
  whereClause: SQL
): Promise<number> {
  if (!whereClause) {
    throw new Error('WHERE clause is required for DELETE operations');
  }
  
  const tableRef = await getTenantTableRef(tenantId, tableName);
  
  const result = await db.execute(
    sql`DELETE FROM ${tableRef} WHERE ${whereClause} RETURNING *`
  );
  
  return result.rows?.length || 0;
}

/**
 * Helper for checking if a table exists in tenant schema
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name
 * @returns True if table exists
 */
export async function tenantTableExists(
  tenantId: string,
  tableName: string
): Promise<boolean> {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) {
    return false;
  }
  
  const result = await db.execute(
    sql`SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = ${schemaName} 
      AND table_name = ${tableName}
    ) as exists`
  );
  
  return (result.rows[0] as any)?.exists === true || false;
}

/**
 * Helper for counting rows in tenant table
 * 
 * @param tenantId - The tenant ID
 * @param tableName - The table name
 * @param whereClause - Optional WHERE clause as SQL
 * @returns Number of rows
 */
export async function countTenantTableRows(
  tenantId: string,
  tableName: string,
  whereClause?: SQL
): Promise<number> {
  const tableRef = await getTenantTableRef(tenantId, tableName);
  let query = sql`SELECT COUNT(*) as count FROM ${tableRef}`;
  
  if (whereClause) {
    query = sql`${query} WHERE ${whereClause}`;
  }
  
  const result = await db.execute(query);
  const countValue = (result.rows[0] as any)?.count;
  return parseInt(String(countValue || '0'), 10);
}

