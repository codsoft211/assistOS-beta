import { eq, and, type SQL } from 'drizzle-orm';
import type { Environment } from '@shared/types/environment';
import { validateEnvironment } from '@shared/types/environment';

/**
 * Environment Query Utilities
 * 
 * Standardized helpers for environment-scoped database queries.
 * These utilities ensure proper environment isolation across all services.
 * 
 * @module apps/api/utils/environment-query.utils
 */

/**
 * Create environment filter condition for queries
 * 
 * @param table - Drizzle table with environment column
 * @param environment - Environment to filter by
 * @returns SQL condition for WHERE clause
 * 
 * @example
 * ```typescript
 * const clients = await db
 *   .select()
 *   .from(clientsTable)
 *   .where(environmentFilter(clientsTable, ENVIRONMENTS.PRODUCTION));
 * ```
 */
export function environmentFilter<T extends { environment: any }>(
  table: T,
  environment: Environment
): SQL {
  validateEnvironment(environment);
  return eq(table.environment, environment);
}

/**
 * Create combined tenant + environment filter
 * 
 * This is the most commonly used filter for multi-tenant environment-scoped queries.
 * 
 * @param table - Drizzle table with tenantId and environment columns
 * @param tenantId - Tenant ID
 * @param environment - Environment
 * @returns Combined SQL condition
 * 
 * @example
 * ```typescript
 * const invoices = await db
 *   .select()
 *   .from(invoicesTable)
 *   .where(scopedFilter(invoicesTable, tenantId, environment));
 * ```
 */
export function scopedFilter<T extends { tenantId: any; environment: any }>(
  table: T,
  tenantId: string,
  environment: Environment
): SQL {
  validateEnvironment(environment);
  return and(
    eq(table.tenantId, tenantId),
    eq(table.environment, environment)
  )!;
}

/**
 * Validate foreign key reference exists in same environment
 * 
 * Use this before creating records with foreign key references to ensure
 * cross-environment FK violations don't occur.
 * 
 * @param db - Drizzle database instance
 * @param table - Foreign table to check
 * @param id - Foreign key ID
 * @param tenantId - Tenant ID
 * @param environment - Environment
 * @returns true if FK exists in same environment, false otherwise
 * 
 * @example
 * ```typescript
 * // Before creating invoice, validate supplier exists in same environment
 * const supplierExists = await validateForeignKeyEnvironment(
 *   db,
 *   suppliersTable,
 *   supplierId,
 *   tenantId,
 *   environment
 * );
 * 
 * if (!supplierExists) {
 *   throw new Error('Supplier not found in current environment');
 * }
 * ```
 */
export async function validateForeignKeyEnvironment<T extends { id: any; tenantId: any; environment: any }>(
  db: any,
  table: T,
  id: string,
  tenantId: string,
  environment: Environment
): Promise<boolean> {
  const result = await db
    .select({ id: table.id })
    .from(table)
    .where(and(
      eq(table.id, id),
      eq(table.tenantId, tenantId),
      eq(table.environment, environment)
    ))
    .limit(1);
  
  return result.length > 0;
}

/**
 * Create environment-scoped insert data
 * 
 * Ensures environment field is set correctly on new records.
 * 
 * @param data - Record data to insert
 * @param environment - Environment to set
 * @returns Data with environment field added
 * 
 * @example
 * ```typescript
 * const newClient = withEnvironment({
 *   name: 'ACME Corp',
 *   tenantId: 'tenant-123'
 * }, ENVIRONMENTS.PRODUCTION);
 * 
 * await db.insert(clientsTable).values(newClient);
 * ```
 */
export function withEnvironment<T extends Record<string, any>>(
  data: T,
  environment: Environment
): T & { environment: Environment } {
  validateEnvironment(environment);
  return {
    ...data,
    environment,
  };
}
