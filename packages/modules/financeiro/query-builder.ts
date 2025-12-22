/**
 * FinanceiroQueryBuilder - Cross-module data access
 * 
 * Implements ModuleQueryBuilder for financial data queries
 */

import type { ModuleQueryBuilder, Filter } from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { invoices, payments, bankAccounts, taxRates } from '../../../shared/schema';
import { eq, and, gte, lte, ilike, sql } from 'drizzle-orm';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';

export class FinanceiroQueryBuilder implements ModuleQueryBuilder {
  private tenantId: string;
  private entityName?: string;
  private filters: Filter[] = [];
  private orderField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitValue?: number;
  private offsetValue?: number;
  private schema: string = 'public'; // Add schema property with default

  constructor(tenantId: string, schema: string = 'public') {
    this.tenantId = tenantId;
    this.schema = schema;
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

  private getTable() {
    switch (this.entityName) {
      case 'invoices':
        return invoices;
      case 'payments':
        return payments;
      case 'bankAccounts':
      case 'bank_accounts':
        return bankAccounts;
      case 'taxRates':
      case 'tax_rates':
        return taxRates;
      default:
        throw new Error(`Unknown entity: ${this.entityName}`);
    }
  }

  /**
   * Get table name for schema-qualified queries
   * Maps all 32 Financial module tables
   */
  private getTableName(entityName: string): string | null {
    const mapping: Record<string, string> = {
      // Chart of Accounts & Journals (4)
      'chart_of_accounts': 'chart_of_accounts',
      'journal_entries': 'journal_entries',
      'journal_lines': 'journal_entry_lines',
      'fiscal_periods': 'fiscal_periods',
      
      // Invoicing (6)
      'invoices': 'invoices',
      'invoice_items': 'invoice_items',
      'invoice_lines': 'invoice_lines',
      'invoice_taxes': 'invoice_taxes',
      'invoice_validations': 'invoice_validations',
      'invoice_embeddings': 'invoice_embeddings',
      
      // Payables (6)
      'payables': 'payables',
      'payments': 'payments',
      'payment_allocations': 'payment_allocations',
      'payment_plans': 'payment_plans',
      'payment_reminders': 'payment_reminders',
      'dunning_runs': 'dunning_runs',
      
      // Banking (5)
      'bank_accounts': 'bank_accounts',
      'bankAccounts': 'bank_accounts',
      'bank_reconciliations': 'bank_reconciliations',
      'bank_transactions': 'bank_statement_transactions',
      'cashflow_snapshots': 'cashflow_snapshots',
      'employee_expenses': 'employee_expenses',
      
      // Taxation (5)
      'tax_categories': 'tax_categories',
      'tax_rates': 'tax_rates',
      'taxRates': 'tax_rates',
      'tax_jurisdictions': 'tax_jurisdictions',
      'tax_obligations': 'tax_obligations',
      'vat_returns': 'vat_returns',
      
      // Open Banking (3)
      'open_banking_connections': 'open_banking_connections',
      'open_banking_accounts': 'open_banking_accounts',
      'open_banking_transactions': 'open_banking_transactions',
      
      // Financial Models (3)
      'financial_models': 'financial_models',
      'financial_calculations': 'financial_calculations',
      'financial_scenarios': 'financial_scenarios',
    };
    
    return mapping[entityName] || null;
  }

  async execute(schema?: string): Promise<any[]> {
    if (!this.entityName) {
      throw new Error('Entity name not specified. Call select() first.');
    }

    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    
    // Get table name for ALL 32 Financial module tables
    const tableName = this.getTableName(this.entityName);
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}. Supported tables: invoices, payments, bank_accounts, tax_rates, etc.`);
    }

    // Use raw SQL for schema-qualified query
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    // Apply filters
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
    
    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
    if (this.offsetValue) {
      query += ` OFFSET ${this.offsetValue}`;
    }
    
    const result = await db.execute(sql.raw(query));
    return result.rows as any[];
  }

  private buildSQLCondition(filter: any): string | null {
    const field = filter.field;
    const value = typeof filter.value === 'string' 
      ? `'${filter.value.replace(/'/g, "''")}'` 
      : filter.value;
    
    switch (filter.operator) {
      case 'eq': return `${field} = ${value}`;
      case 'ne': return `${field} != ${value}`;
      case 'gt': return `${field} > ${value}`;
      case 'gte': return `${field} >= ${value}`;
      case 'lt': return `${field} < ${value}`;
      case 'lte': return `${field} <= ${value}`;
      case 'like': return `${field} ILIKE '%${filter.value}%'`;
      default: return null;
    }
  }


  async count(schema?: string): Promise<number> {
    if (!this.entityName) {
      throw new Error('Entity name not specified. Call select() first.');
    }

    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    
    // Get table name for ALL 32 Financial module tables
    const tableName = this.getTableName(this.entityName);
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}`);
    }

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
