/**
 * FinanceiroModule - Financial Management Module
 * 
 * Complete financial module with invoices, payments, bank reconciliation
 */

import type {
  IModule,
  ModuleMetadata,
  EntityDefinition,
  ModuleTool,
  RouteDefinition,
  WorkflowDefinition,
  ModuleHooks,
  ModuleDataInterface,
  ModuleContext,
  Filter
} from '../base/module.interface';

import { FinanceiroQueryBuilder } from './query-builder.js';
import { financeiroTools } from './tools/index.js';
import { financeiroRoutes } from './routes/index.js';
import { financeiroWorkflows } from './workflows/index.js';
import { financeiroEntities } from './entities/index.js';
import { db } from '../../../apps/api/db';
import { eq, and } from 'drizzle-orm';

// ============================================================================
// FINANCEIRO MODULE
// ============================================================================

export class FinanceiroModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'financial',
    name: 'Financial',
    description: 'Complete financial management: invoices, payments, bank reconciliation',
    version: '1.0.0',
    category: 'finance',
    icon: 'DollarSign',
    dependencies: [],
    permissions: [
      { key: 'financial.read', name: 'View financial data' },
      { key: 'financial.write', name: 'Create/edit financial data' },
      { key: 'financial.delete', name: 'Delete financial data' },
      { key: 'financial.invoices.view', name: 'View invoices' },
      { key: 'financial.invoices.create', name: 'Create invoices' },
      { key: 'financial.invoices.edit', name: 'Edit invoices' },
      { key: 'financial.invoices.delete', name: 'Delete invoices' },
      { key: 'financial.receivables.view', name: 'View receipts' },
      { key: 'financial.receivables.create', name: 'Record receipts' },
      { key: 'financial.bankAccounts.view', name: 'View bank accounts' },
      { key: 'financial.bankAccounts.manage', name: 'Manage bank accounts' },
      { key: 'financial.reconciliation', name: 'Bank reconciliation' },
      { key: 'financial.settings', name: 'Financial settings' }
    ]
  };

  entities: EntityDefinition[] = financeiroEntities;
  
  tools: ModuleTool[] = financeiroTools;
  
  routes: RouteDefinition[] = financeiroRoutes;
  
  workflows: WorkflowDefinition[] = financeiroWorkflows;

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[FinanceiroModule] Installing for tenant ${tenantId}`);
      
      // Create default tax rates for Portugal
      const { taxRates } = await import('../../../shared/schema.js');
      await db.insert(taxRates).values([
        {
          tenantId,
          country: 'PT',
          taxType: 'VAT',
          rateName: 'Standard VAT',
          ratePercentage: '23.00',
          effectiveFrom: new Date('2023-01-01'),
          isActive: true,
        },
        {
          tenantId,
          country: 'PT',
          taxType: 'VAT',
          rateName: 'Reduced VAT',
          ratePercentage: '13.00',
          effectiveFrom: new Date('2023-01-01'),
          isActive: true,
        },
        {
          tenantId,
          country: 'PT',
          taxType: 'VAT',
          rateName: 'Intermediate VAT',
          ratePercentage: '6.00',
          effectiveFrom: new Date('2023-01-01'),
          isActive: true,
        },
        {
          tenantId,
          country: 'PT',
          taxType: 'VAT',
          rateName: 'Exempt',
          ratePercentage: '0.00',
          effectiveFrom: new Date('2023-01-01'),
          isActive: true,
        }
      ]);
      
      console.log(`[FinanceiroModule] Default tax rates created for tenant ${tenantId}`);
    },

    onUninstall: async (tenantId: string) => {
      console.log(`[FinanceiroModule] Uninstalling for tenant ${tenantId}`);
      // TODO: Archive or soft-delete financial data
    },

    onActivate: async (tenantId: string) => {
      console.log(`[FinanceiroModule] Activated for tenant ${tenantId}`);
      
      // Auto-seed default Financial pages when module is activated
      const { seedFinanceiroDefaultPages } = await import('../../../apps/api/services/module-page.service.js');
      try {
        const pagesCreated = await seedFinanceiroDefaultPages(tenantId);
        console.log(`[FinanceiroModule] ✅ Created ${pagesCreated} default pages for tenant ${tenantId}`);
      } catch (error) {
        console.error(`[FinanceiroModule] ❌ Failed to seed default pages:`, error);
        // Don't throw - module can still work with hardcoded pages as fallback
      }
    },

    onDeactivate: async (tenantId: string) => {
      console.log(`[FinanceiroModule] Deactivated for tenant ${tenantId}`);
    }
  };

  // ============================================================================
  // DATA INTERFACE (Cross-Module Access)
  // ============================================================================

  exposeData(): ModuleDataInterface {
    if (!this.tenantId) {
      throw new Error('Module not initialized - call initialize() first');
    }
    
    const tenantId = this.tenantId;
    
    return {
      createQuery: () => new FinanceiroQueryBuilder(tenantId),
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        switch (metric) {
          case 'total_invoices':
            return await new FinanceiroQueryBuilder(tenantId).select('invoices').count();
          
          case 'total_payments':
            return await new FinanceiroQueryBuilder(tenantId).select('payments').count();
          
          case 'total_receivables': {
            const invoicesList = await new FinanceiroQueryBuilder(tenantId)
              .select('invoices')
              .where([{ field: 'status', operator: 'eq', value: 'sent' }])
              .execute();
            return invoicesList.reduce((sum: number, inv: any) => sum + parseFloat(inv.total || 0), 0);
          }
          
          case 'total_revenue': {
            const invoicesList = await new FinanceiroQueryBuilder(tenantId)
              .select('invoices')
              .where([{ field: 'status', operator: 'eq', value: 'paid' }])
              .execute();
            return invoicesList.reduce((sum: number, inv: any) => sum + parseFloat(inv.total || 0), 0);
          }
          
          default:
            console.warn(`Unknown metric: ${metric}`);
            return 0;
        }
      },
      
      export: async (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => {
        // TODO: Implement export functionality
        return Buffer.from('');
      },
      
      getSchema: () => ({
        entities: this.entities,
        workflows: this.workflows,
        relationships: this.entities.flatMap(e => e.relationships || [])
      }),
      
      getEntity: async (entityName: string, id: string) => {
        const query = new FinanceiroQueryBuilder(tenantId);
        const results = await query
          .select(entityName)
          .where([{ field: 'id', operator: 'eq', value: id }])
          .execute();
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        const query = new FinanceiroQueryBuilder(tenantId);
        let builder = query.select(entityName);
        if (filters) {
          builder = builder.where(filters);
        }
        return await builder.execute();
      },
      
      createEntity: async (entityName: string, data: any) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        const result = await db.insert(table).values({
          ...data,
          tenantId
        }).returning();
        
        return Array.isArray(result) ? result[0] : result;
      },
      
      updateEntity: async (entityName: string, id: string, data: any) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        const result = await db
          .update(table)
          .set(data)
          .where(and(
            eq((table as any).id, id),
            eq((table as any).tenantId, tenantId)
          ))
          .returning();
        
        return Array.isArray(result) ? result[0] : result;
      },
      
      deleteEntity: async (entityName: string, id: string) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        await db
          .delete(table)
          .where(and(
            eq((table as any).id, id),
            eq((table as any).tenantId, tenantId)
          ));
      }
    };
  }

  // ============================================================================
  // MODULE INITIALIZATION
  // ============================================================================

  async initialize(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
    console.log(`[FinanceiroModule] Initialized for tenant ${tenantId}`);
  }

  async healthCheck(): Promise<boolean> {
    return true; // TODO: Verify DB connection, etc
  }
  
  /**
   * Helper to get table for entity name
   */
  private getTableForEntity(entityName: string): any {
    const { invoices, payments, bankAccounts, taxRates } = require('../../../shared/schema');
    
    switch (entityName) {
      case 'invoices':
        return invoices;
      case 'payments':
        return payments;
      case 'bankAccounts':
        return bankAccounts;
      case 'taxRates':
        return taxRates;
      default:
        return null;
    }
  }
}

// Export singleton factory
export function createFinanceiroModule(): IModule {
  return new FinanceiroModule();
}
