/**
 * LogísticaQueryBuilder - Cross-module data access for logistics
 * 
 * Implements ModuleQueryBuilder with support for:
 * - Date range filtering (for reservations)
 * - Project filtering (for equipment allocations)
 * - Availability checking
 */

import type { ModuleQueryBuilder, Filter } from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { 
  warehouses,
  warehouseLocations,
  inventoryLevels,
  inventoryBatches,
  inventoryTransactions,
  inventoryCounts,
  stockAlerts,
  stockMoves,
  equipmentAllocations,
  equipmentConditions,
  pickingBatches,
  reorderingRules,
  maintenanceSchedule
} from '../../../shared/schema';
import { eq, and, gte, lte, ilike, sql, or } from 'drizzle-orm';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';

export class LogisticaQueryBuilder implements ModuleQueryBuilder {
  private tenantId: string;
  private entityName?: string;
  private filters: Filter[] = [];
  private orderField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitValue?: number;
  private offsetValue?: number;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  select(entityName: string): this {
    this.entityName = entityName;
    return this;
  }

  where(filters: Filter[]): this {
    this.filters = filters;
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  offset(offset: number): this {
    this.offsetValue = offset;
    return this;
  }

  /**
   * Map entity name to table name
   * Complete mapping for all 8 Logistics module tables
   */
  private getTableName(): string {
    const mapping: Record<string, string> = {
      // Catering Operations (3)
      'catering_kitchen_workflows': 'catering_kitchen_workflows',
      'kitchen_workflows': 'catering_kitchen_workflows', // alias
      'catering_logistics': 'catering_logistics',
      'logistics': 'catering_logistics', // alias
      'catering_prep_lists': 'catering_prep_lists',
      'prep_lists': 'catering_prep_lists', // alias
      
      // Warehouse & Stock (5)
      'warehouses': 'warehouses',
      'warehouse_locations': 'warehouse_locations',
      'warehouseLocations': 'warehouse_locations',
      'inventory_levels': 'inventory_levels',
      'inventoryLevels': 'inventory_levels',
      'stock_moves': 'stock_moves',
      'stockMoves': 'stock_moves',
      'equipment_allocations': 'equipment_allocations',
      'equipmentAllocations': 'equipment_allocations',
      
      // Legacy support
      'inventoryBatches': 'inventory_batches',
      'inventoryTransactions': 'inventory_transactions',
      'inventoryCounts': 'inventory_counts',
      'stockAlerts': 'stock_alerts',
      'equipmentConditions': 'equipment_conditions',
      'pickingBatches': 'picking_batches',
      'reorderingRules': 'reordering_rules',
      'maintenanceSchedule': 'maintenance_schedule',
    };
    
    const tableName = mapping[this.entityName!];
    
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}. Supported: warehouses, inventory_levels, stock_moves, etc.`);
    }
    
    return tableName;
  }

  private buildSQLCondition(filter: Filter): string | null {
    const field = filter.field;
    const value = typeof filter.value === 'string' 
      ? `'${filter.value.replace(/'/g, "''")}'` 
      : filter.value;
    
    switch (filter.operator) {
      case 'eq':
        return `${field} = ${value}`;
      case 'ne':
        return `${field} != ${value}`;
      case 'gt':
        return `${field} > ${value}`;
      case 'gte':
        return `${field} >= ${value}`;
      case 'lt':
        return `${field} < ${value}`;
      case 'lte':
        return `${field} <= ${value}`;
      case 'like':
      case 'ilike':
        return `${field} ILIKE '%${filter.value}%'`;
      default:
        return null;
    }
  }

  async execute(schema?: string): Promise<any[]> {
    if (!this.entityName) {
      throw new Error('Entity name not specified. Call select() first.');
    }

    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const tableName = this.getTableName();
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildSQLCondition(filter);
      if (condition) {
        conditions.push(condition);
      }
    }
    
    // Build query
    let query = `SELECT * FROM "${targetSchema}"."${tableName}"`;
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    // Apply ORDER BY
    if (this.orderField) {
      query += ` ORDER BY ${this.orderField} ${this.orderDirection.toUpperCase()}`;
    }
    
    // Apply LIMIT
    if (this.limitValue !== undefined && this.limitValue > 0) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
    // Apply OFFSET
    if (this.offsetValue !== undefined && this.offsetValue > 0) {
      query += ` OFFSET ${this.offsetValue}`;
    }
    
    const result = await db.execute(sql.raw(query));
    return result.rows as any[];
  }

  async count(schema?: string): Promise<number> {
    if (!this.entityName) {
      throw new Error('Entity name not specified. Call select() first.');
    }

    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const tableName = this.getTableName();
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildSQLCondition(filter);
      if (condition) {
        conditions.push(condition);
      }
    }
    
    let query = `SELECT COUNT(*) as count FROM "${targetSchema}"."${tableName}"`;
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    const result = await db.execute(sql.raw(query));
    return Number(result.rows[0]?.count || 0);
  }
}
