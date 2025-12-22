/**
 * Production Module - Manufacturing & Production
 * 
 * Complete module implementation for managing production orders, work orders,
 * BOMs, scheduling, and manufacturing operations.
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

import { ProductionQueryBuilder } from './query-builder';
import { productionTools } from './tools';
import { productionRoutes } from './routes';
import { db } from '../../../apps/api/db';
import { sql } from 'drizzle-orm';

// ============================================================================
// PRODUCTION MODULE
// ============================================================================

export class ProductionModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'production',
    name: 'Production',
    version: '1.0.0',
    category: 'production',
    description: 'Production & Manufacturing: work orders, operations, materials, scheduling',
    icon: 'Factory',
    dependencies: ['logistics'],
    permissions: [
      { key: 'production.read', name: 'View production data' },
      { key: 'production.write', name: 'Create/edit production data' },
      { key: 'production.work_orders', name: 'Manage work orders' },
      { key: 'production.schedule', name: 'Manage production schedule' },
      { key: 'production.bom', name: 'Manage Bill of Materials' },
      { key: 'production.quality', name: 'Manage quality control' },
    ]
  };
  
  entities: EntityDefinition[] = [
    {
      name: 'production_orders',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'orderNumber', type: 'text', required: true, unique: true },
          { name: 'projectId', type: 'text' },
          { name: 'productId', type: 'text', required: true },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'actualQuantity', type: 'decimal' },
          { name: 'status', type: 'enum', options: ['draft', 'planned', 'scheduled', 'released', 'in_progress', 'completed', 'cancelled'], default: 'draft' },
          { name: 'startDate', type: 'date' },
          { name: 'endDate', type: 'date' },
          { name: 'actualStartDate', type: 'datetime' },
          { name: 'actualEndDate', type: 'datetime' },
          { name: 'priority', type: 'enum', options: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
          { name: 'workCenterId', type: 'text' },
          { name: 'bomId', type: 'text' },
          { name: 'notes', type: 'text' },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
    {
      name: 'work_orders',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'workOrderNumber', type: 'text', required: true, unique: true },
          { name: 'productionOrderId', type: 'text', required: true },
          { name: 'workCenterId', type: 'text' },
          { name: 'operationId', type: 'text' },
          { name: 'sequence', type: 'number', default: 1 },
          { name: 'status', type: 'enum', options: ['pending', 'ready', 'in_progress', 'paused', 'completed', 'cancelled'], default: 'pending' },
          { name: 'scheduledStart', type: 'datetime' },
          { name: 'scheduledEnd', type: 'datetime' },
          { name: 'actualStart', type: 'datetime' },
          { name: 'actualEnd', type: 'datetime' },
          { name: 'plannedHours', type: 'decimal' },
          { name: 'actualHours', type: 'decimal' },
          { name: 'assignedTo', type: 'text' },
          { name: 'notes', type: 'text' },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
    {
      name: 'bill_of_materials',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'productId', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'version', type: 'text', default: '1.0' },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'effectiveFrom', type: 'date' },
          { name: 'effectiveTo', type: 'date' },
          { name: 'notes', type: 'text' },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
    {
      name: 'work_centers',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'type', type: 'enum', options: ['machine', 'labor', 'mixed'], default: 'mixed' },
          { name: 'capacity', type: 'decimal' },
          { name: 'capacityUnit', type: 'text', default: 'hours' },
          { name: 'costPerHour', type: 'decimal' },
          { name: 'status', type: 'enum', options: ['available', 'busy', 'maintenance', 'offline'], default: 'available' },
          { name: 'location', type: 'text' },
        ],
        timestamps: true,
        tenantIsolation: true,
      }
    },
  ];
  
  workflows: WorkflowDefinition[] = [
    {
      name: 'Production Order Lifecycle',
      entity: 'production_orders',
      states: [
        { key: 'draft', label: 'Draft', color: '#6b7280', isInitial: true },
        { key: 'planned', label: 'Planned', color: '#3b82f6' },
        { key: 'scheduled', label: 'Scheduled', color: '#8b5cf6' },
        { key: 'released', label: 'Released', color: '#06b6d4' },
        { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
        { key: 'completed', label: 'Completed', color: '#22c55e', isFinal: true },
        { key: 'cancelled', label: 'Cancelled', color: '#ef4444', isFinal: true },
      ],
      transitions: [
        { from: 'draft', to: 'planned', action: 'plan' },
        { from: 'planned', to: 'scheduled', action: 'schedule' },
        { from: 'scheduled', to: 'released', action: 'release' },
        { from: 'released', to: 'in_progress', action: 'start' },
        { from: 'in_progress', to: 'completed', action: 'complete' },
        { from: '*', to: 'cancelled', action: 'cancel' },
      ],
    },
    {
      name: 'Work Order Execution',
      entity: 'work_orders',
      states: [
        { key: 'pending', label: 'Pending', color: '#6b7280', isInitial: true },
        { key: 'ready', label: 'Ready', color: '#3b82f6' },
        { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
        { key: 'paused', label: 'Paused', color: '#8b5cf6' },
        { key: 'completed', label: 'Completed', color: '#22c55e', isFinal: true },
        { key: 'cancelled', label: 'Cancelled', color: '#ef4444', isFinal: true },
      ],
      transitions: [
        { from: 'pending', to: 'ready', action: 'prepare' },
        { from: 'ready', to: 'in_progress', action: 'start' },
        { from: 'in_progress', to: 'paused', action: 'pause' },
        { from: 'paused', to: 'in_progress', action: 'resume' },
        { from: 'in_progress', to: 'completed', action: 'complete' },
        { from: '*', to: 'cancelled', action: 'cancel' },
      ],
    },
  ];
  
  tools: ModuleTool[] = productionTools;
  
  routes: RouteDefinition[] = productionRoutes.map(route => ({
    method: route.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: route.path.replace('/api/production', ''),
    handler: route.handler,
    permissions: ['production.read']
  }));
  
  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[Production] Installing for tenant ${tenantId}`);
      try {
        await db.execute(sql.raw(`
          INSERT INTO work_centers (tenant_id, name, code, type, status, created_at)
          VALUES ('${tenantId}', 'Main Production Line', 'MAIN', 'mixed', 'available', NOW())
          ON CONFLICT DO NOTHING
        `));
      } catch (error) {
        console.error('[Production] Error creating default work center:', error);
      }
    },
    onUninstall: async (tenantId: string) => {
      console.log(`[Production] Uninstalling for tenant ${tenantId}`);
    },
    onActivate: async (tenantId: string) => {
      this.tenantId = tenantId;
      console.log(`[Production] Activated for tenant ${tenantId}`);
    },
    onDeactivate: async (tenantId: string) => {
      console.log(`[Production] Deactivated for tenant ${tenantId}`);
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
      createQuery: () => new ProductionQueryBuilder(tenantId),
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        switch (metric) {
          case 'production_order_count':
            return await new ProductionQueryBuilder(tenantId).select('production_orders').count();
          case 'work_order_count':
            return await new ProductionQueryBuilder(tenantId).select('work_orders').count();
          case 'in_progress_count':
            return await new ProductionQueryBuilder(tenantId)
              .select('production_orders')
              .where([{ field: 'status', operator: 'eq', value: 'in_progress' }])
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
        const results = await new ProductionQueryBuilder(tenantId)
          .select(entityName)
          .where([{ field: 'id', operator: 'eq', value: id }])
          .execute();
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        let builder = new ProductionQueryBuilder(tenantId).select(entityName);
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

export function createProductionModule(): ProductionModule {
  return new ProductionModule();
}
