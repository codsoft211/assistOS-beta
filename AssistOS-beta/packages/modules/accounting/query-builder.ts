/**
 * AccountingQueryBuilder - Cross-module data access for Accounting
 * 
 * Implements ModuleQueryBuilder for:
 * - Chart of accounts
 * - Journal entries
 * - General ledger
 * - Financial periods
 */

import type { ModuleQueryBuilder, Filter } from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { sql } from 'drizzle-orm';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';

export class AccountingQueryBuilder implements ModuleQueryBuilder {
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
   */
  private getTableName(): string {
    const mapping: Record<string, string> = {
      'chart_of_accounts': 'chart_of_accounts',
      'accounts': 'chart_of_accounts',
      'journal_entries': 'journal_entries',
      'journalEntries': 'journal_entries',
      'journal_entry_lines': 'journal_entry_lines',
      'journalEntryLines': 'journal_entry_lines',
      'financial_periods': 'financial_periods',
      'financialPeriods': 'financial_periods',
      'account_balances': 'account_balances',
      'accountBalances': 'account_balances',
      'budget_lines': 'budget_lines',
      'cost_centers': 'cost_centers',
      'tax_codes': 'tax_codes',
    };
    
    const tableName = mapping[this.entityName!];
    
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}. Supported: chart_of_accounts, journal_entries, etc.`);
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

    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const tableName = this.getTableName();
    
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildSQLCondition(filter);
      if (condition) {
        conditions.push(condition);
      }
    }
    
    let query = `SELECT * FROM "${targetSchema}"."${tableName}"`;
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (this.orderField) {
      query += ` ORDER BY ${this.orderField} ${this.orderDirection.toUpperCase()}`;
    }
    
    if (this.limitValue !== undefined && this.limitValue > 0) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
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

    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const tableName = this.getTableName();
    
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

