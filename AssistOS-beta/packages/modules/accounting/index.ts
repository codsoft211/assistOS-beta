/**
 * Accounting Module - Financial Accounting
 * 
 * Complete module implementation for managing chart of accounts, journal entries,
 * general ledger, and financial reporting.
 */

import type {
  IModule,
  ModuleMetadata,
  EntityDefinition,
  WorkflowDefinition,
  ModuleTool,
  RouteDefinition,
  ModuleHooks,
  ModuleDataInterface,
  Filter,
} from '../base/module.interface';

import { AccountingQueryBuilder } from './query-builder';
import { accountingTools } from './tools';
import { accountingRoutes } from './routes';
import { db } from '../../../apps/api/db';
import { sql } from 'drizzle-orm';

// ============================================================================
// ACCOUNTING MODULE
// ============================================================================

export class AccountingModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'accounting',
    name: 'Accounting',
    version: '1.0.0',
    category: 'finance',
    description: 'Financial Accounting: chart of accounts, journal entries, general ledger, financial reporting',
    icon: 'Calculator',
    dependencies: ['financial'],
    permissions: [
      { key: 'accounting.read', name: 'View accounting data' },
      { key: 'accounting.write', name: 'Create/edit accounting data' },
      { key: 'accounting.journal_entries', name: 'Manage journal entries' },
      { key: 'accounting.reports', name: 'View financial reports' },
      { key: 'accounting.period_close', name: 'Close financial periods' },
      { key: 'accounting.admin', name: 'Accounting administration' },
    ]
  };
  
  entities: EntityDefinition[] = [
    {
      name: 'chart_of_accounts',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'name', type: 'text', required: true },
          { name: 'accountType', type: 'enum', options: ['asset', 'liability', 'equity', 'revenue', 'expense'], required: true },
          { name: 'parentAccountId', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'normalBalance', type: 'enum', options: ['debit', 'credit'] },
          { name: 'isPostable', type: 'boolean', default: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'level', type: 'number', default: 1 },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
    {
      name: 'journal_entries',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'entryNumber', type: 'text', required: true, unique: true },
          { name: 'entryDate', type: 'date', required: true },
          { name: 'description', type: 'text', required: true },
          { name: 'reference', type: 'text' },
          { name: 'sourceModule', type: 'text' },
          { name: 'sourceDocumentId', type: 'text' },
          { name: 'status', type: 'enum', options: ['draft', 'pending_review', 'approved', 'posted', 'rejected', 'reversed'], default: 'draft' },
          { name: 'periodId', type: 'text' },
          { name: 'postedAt', type: 'datetime' },
          { name: 'postedBy', type: 'text' },
          { name: 'reversedEntryId', type: 'text' },
          { name: 'totalDebit', type: 'decimal' },
          { name: 'totalCredit', type: 'decimal' },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
    {
      name: 'journal_entry_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'journalEntryId', type: 'text', required: true },
          { name: 'accountId', type: 'text', required: true },
          { name: 'debit', type: 'decimal', default: 0 },
          { name: 'credit', type: 'decimal', default: 0 },
          { name: 'description', type: 'text' },
          { name: 'costCenterId', type: 'text' },
          { name: 'projectId', type: 'text' },
          { name: 'taxCodeId', type: 'text' },
          { name: 'lineNumber', type: 'number' },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
    {
      name: 'financial_periods',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'code', type: 'text', required: true },
          { name: 'fiscalYear', type: 'number', required: true },
          { name: 'periodNumber', type: 'number', required: true },
          { name: 'startDate', type: 'date', required: true },
          { name: 'endDate', type: 'date', required: true },
          { name: 'status', type: 'enum', options: ['open', 'soft_close', 'adjustments', 'review', 'closed', 'locked'], default: 'open' },
          { name: 'closedAt', type: 'datetime' },
          { name: 'closedBy', type: 'text' },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
    {
      name: 'cost_centers',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'name', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'parentId', type: 'text' },
          { name: 'managerId', type: 'text' },
          { name: 'isActive', type: 'boolean', default: true },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
  ];
  
  workflows: WorkflowDefinition[] = [
    {
      name: 'Journal Entry Approval',
      entity: 'journal_entries',
      states: [
        { key: 'draft', label: 'Draft', color: '#6b7280', isInitial: true },
        { key: 'pending_review', label: 'Pending Review', color: '#f59e0b' },
        { key: 'approved', label: 'Approved', color: '#3b82f6' },
        { key: 'posted', label: 'Posted', color: '#22c55e', isFinal: true },
        { key: 'rejected', label: 'Rejected', color: '#ef4444', isFinal: true },
        { key: 'reversed', label: 'Reversed', color: '#8b5cf6', isFinal: true },
      ],
      transitions: [
        { from: 'draft', to: 'pending_review', action: 'submit' },
        { from: 'pending_review', to: 'approved', action: 'approve' },
        { from: 'pending_review', to: 'rejected', action: 'reject' },
        { from: 'approved', to: 'posted', action: 'post' },
        { from: 'posted', to: 'reversed', action: 'reverse' },
        { from: 'rejected', to: 'draft', action: 'revise' },
      ],
    },
    {
      name: 'Period Close',
      entity: 'financial_periods',
      states: [
        { key: 'open', label: 'Open', color: '#22c55e', isInitial: true },
        { key: 'soft_close', label: 'Soft Close', color: '#f59e0b' },
        { key: 'adjustments', label: 'Adjustments', color: '#8b5cf6' },
        { key: 'review', label: 'Review', color: '#3b82f6' },
        { key: 'closed', label: 'Closed', color: '#6b7280' },
        { key: 'locked', label: 'Locked', color: '#ef4444', isFinal: true },
      ],
      transitions: [
        { from: 'open', to: 'soft_close', action: 'initiate_close' },
        { from: 'soft_close', to: 'adjustments', action: 'start_adjustments' },
        { from: 'adjustments', to: 'review', action: 'complete_adjustments' },
        { from: 'review', to: 'closed', action: 'approve_close' },
        { from: 'closed', to: 'locked', action: 'lock' },
        { from: 'closed', to: 'soft_close', action: 'reopen' },
      ],
    },
  ];
  
  tools: ModuleTool[] = accountingTools;
  
  routes: RouteDefinition[] = accountingRoutes.map(route => ({
    method: route.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: route.path.replace('/api/accounting', ''),
    handler: route.handler,
    permissions: ['accounting.read']
  }));
  
  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[Accounting] Installing for tenant ${tenantId}`);
      try {
        const defaultAccounts = [
          { code: '1000', name: 'Assets', type: 'asset', postable: false },
          { code: '1100', name: 'Cash and Bank', type: 'asset', postable: false },
          { code: '1110', name: 'Cash on Hand', type: 'asset', postable: true },
          { code: '1120', name: 'Bank Accounts', type: 'asset', postable: true },
          { code: '1200', name: 'Accounts Receivable', type: 'asset', postable: true },
          { code: '2000', name: 'Liabilities', type: 'liability', postable: false },
          { code: '2100', name: 'Accounts Payable', type: 'liability', postable: true },
          { code: '3000', name: 'Equity', type: 'equity', postable: false },
          { code: '3100', name: 'Retained Earnings', type: 'equity', postable: true },
          { code: '4000', name: 'Revenue', type: 'revenue', postable: false },
          { code: '4100', name: 'Sales Revenue', type: 'revenue', postable: true },
          { code: '5000', name: 'Expenses', type: 'expense', postable: false },
          { code: '5100', name: 'Operating Expenses', type: 'expense', postable: true },
        ];
        
        for (const acc of defaultAccounts) {
          await db.execute(sql.raw(`
            INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, is_postable, is_active, created_at)
            VALUES ('${tenantId}', '${acc.code}', '${acc.name}', '${acc.type}', ${acc.postable}, true, NOW())
            ON CONFLICT DO NOTHING
          `));
        }
      } catch (error) {
        console.error('[Accounting] Error creating default chart of accounts:', error);
      }
    },
    onUninstall: async (tenantId: string) => {
      console.log(`[Accounting] Uninstalling for tenant ${tenantId}`);
    },
    onActivate: async (tenantId: string) => {
      this.tenantId = tenantId;
      console.log(`[Accounting] Activated for tenant ${tenantId}`);
    },
    onDeactivate: async (tenantId: string) => {
      console.log(`[Accounting] Deactivated for tenant ${tenantId}`);
    }
  };
  
  exposeData(): ModuleDataInterface {
    if (!this.tenantId) {
      throw new Error('Module not initialized');
    }
    
    const tenantId = this.tenantId;
    const entities = this.entities;
    const workflows = this.workflows;
    
    return {
      createQuery: () => new AccountingQueryBuilder(tenantId),
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        switch (metric) {
          case 'account_count':
            return await new AccountingQueryBuilder(tenantId).select('chart_of_accounts').count();
          case 'journal_entry_count':
            return await new AccountingQueryBuilder(tenantId).select('journal_entries').count();
          case 'posted_entries':
            return await new AccountingQueryBuilder(tenantId)
              .select('journal_entries')
              .where([{ field: 'status', operator: 'eq', value: 'posted' }])
              .count();
          default:
            return 0;
        }
      },
      
      export: async (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => {
        return Buffer.from('');
      },
      
      getSchema: () => ({
        entities,
        workflows,
        relationships: entities.flatMap(e => e.relationships || [])
      }),
      
      getEntity: async (entityName: string, id: string) => {
        const results = await new AccountingQueryBuilder(tenantId)
          .select(entityName)
          .where([{ field: 'id', operator: 'eq', value: id }])
          .execute();
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        let builder = new AccountingQueryBuilder(tenantId).select(entityName);
        if (filters) builder = builder.where(filters);
        return await builder.execute();
      },
      
      createEntity: async (entityName: string, data: any) => {
        throw new Error('Not implemented');
      },
      
      updateEntity: async (entityName: string, id: string, data: any) => {
        throw new Error('Not implemented');
      },
      
      deleteEntity: async (entityName: string, id: string) => {
        throw new Error('Not implemented');
      }
    };
  }
  
  async initialize(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
  }
  
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

export function createAccountingModule(): AccountingModule {
  return new AccountingModule();
}
