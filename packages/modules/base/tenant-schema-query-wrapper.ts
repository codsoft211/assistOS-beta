/**
 * Tenant Schema Query Wrapper
 * 
 * Wraps existing query builders to automatically use tenant schemas
 * without modifying the original query builder code
 */

import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';
import { db } from '../../../apps/api/db';
import { sql } from 'drizzle-orm';

/**
 * Execute a database query in tenant schema context
 * 
 * Usage:
 * ```typescript
 * const result = await executeInTenantSchema(tenantId, async (schemaName) => {
 *   return db.execute(sql`SELECT * FROM "${schemaName}"."table_name" WHERE ...`);
 * });
 * ```
 */
export async function executeInTenantSchema<T>(
  tenantId: string,
  queryFn: (schemaName: string) => Promise<T>
): Promise<T> {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) {
    throw new Error(`No schema found for tenant ${tenantId}. Ensure tenant schema is created.`);
  }

  return queryFn(schemaName);
}

/**
 * Get schema-qualified table name
 */
export async function getSchemaQualifiedTable(
  tenantId: string,
  tableName: string
): Promise<string> {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) {
    throw new Error(`No schema found for tenant ${tenantId}`);
  }
  
  return `"${schemaName}"."${tableName}"`;
}

/**
 * Schema-aware query builder wrapper
 * Wraps any existing query builder to use tenant schemas
 */
export class TenantSchemaQueryWrapper<T> {
  private schemaName: string | null = null;

  constructor(private tenantId: string, private queryBuilder: T) {}

  /**
   * Initialize schema name (call once)
   */
  async init(): Promise<this> {
    this.schemaName = await tenantSchemaService.getTenantSchemaName(this.tenantId);
    if (!this.schemaName) {
      throw new Error(`No schema found for tenant ${this.tenantId}`);
    }
    return this;
  }

  /**
   * Get the underlying query builder with schema context
   */
  get builder(): T {
    return this.queryBuilder;
  }

  /**
   * Get the resolved schema name
   */
  get schema(): string {
    if (!this.schemaName) {
      throw new Error('Schema not initialized. Call init() first.');
    }
    return this.schemaName;
  }

  /**
   * Execute a method on the wrapped query builder with schema context
   */
  async execute<R>(methodName: keyof T, ...args: any[]): Promise<R> {
    if (!this.schemaName) {
      await this.init();
    }

    const method = this.queryBuilder[methodName];
    if (typeof method !== 'function') {
      throw new Error(`Method ${String(methodName)} not found on query builder`);
    }

    // Call the method with schema as last parameter if it accepts it
    return (method as any).apply(this.queryBuilder, [...args, this.schemaName]);
  }
}

/**
 * Helper to wrap module query builder with schema support
 */
export async function wrapWithTenantSchema<T>(
  tenantId: string,
  queryBuilder: T
): Promise<TenantSchemaQueryWrapper<T>> {
  const wrapper = new TenantSchemaQueryWrapper(tenantId, queryBuilder);
  await wrapper.init();
  return wrapper;
}

/**
 * Schema name cache for performance
 */
class SchemaCache {
  private cache = new Map<string, { schema: string; timestamp: number }>();
  private ttl = 300000; // 5 minutes

  async get(tenantId: string): Promise<string | null> {
    const cached = this.cache.get(tenantId);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.schema;
    }

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    
    if (schemaName) {
      this.cache.set(tenantId, {
        schema: schemaName,
        timestamp: Date.now(),
      });
    }

    return schemaName;
  }

  clear(tenantId?: string) {
    if (tenantId) {
      this.cache.delete(tenantId);
    } else {
      this.cache.clear();
    }
  }
}

export const schemaCache = new SchemaCache();

/**
 * Get tenant schema with caching
 */
export async function getTenantSchema(tenantId: string): Promise<string> {
  const schemaName = await schemaCache.get(tenantId);
  if (!schemaName) {
    throw new Error(`No schema found for tenant ${tenantId}`);
  }
  return schemaName;
}

