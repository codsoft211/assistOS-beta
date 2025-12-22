/**
 * ComercialQueryBuilder
 * 
 * Implementa ModuleQueryBuilder interface para queries cross-module.
 * Adapter para o Drizzle ORM que mantém o código legacy.
 */

import type { ModuleQueryBuilder, Filter } from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { 
  commercialLeads,
  budgetQuotes,
  salesOrders,
  clients,
  commercialActivities
} from '../../../shared/schema';
import { eq, and, or, gt, gte, lt, lte, inArray, like, ilike, sql } from 'drizzle-orm';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';

export class ComercialQueryBuilder implements ModuleQueryBuilder {
  private entityName?: string;
  private filters: Filter[] = [];
  private orderField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitValue?: number;
  private offsetValue?: number;
  
  constructor(private tenantId: string) {}
  
  select(entity: string): ModuleQueryBuilder {
    this.entityName = entity;
    return this;
  }
  
  where(filters: Filter[]): ModuleQueryBuilder {
    this.filters = filters;
    return this;
  }
  
  orderBy(field: string, direction: 'asc' | 'desc'): ModuleQueryBuilder {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }
  
  limit(count: number): ModuleQueryBuilder {
    this.limitValue = count;
    return this;
  }
  
  offset(count: number): ModuleQueryBuilder {
    this.offsetValue = count;
    return this;
  }
  
  async execute(schema?: string): Promise<any[]> {
    if (!this.entityName) {
      throw new Error('Entity not specified - call select() first');
    }
    
    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    
    // Map entity name to table name
    const tableName = this.getTableNameForEntity(this.entityName);
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}`);
    }
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildSQLFilterCondition(filter);
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
    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
    // Apply OFFSET
    if (this.offsetValue) {
      query += ` OFFSET ${this.offsetValue}`;
    }
    
    const result = await db.execute(sql.raw(query));
    return result.rows as any[];
  }
  
  async count(schema?: string): Promise<number> {
    if (!this.entityName) {
      throw new Error('Entity not specified - call select() first');
    }
    
    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    
    const tableName = this.getTableNameForEntity(this.entityName);
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}`);
    }
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildSQLFilterCondition(filter);
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
  
  /**
   * Map entity name to table name
   * Complete mapping for all 26 Commercial module tables
   */
  private getTableNameForEntity(entityName: string): string | null {
    const mapping: Record<string, string> = {
      // Service Lines (2)
      'service_lines': 'service_lines',
      'service_line_components': 'service_line_components',
      
      // Quotes & Pricing (4)
      'quotes': 'quotes',
      'quote_lines': 'quote_lines',
      'quote_pricing_rules': 'quote_pricing_rules',
      'proposals': 'proposals',
      
      // Budget Quotes (9)
      'budget_quotes': 'budget_quotes',
      'budget_quote_versions': 'budget_quote_versions',
      'budget_quote_items': 'budget_quote_items',
      'budget_packages': 'budget_packages',
      'budget_package_items': 'budget_package_items',
      'budget_menu_items': 'budget_menu_items',
      'budget_staff_roles': 'budget_staff_roles',
      'budget_transport_rules': 'budget_transport_rules',
      'budget_alerts': 'budget_alerts',
      
      // Sales Orders (2)
      'sales_orders': 'sales_orders',
      'orders': 'sales_orders', // alias
      'sales_order_lines': 'sales_order_lines',
      
      // Pricing Catalog (7)
      'pricing_catalogs': 'pricing_catalogs',
      'pricing_catalog_categories': 'pricing_catalog_categories',
      'pricing_line_items': 'pricing_line_items',
      'pricing_discounts': 'pricing_discounts',
      'pricing_taxes': 'pricing_taxes',
      'pricing_addons': 'pricing_addons',
      'rate_cards': 'rate_cards',
      
      // Cost Templates (2)
      'cost_templates': 'cost_templates',
      'cost_components': 'cost_components',
      
      // Legacy aliases
      'leads': 'commercial_leads',
      'clients': 'clients',
      'activities': 'commercial_activities',
    };
    
    return mapping[entityName] || null;
  }
  
  /**
   * Build SQL filter condition from Filter interface
   */
  private buildSQLFilterCondition(filter: Filter): string | null {
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
      case 'in':
        const values = Array.isArray(filter.value) ? filter.value : [filter.value];
        const escapedValues = values.map(v => 
          typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
        ).join(', ');
        return `${field} IN (${escapedValues})`;
      case 'nin':
        const notValues = Array.isArray(filter.value) ? filter.value : [filter.value];
        const escapedNotValues = notValues.map(v => 
          typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
        ).join(', ');
        return `${field} NOT IN (${escapedNotValues})`;
      case 'like':
        return `${field} LIKE '%${filter.value}%'`;
      case 'ilike':
        return `${field} ILIKE '%${filter.value}%'`;
      default:
        console.warn(`Unsupported operator: ${filter.operator}`);
        return null;
    }
  }
}
