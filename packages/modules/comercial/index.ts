/**
 * Módulo Comercial - CRM & Sales
 * 
 * Migrado de código legacy (434 LOC) para arquitetura modular.
 * Preserva toda a lógica de negócio existente.
 * 
 * Entidades principais:
 * - Leads comerciais
 * - Or çamentos (Quotes)
 * - Pedidos (Orders)
 * - Clientes (Clients)
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
  ModuleContext,
  Filter
} from '../base/module.interface';

import { ComercialQueryBuilder } from './query-builder.js';
import { comercialTools } from './tools/index.js';
import { comercialRoutes } from './routes/index.js';
import { comercialWorkflows } from './workflows/index.js';
import { db } from '../../../apps/api/db';
import { eq, and } from 'drizzle-orm';

// ============================================================================
// COMERCIAL MODULE
// ============================================================================

export class ComercialModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'crm',
    name: 'CRM',
    version: '1.0.0',
    category: 'crm',  // Keep existing category to avoid TypeScript issues
    description: 'Customer Relationship Management: customers, contacts, opportunities, quotes, orders',
    icon: 'Users',
    dependencies: [],
    permissions: [
      { key: 'crm.read', name: 'View CRM data' },
      { key: 'crm.write', name: 'Create/edit CRM data' },
      { key: 'crm.delete', name: 'Delete CRM data' },
      { key: 'crm.quotes', name: 'Manage quotes' },
      { key: 'crm.orders', name: 'Manage orders' },
      { key: 'crm.clients.view', name: 'View clients' },
      { key: 'crm.clients.create', name: 'Create clients' },
      { key: 'crm.opportunities.view', name: 'View opportunities' },
      { key: 'crm.opportunities.create', name: 'Create opportunities' },
      { key: 'crm.dashboard', name: 'CRM Dashboard' }
    ]
  };
  
  // ============================================================================
  // ENTITIES (adaptadas do schema legacy)
  // ============================================================================
  
  entities: EntityDefinition[] = [
    {
      name: 'quotes',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'leadId', type: 'text', required: true },
          { name: 'quoteNumber', type: 'text', required: true, unique: true },
          { name: 'version', type: 'number', default: 1 },
          { name: 'status', type: 'enum', options: ['draft', 'sent', 'accepted', 'rejected', 'expired'], required: true },
          { name: 'numPax', type: 'number', required: true },
          { name: 'eventLocation', type: 'text' },
          { name: 'distanceKm', type: 'decimal' },
          { name: 'subtotal', type: 'decimal' },
          { name: 'marginAmount', type: 'decimal' },
          { name: 'totalWithoutVat', type: 'decimal' },
          { name: 'totalWithVat', type: 'decimal' },
          { name: 'notes', type: 'text' },
          { name: 'internalNotes', type: 'text' },
          { name: 'sentAt', type: 'datetime' },
          { name: 'approvedAt', type: 'datetime' },
          { name: 'createdByUserId', type: 'text', required: true }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'leads', foreignKey: 'leadId' },
        { type: 'belongsTo', target: 'users', foreignKey: 'createdByUserId' }
      ],
      indexes: [
        { fields: ['leadId'] },
        { fields: ['status'] },
        { fields: ['quoteNumber'], unique: true }
      ]
    },
    
    {
      name: 'orders',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'orderNumber', type: 'text', required: true, unique: true },
          { name: 'clientId', type: 'text', required: true },
          { name: 'quoteId', type: 'text' },
          { name: 'subtotal', type: 'decimal', required: true },
          { name: 'taxAmount', type: 'decimal', required: true },
          { name: 'totalAmount', type: 'decimal', required: true },
          { name: 'status', type: 'enum', options: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'], required: true },
          { name: 'source', type: 'enum', options: ['email', 'phone', 'web', 'manual'], required: true },
          { name: 'priority', type: 'enum', options: ['low', 'normal', 'high', 'urgent'], required: true },
          { name: 'shippingAddress', type: 'text' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'clients', foreignKey: 'clientId' },
        { type: 'belongsTo', target: 'quotes', foreignKey: 'quoteId' },
        { type: 'hasMany', target: 'orderItems', foreignKey: 'orderId' }
      ],
      indexes: [
        { fields: ['orderNumber'], unique: true },
        { fields: ['clientId'] },
        { fields: ['status'] }
      ]
    },
    
    {
      name: 'clients',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'name', type: 'text' },
          { name: 'email', type: 'email' },
          { name: 'phone', type: 'phone' },
          { name: 'company', type: 'text' },
          { name: 'nif', type: 'text' },
          { name: 'address', type: 'text' },
          { name: 'city', type: 'text' },
          { name: 'postalCode', type: 'text' },
          { name: 'country', type: 'text', default: 'Portugal' },
          { name: 'status', type: 'enum', options: ['Active', 'Inactive'], required: true, default: 'Active' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'hasMany', target: 'orders', foreignKey: 'clientId' }
      ],
      indexes: [
        { fields: ['email'] },
        { fields: ['nif'] },
        { fields: ['status'] }
      ]
    },
    
    {
      name: 'activities',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'leadId', type: 'text' },
          { name: 'activityType', type: 'enum', options: ['call', 'email', 'meeting', 'note'], required: true },
          { name: 'subject', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'outcome', type: 'text' },
          { name: 'duration', type: 'number' },
          { name: 'scheduledAt', type: 'datetime' },
          { name: 'completedAt', type: 'datetime' },
          { name: 'createdBy', type: 'text', required: true },
          { name: 'assignedTo', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'leads', foreignKey: 'leadId' },
        { type: 'belongsTo', target: 'users', foreignKey: 'createdBy' },
        { type: 'belongsTo', target: 'users', foreignKey: 'assignedTo' }
      ],
      indexes: [
        { fields: ['leadId'] },
        { fields: ['activityType'] }
      ]
    }
  ];
  
  // ============================================================================
  // WORKFLOWS (pipeline de vendas)
  // ============================================================================
  
  workflows: WorkflowDefinition[] = comercialWorkflows;
  
  // ============================================================================
  // TOOLS (AI tools migradas do legacy)
  // ============================================================================
  
  tools: ModuleTool[] = comercialTools;
  
  // ============================================================================
  // ROUTES (API routes)
  // ============================================================================
  
  routes: RouteDefinition[] = comercialRoutes;
  
  // ============================================================================
  // HOOKS (lifecycle events)
  // ============================================================================
  
  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[ComercialModule] Installing for tenant ${tenantId}`);
      // TODO: Criar pipeline padrão, stages, etc
    },
    
    onUninstall: async (tenantId: string) => {
      console.log(`[ComercialModule] Uninstalling from tenant ${tenantId}`);
      // TODO: Cleanup (se necessário)
    },
    
    onActivate: async (tenantId: string) => {
      console.log(`[ComercialModule] Activating for tenant ${tenantId}`);
    },
    
    onDeactivate: async (tenantId: string) => {
      console.log(`[ComercialModule] Deactivating for tenant ${tenantId}`);
    }
  };
  
  // ============================================================================
  // DATA EXPOSURE (para cross-module tools)
  // ============================================================================
  
  exposeData(): ModuleDataInterface {
    if (!this.tenantId) {
      throw new Error('Module not initialized - call initialize() first');
    }
    
    const tenantId = this.tenantId;
    
    return {
      createQuery: () => new ComercialQueryBuilder(tenantId),
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        // Basic aggregation implementation
        switch (metric) {
          case 'quotes_count':
            return await new ComercialQueryBuilder(tenantId).select('quotes').count();
          
          case 'orders_count':
            return await new ComercialQueryBuilder(tenantId).select('orders').count();
          
          case 'clients_count':
            return await new ComercialQueryBuilder(tenantId).select('clients').count();
          
          default:
            console.warn(`Unknown metric: ${metric}`);
            return 0;
        }
      },
      
      export: async (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => {
        // TODO: Implementar export
        return Buffer.from('');
      },
      
      getSchema: () => ({
        entities: this.entities,
        workflows: this.workflows,
        relationships: this.entities.flatMap(e => e.relationships || [])
      }),
      
      getEntity: async (entityName: string, id: string) => {
        const query = new ComercialQueryBuilder(tenantId);
        const results = await query
          .select(entityName)
          .where([{ field: 'id', operator: 'eq', value: id }])
          .execute();
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        const query = new ComercialQueryBuilder(tenantId);
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
  // INITIALIZATION
  // ============================================================================
  
  async initialize(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
    console.log(`[ComercialModule] Initialized for tenant ${tenantId}`);
  }
  
  async healthCheck(): Promise<boolean> {
    return true; // TODO: Verificar conexão DB, etc
  }
  
  /**
   * Helper to get table for entity name
   */
  private getTableForEntity(entityName: string): any {
    // Import tables dynamically to avoid circular deps
    const { budgetQuotes, salesOrders, clients, commercialActivities } = require('../../../shared/schema');
    
    switch (entityName) {
      case 'quotes':
        return budgetQuotes;
      case 'orders':
        return salesOrders;
      case 'clients':
        return clients;
      case 'activities':
        return commercialActivities;
      default:
        return null;
    }
  }
}

// Export singleton factory
export function createComercialModule(): IModule {
  return new ComercialModule();
}

// Export OpportunityRulesEngine service
export { opportunityRulesEngine } from './services/opportunityRulesEngine';
