import { db } from '../db';
import { tenantSchemaService } from '../services/tenant-schema.service';
import { sql, SQL } from 'drizzle-orm';
import { eq, and, or, inArray } from 'drizzle-orm';
import type { Environment } from '../../../shared/types/environment';

/**
 * Schema-aware query builder for tenant schema tables
 * 
 * Automatically resolves tenant schema name and builds schema-qualified queries
 */
export class TenantQueryBuilder {
  constructor(
    private tenantId: string,
    private environment: Environment = 'production'
  ) {}

  /**
   * Get schema-qualified table reference as SQL template
   * Uses ${sql.identifier(schema)}.${sql.identifier(table)} pattern
   */
  private schemaQualifiedTable(schemaName: string, tableName: string): SQL {
    return sql`${sql.identifier(schemaName)}.${sql.identifier(tableName)}`;
  }

  /**
   * Get schema name for this tenant
   */
  async getSchemaName(): Promise<string> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(this.tenantId);
    if (!schemaName) {
      throw new Error(`No schema for tenant ${this.tenantId}`);
    }
    return schemaName;
  }

  /**
   * Select from tenant schema table
   */
  async select<T = any>(
    tableName: string,
    conditions?: Record<string, any>,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: { column: string; direction?: 'ASC' | 'DESC' };
    }
  ): Promise<T[]> {
    const schemaName = await this.getSchemaName();
    const tableRef = this.schemaQualifiedTable(schemaName, tableName);
    
    let query = sql`SELECT * FROM ${tableRef}`;
    const whereConditions: SQL[] = [];
    
    // Always add tenant_id and environment filters
    whereConditions.push(sql`tenant_id = ${this.tenantId}`);
    whereConditions.push(sql`environment = ${this.environment}`);
    
    // Add additional conditions
    if (conditions) {
      for (const [key, value] of Object.entries(conditions)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            whereConditions.push(sql`${sql.identifier(key)} = ANY(${value})`);
          } else {
            whereConditions.push(sql`${sql.identifier(key)} = ${value}`);
          }
        }
      }
    }
    
    if (whereConditions.length > 0) {
      query = sql`${query} WHERE ${sql.join(whereConditions, sql` AND `)}`;
    }
    
    // Add ORDER BY
    if (options?.orderBy) {
      const direction = options.orderBy.direction || 'ASC';
      query = sql`${query} ORDER BY ${sql.identifier(options.orderBy.column)} ${sql.raw(direction)}`;
    }
    
    // Add LIMIT
    if (options?.limit) {
      query = sql`${query} LIMIT ${options.limit}`;
    }
    
    // Add OFFSET
    if (options?.offset) {
      query = sql`${query} OFFSET ${options.offset}`;
    }
    
    const result = await db.execute(query);
    return result.rows as T[];
  }

  /**
   * Insert into tenant schema table
   */
  async insert<T = any>(
    tableName: string,
    data: Record<string, any>
  ): Promise<T> {
    const schemaName = await this.getSchemaName();
    
    // Always add tenant_id and environment
    const insertData = {
      ...data,
      tenant_id: this.tenantId,
      environment: this.environment
    };
    
    const columns = Object.keys(insertData);
    const values = Object.values(insertData);
    
    // Build SQL template with proper parameter binding
    const columnsSql = sql.join(columns.map(c => sql.identifier(c)), sql`, `);
    const valuesSql = sql.join(values.map(v => sql`${v}`), sql`, `);
    const tableRef = this.schemaQualifiedTable(schemaName, tableName);
    
    const query = sql`INSERT INTO ${tableRef} (${columnsSql}) VALUES (${valuesSql}) RETURNING *`;
    
    const result = await db.execute(query);
    return result.rows[0] as T;
  }

  /**
   * Update records in tenant schema table
   */
  async update<T = any>(
    tableName: string,
    data: Record<string, any>,
    conditions: Record<string, any>
  ): Promise<T[]> {
    const schemaName = await this.getSchemaName();
    const tableRef = this.schemaQualifiedTable(schemaName, tableName);
    
    // Build SET clause with proper SQL templates
    const setClauses: SQL[] = [];
    for (const [key, value] of Object.entries(data)) {
      setClauses.push(sql`${sql.identifier(key)} = ${value}`);
    }
    
    // Build WHERE clause with tenant isolation
    const whereConditions: SQL[] = [];
    whereConditions.push(sql`tenant_id = ${this.tenantId}`);
    whereConditions.push(sql`environment = ${this.environment}`);
    
    for (const [key, value] of Object.entries(conditions)) {
      whereConditions.push(sql`${sql.identifier(key)} = ${value}`);
    }
    
    const query = sql`
      UPDATE ${tableRef}
      SET ${sql.join(setClauses, sql`, `)}
      WHERE ${sql.join(whereConditions, sql` AND `)}
      RETURNING *
    `;
    
    const result = await db.execute(query);
    return result.rows as T[];
  }

  /**
   * Delete from tenant schema table
   */
  async delete(
    tableName: string,
    conditions: Record<string, any>
  ): Promise<number> {
    const schemaName = await this.getSchemaName();
    const tableRef = this.schemaQualifiedTable(schemaName, tableName);
    
    // Build WHERE clause with tenant isolation
    const whereConditions: SQL[] = [];
    whereConditions.push(sql`tenant_id = ${this.tenantId}`);
    whereConditions.push(sql`environment = ${this.environment}`);
    
    for (const [key, value] of Object.entries(conditions)) {
      whereConditions.push(sql`${sql.identifier(key)} = ${value}`);
    }
    
    const query = sql`
      DELETE FROM ${tableRef}
      WHERE ${sql.join(whereConditions, sql` AND `)}
    `;
    
    const result = await db.execute(query);
    return result.rowCount || 0;
  }

  /**
   * Count records in tenant schema table
   */
  async count(
    tableName: string,
    conditions?: Record<string, any>
  ): Promise<number> {
    const schemaName = await this.getSchemaName();
    const tableRef = this.schemaQualifiedTable(schemaName, tableName);
    
    const whereConditions: SQL[] = [];
    whereConditions.push(sql`tenant_id = ${this.tenantId}`);
    whereConditions.push(sql`environment = ${this.environment}`);
    
    if (conditions) {
      for (const [key, value] of Object.entries(conditions)) {
        if (value !== undefined && value !== null) {
          whereConditions.push(sql`${sql.identifier(key)} = ${value}`);
        }
      }
    }
    
    const query = sql`
      SELECT COUNT(*) as count 
      FROM ${tableRef}
      WHERE ${sql.join(whereConditions, sql` AND `)}
    `;
    
    const result = await db.execute(query);
    const countRow = result.rows[0] as { count: string } | undefined;
    return parseInt(countRow?.count || '0', 10);
  }

  /**
   * Execute raw SQL in tenant schema context
   * Note: Params must be embedded using sql`` templates for proper binding
   */
  async executeRaw<T = any>(sqlQuery: string): Promise<T[]> {
    const schemaName = await this.getSchemaName();
    
    // Replace {schema} placeholder if present
    const finalQuery = sqlQuery.replace(/{schema}/g, `"${schemaName}"`);
    
    const result = await db.execute(sql.raw(finalQuery));
    return result.rows as T[];
  }
}

/**
 * Create a tenant query builder instance
 */
export function createTenantQueryBuilder(
  tenantId: string,
  environment: Environment = 'production'
): TenantQueryBuilder {
  return new TenantQueryBuilder(tenantId, environment);
}

