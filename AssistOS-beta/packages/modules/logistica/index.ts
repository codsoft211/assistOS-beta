/**
 * LogísticaModule - Intelligent Logistics & Inventory Management
 * 
 * Features:
 * - Base Odoo-style inventory management
 * - Project linking (equipment allocations)
 * - Time-based reservations & conflict detection
 * - Equipment condition tracking
 * - Advanced workflows (batch picking, replenishment, maintenance)
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
  Filter
} from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { eq, and } from 'drizzle-orm';
import { LogisticaQueryBuilder } from './query-builder';
import { logisticaTools } from './tools';
import { logisticaRoutes } from './routes';
import { logisticaWorkflows } from './workflows';

export class LogisticaModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'logistics',
    name: 'Logistics',
    version: '1.0.0',
    category: 'logistics',
    description: 'Complete logistics and inventory management with project linking and equipment',
    icon: 'Package',
    dependencies: [],
    permissions: [
      { key: 'logistics.warehouses.view', name: 'View Warehouses' },
      { key: 'logistics.warehouses.manage', name: 'Manage Warehouses' },
      { key: 'logistics.inventory.view', name: 'View Inventory' },
      { key: 'logistics.inventory.manage', name: 'Manage Inventory' },
      { key: 'logistics.allocations.view', name: 'View Equipment Allocations' },
      { key: 'logistics.allocations.create', name: 'Create Equipment Allocations' },
      { key: 'logistics.equipment.checkout', name: 'Equipment Checkout' },
      { key: 'logistics.equipment.checkin', name: 'Equipment Checkin' },
      { key: 'logistics.maintenance.view', name: 'View Maintenance Schedule' },
      { key: 'logistics.maintenance.manage', name: 'Manage Maintenance' },
      { key: 'logistics.analytics.view', name: 'View Logistics Analytics' }
    ]
  };
  
  // Note: Full entity schemas simplified for brevity - in production these would have complete field definitions
  entities: EntityDefinition[] = [
    {
      name: 'warehouses',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'type', type: 'enum', options: ['central', 'rental', 'project', 'virtual'], required: true },
          { name: 'address', type: 'text' },
          { name: 'city', type: 'text' },
          { name: 'postalCode', type: 'text' },
          { name: 'isActive', type: 'boolean', required: true },
          { name: 'linkedProjectId', type: 'relation', ref: 'projects' },
          { name: 'availableForProjects', type: 'boolean', required: true }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      softDelete: false
    },
    {
      name: 'inventoryLevels',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'warehouseId', type: 'relation', ref: 'warehouses', required: true },
          { name: 'productId', type: 'relation', ref: 'products', required: true },
          { name: 'qtyOnHand', type: 'decimal', required: true },
          { name: 'qtyReserved', type: 'decimal', required: true },
          { name: 'minThreshold', type: 'decimal' },
          { name: 'reorderPoint', type: 'decimal' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      indexes: [
        { fields: ['warehouseId', 'productId'], unique: true }
      ]
    },
    {
      name: 'equipmentAllocations',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'projectId', type: 'relation', ref: 'projects', required: true },
          { name: 'warehouseId', type: 'relation', ref: 'warehouses', required: true },
          { name: 'productId', type: 'relation', ref: 'products', required: true },
          { name: 'qtyAllocated', type: 'decimal', required: true },
          { name: 'fromDate', type: 'datetime', required: true },
          { name: 'toDate', type: 'datetime', required: true },
          { name: 'status', type: 'enum', options: ['reserved', 'checked_out', 'checked_in', 'completed'], required: true },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      }
    },
    // Additional entities: stockMoves, equipmentConditions, maintenanceSchedule, etc.
    // (simplified for LSP compliance - full definitions would include all fields)
  ];
  
  tools: ModuleTool[] = logisticaTools;
  
  routes: RouteDefinition[] = logisticaRoutes as any;
  
  workflows: WorkflowDefinition[] = logisticaWorkflows as any;

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[LogisticaModule] Installing for tenant ${tenantId}`);
      
      // Create default central warehouse
      const { warehouses } = await import('../../../shared/schema.js');
      await db.insert(warehouses).values({
        tenantId,
        name: 'Armazém Central',
        type: 'central',
        isActive: true,
        availableForProjects: false,
      });
      
      console.log(`[LogisticaModule] Default warehouse created for tenant ${tenantId}`);
    },

    onUninstall: async (tenantId: string) => {
      console.log(`[LogisticaModule] Uninstalling for tenant ${tenantId}`);
      // TODO: Archive or soft-delete logistics data
    },

    onActivate: async (tenantId: string) => {
      console.log(`[LogisticaModule] Activated for tenant ${tenantId}`);
    },

    onDeactivate: async (tenantId: string) => {
      console.log(`[LogisticaModule] Deactivated for tenant ${tenantId}`);
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
      createQuery: () => new LogisticaQueryBuilder(tenantId),
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        switch (metric) {
          case 'total_warehouses':
            return await new LogisticaQueryBuilder(tenantId).select('warehouses').count();
          
          case 'total_stock': {
            const levels = await new LogisticaQueryBuilder(tenantId)
              .select('inventoryLevels')
              .execute();
            return levels.reduce((sum: number, level: any) => sum + parseFloat(level.qtyOnHand || 0), 0);
          }
          
          case 'total_allocations':
            return await new LogisticaQueryBuilder(tenantId).select('equipmentAllocations').count();
          
          case 'active_allocations': {
            const allocations = await new LogisticaQueryBuilder(tenantId)
              .select('equipmentAllocations')
              .where([{ field: 'status', operator: 'eq', value: 'checked_out' }])
              .execute();
            return allocations.length;
          }
          
          case 'available_equipment': {
            const levels = await new LogisticaQueryBuilder(tenantId)
              .select('inventoryLevels')
              .execute();
            return levels.reduce((sum: number, level: any) => {
              const available = parseFloat(level.qtyOnHand || 0) - parseFloat(level.qtyReserved || 0);
              return sum + available;
            }, 0);
          }
          
          case 'pending_maintenance': {
            const maintenance = await new LogisticaQueryBuilder(tenantId)
              .select('maintenanceSchedule')
              .where([{ field: 'status', operator: 'eq', value: 'due' }])
              .execute();
            return maintenance.length;
          }
          
          case 'low_stock_count': {
            const levels = await new LogisticaQueryBuilder(tenantId)
              .select('inventoryLevels')
              .execute();
            return levels.filter((level: any) => 
              parseFloat(level.qtyOnHand || 0) < parseFloat(level.minThreshold || 0)
            ).length;
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
        const query = new LogisticaQueryBuilder(tenantId);
        const results = await query
          .select(entityName)
          .where([{ field: 'id', operator: 'eq', value: id }])
          .execute();
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        const query = new LogisticaQueryBuilder(tenantId);
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
    console.log(`[LogisticaModule] Initialized for tenant ${tenantId}`);
  }

  async healthCheck(): Promise<boolean> {
    return true; // TODO: Verify DB connection, etc
  }
  
  /**
   * Helper to get table for entity name
   */
  private getTableForEntity(entityName: string): any {
    const { 
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
    } = require('../../../shared/schema');
    
    switch (entityName) {
      case 'warehouses':
        return warehouses;
      case 'warehouseLocations':
        return warehouseLocations;
      case 'inventoryLevels':
        return inventoryLevels;
      case 'inventoryBatches':
        return inventoryBatches;
      case 'inventoryTransactions':
        return inventoryTransactions;
      case 'inventoryCounts':
        return inventoryCounts;
      case 'stockAlerts':
        return stockAlerts;
      case 'stockMoves':
        return stockMoves;
      case 'equipmentAllocations':
        return equipmentAllocations;
      case 'equipmentConditions':
        return equipmentConditions;
      case 'pickingBatches':
        return pickingBatches;
      case 'reorderingRules':
        return reorderingRules;
      case 'maintenanceSchedule':
        return maintenanceSchedule;
      default:
        return null;
    }
  }
}

export function createLogisticaModule(): IModule {
  return new LogisticaModule();
}
