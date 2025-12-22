/**
 * Schema-aware wrapper for ComprasQueryBuilder
 * 
 * This wrapper adds tenant schema support to the existing ComprasQueryBuilder
 * without modifying the original 1308-line implementation.
 * 
 * Usage:
 * ```typescript
 * import { ComprasSchemaQueryBuilder } from './query-builder-schema-wrapper';
 * 
 * const builder = new ComprasSchemaQueryBuilder(tenantId);
 * const suppliers = await builder.listSuppliers({ status: true });
 * // Automatically uses tenant schema!
 * ```
 */

import { ComprasQueryBuilder } from './query-builder';
import { getTenantSchema } from '../base/tenant-schema-query-wrapper';
import { db } from '../../../apps/api/db';
import { sql } from 'drizzle-orm';

export class ComprasSchemaQueryBuilder extends ComprasQueryBuilder {
  private schemaName: string | null = null;

  constructor(tenantId: string) {
    super(tenantId);
  }

  /**
   * Initialize schema name (auto-called on first query)
   */
  private async ensureSchema(): Promise<string> {
    if (!this.schemaName) {
      this.schemaName = await getTenantSchema((this as any).tenantId);
    }
    return this.schemaName;
  }

  /**
   * Override listSuppliers to use tenant schema
   */
  async listSuppliers(filters: any = {}, options: any = {}) {
    const schema = await this.ensureSchema();
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${(this as any).tenantId}'`];
    
    if (filters.type) conditions.push(`type = '${filters.type}'`);
    if (filters.status !== undefined) conditions.push(`status = ${filters.status}`);
    if (filters.isActive !== undefined) conditions.push(`is_active = ${filters.isActive}`);
    if (filters.rating) conditions.push(`rating >= ${filters.rating}`);
    
    let query = `SELECT * FROM "${schema}"."suppliers"`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }
    
    if (options.limit) query += ` LIMIT ${options.limit}`;
    if (options.offset) query += ` OFFSET ${options.offset}`;
    
    const result = await db.execute(sql.raw(query));
    return result.rows;
  }

  /**
   * Override listPurchaseOrders to use tenant schema
   */
  async listPurchaseOrders(filters: any = {}, options: any = {}) {
    const schema = await this.ensureSchema();
    
    const conditions = [`tenant_id = '${(this as any).tenantId}'`];
    
    if (filters.status) conditions.push(`status = '${filters.status}'`);
    if (filters.supplierId) conditions.push(`supplier_id = '${filters.supplierId}'`);
    if (filters.projectId) conditions.push(`project_id = '${filters.projectId}'`);
    if (filters.source) conditions.push(`source = '${filters.source}'`);
    
    let query = `SELECT * FROM "${schema}"."purchase_orders"`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'DESC'}`;
    } else {
      query += ` ORDER BY order_date DESC`;
    }
    
    if (options.limit) query += ` LIMIT ${options.limit}`;
    if (options.offset) query += ` OFFSET ${options.offset}`;
    
    const result = await db.execute(sql.raw(query));
    return result.rows;
  }

  /**
   * Override getPurchaseOrder to use tenant schema
   */
  async getPurchaseOrder(id: string) {
    const schema = await this.ensureSchema();
    
    const query = `SELECT * FROM "${schema}"."purchase_orders" 
                   WHERE id = '${id}' AND tenant_id = '${(this as any).tenantId}' LIMIT 1`;
    
    const result = await db.execute(sql.raw(query));
    return result.rows[0] || null;
  }

  /**
   * Override listPurchasingInvoices to use tenant schema
   */
  async listPurchasingInvoices(filters: any = {}, options: any = {}) {
    const schema = await this.ensureSchema();
    
    const conditions = [`tenant_id = '${(this as any).tenantId}'`];
    
    if (filters.status) conditions.push(`status = '${filters.status}'`);
    if (filters.supplierId) conditions.push(`supplier_id = '${filters.supplierId}'`);
    if (filters.purchaseOrderId) conditions.push(`purchase_order_id = '${filters.purchaseOrderId}'`);
    
    let query = `SELECT * FROM "${schema}"."purchasing_invoices"`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'DESC'}`;
    }
    
    if (options.limit) query += ` LIMIT ${options.limit}`;
    if (options.offset) query += ` OFFSET ${options.offset}`;
    
    const result = await db.execute(sql.raw(query));
    return result.rows;
  }

  /**
   * Note: Other methods fallback to parent class implementation
   * Add schema-aware overrides for critical methods as needed
   */
}

// Export as default for backward compatibility
export default ComprasSchemaQueryBuilder;

