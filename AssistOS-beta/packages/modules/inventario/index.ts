/**
 * InventarioModule - Central Item & Material Management
 * 
 * The Inventory module is the central system of record for all items and materials.
 * It provides a unified, tenant-specific product catalog and supports all downstream
 * modules such as Sales, Purchasing, Operations, and Finance.
 * 
 * Features:
 * - Item Master (products, raw materials, semi-finished, packaging, services)
 * - BOM/Recipes/Component Structure (optional per tenant)
 * - Units of Measure (UoM) system with conversions
 * - Categories & Classification
 * - Costing Logic (standard, average, last purchase, component-driven)
 * - Supplier Information (light integration)
 * 
 * What this module does NOT do:
 * - Sales prices/price lists (Sales module)
 * - Procurement workflows (Purchasing module)
 * - Accounting rules/taxes (Finance module)
 * - Event/operational workflows (Operations/Projects)
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
import { inventarioTools } from './tools';
import { inventarioRoutes } from './routes';

export class InventarioModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'inventory',
    name: 'Inventory',
    version: '1.0.0',
    category: 'operations',
    description: 'Central item & material management - the master data layer for Sales, Purchasing, Operations, and Finance',
    icon: 'Package',
    dependencies: [],
    permissions: [
      { key: 'inventory.items.view', name: 'View Items' },
      { key: 'inventory.items.create', name: 'Create Items' },
      { key: 'inventory.items.edit', name: 'Edit Items' },
      { key: 'inventory.items.delete', name: 'Delete Items' },
      { key: 'inventory.categories.manage', name: 'Manage Categories' },
      { key: 'inventory.uom.manage', name: 'Manage Units of Measure' },
      { key: 'inventory.bom.view', name: 'View BOMs/Recipes' },
      { key: 'inventory.bom.manage', name: 'Manage BOMs/Recipes' },
      { key: 'inventory.costing.view', name: 'View Costing' },
      { key: 'inventory.costing.manage', name: 'Manage Costing' },
      { key: 'inventory.suppliers.view', name: 'View Supplier Links' },
      { key: 'inventory.suppliers.manage', name: 'Manage Supplier Links' },
      { key: 'inventory.dashboard', name: 'View Inventory Dashboard' }
    ]
  };
  
  entities: EntityDefinition[] = [
    {
      name: 'products',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'itemType', type: 'enum', options: ['RAW', 'SALE', 'SEMI', 'SERVICE', 'PACKAGING'], required: true },
          { name: 'isSellable', type: 'boolean', required: true },
          { name: 'isPurchasable', type: 'boolean', required: true },
          { name: 'price', type: 'decimal' },
          { name: 'cost', type: 'decimal' },
          { name: 'calculatedCost', type: 'decimal' },
          { name: 'defaultUomId', type: 'relation', ref: 'uoms' },
          { name: 'storageUomId', type: 'relation', ref: 'uoms' },
          { name: 'stock', type: 'number' },
          { name: 'trackingType', type: 'enum', options: ['NONE', 'BATCH', 'LOT', 'SERIAL'] },
          { name: 'category', type: 'text' },
          { name: 'subcategory', type: 'text' },
          { name: 'isActive', type: 'boolean', required: true }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      indexes: [
        { fields: ['code'], unique: false },
        { fields: ['itemType'] },
        { fields: ['category'] }
      ]
    },
    {
      name: 'itemCategories',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'parentId', type: 'relation', ref: 'itemCategories' },
          { name: 'description', type: 'text' },
          { name: 'isActive', type: 'boolean', required: true }
        ],
        timestamps: true,
        tenantIsolation: true
      }
    },
    {
      name: 'uoms',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'symbol', type: 'text', required: true },
          { name: 'category', type: 'enum', options: ['weight', 'volume', 'units', 'time', 'length'], required: true },
          { name: 'isBase', type: 'boolean', required: true }
        ],
        timestamps: true,
        tenantIsolation: true
      }
    },
    {
      name: 'uomConversions',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'fromUomId', type: 'relation', ref: 'uoms', required: true },
          { name: 'toUomId', type: 'relation', ref: 'uoms', required: true },
          { name: 'conversionFactor', type: 'decimal', required: true }
        ],
        timestamps: true,
        tenantIsolation: true
      }
    },
    {
      name: 'recipes',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'productId', type: 'relation', ref: 'products', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'version', type: 'number', required: true },
          { name: 'isActive', type: 'boolean', required: true },
          { name: 'yield', type: 'decimal' },
          { name: 'yieldUomId', type: 'relation', ref: 'uoms' },
          { name: 'lossFactor', type: 'decimal' },
          { name: 'calculatedCost', type: 'decimal' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      }
    },
    {
      name: 'recipeIngredients',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'recipeId', type: 'relation', ref: 'recipes', required: true },
          { name: 'ingredientId', type: 'relation', ref: 'products', required: true },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'uomId', type: 'relation', ref: 'uoms', required: true },
          { name: 'lossFactor', type: 'decimal' },
          { name: 'notes', type: 'text' },
          { name: 'sortOrder', type: 'number' }
        ],
        timestamps: true,
        tenantIsolation: true
      }
    },
    {
      name: 'itemSuppliers',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'productId', type: 'relation', ref: 'products', required: true },
          { name: 'supplierId', type: 'relation', ref: 'suppliers', required: true },
          { name: 'supplierProductCode', type: 'text' },
          { name: 'purchaseUomId', type: 'relation', ref: 'uoms' },
          { name: 'lastPurchasePrice', type: 'decimal' },
          { name: 'leadTimeDays', type: 'number' },
          { name: 'isPreferred', type: 'boolean' }
        ],
        timestamps: true,
        tenantIsolation: true
      }
    }
  ];
  
  workflows: WorkflowDefinition[] = [
    {
      name: 'Item Lifecycle',
      entity: 'products',
      states: [
        { key: 'draft', label: 'Rascunho', color: '#6B7280', isInitial: true },
        { key: 'active', label: 'Ativo', color: '#10B981' },
        { key: 'inactive', label: 'Inativo', color: '#F59E0B' },
        { key: 'discontinued', label: 'Descontinuado', color: '#EF4444', isFinal: true }
      ],
      transitions: [
        { from: 'draft', to: 'active', action: 'activate', label: 'Ativar' },
        { from: 'active', to: 'inactive', action: 'deactivate', label: 'Desativar' },
        { from: 'inactive', to: 'active', action: 'reactivate', label: 'Reativar' },
        { from: '*', to: 'discontinued', action: 'discontinue', label: 'Descontinuar' }
      ]
    }
  ];

  tools: ModuleTool[] = inventarioTools;
  routes: RouteDefinition[] = inventarioRoutes;

  hooks: ModuleHooks = {
    async onActivate(tenantId: string) {
      console.log(`[InventarioModule] Activated for tenant ${tenantId}`);
    },
    
    async onDeactivate(tenantId: string) {
      console.log(`[InventarioModule] Deactivated for tenant ${tenantId}`);
    }
  };

  async getData(filters?: Filter[]): Promise<any> {
    // Return raw data for backward compatibility
    return {
      summary: {},
      items: []
    };
  }

  setTenantContext(tenantId: string): void {
    this.tenantId = tenantId;
  }

  exposeData(): ModuleDataInterface {
    if (!this.tenantId) {
      throw new Error('Module not initialized - call setTenantContext() first');
    }

    const tenantId = this.tenantId;

    return {
      createQuery: () => {
        throw new Error('Query builder not implemented for Inventario module');
      },

      aggregate: async (metric: string, filters?: Filter[]) => {
        switch (metric) {
          case 'products_count':
            return 0;
          case 'recipes_count':
            return 0;
          default:
            return 0;
        }
      },

      export: async (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => {
        return Buffer.from('[]');
      },

      getSchema: () => ({
        entities: this.entities,
        workflows: this.workflows,
        relationships: [] // No cross-module relationships defined
      }),

      getEntity: async (entityName: string, id: string) => {
        return null;
      },

      listEntities: async (entityName: string, filters?: Filter[]) => {
        return [];
      },

      createEntity: async (entityName: string, data: any) => {
        throw new Error('createEntity not implemented for Inventario module');
      },

      updateEntity: async (entityName: string, id: string, data: any) => {
        throw new Error('updateEntity not implemented for Inventario module');
      },

      deleteEntity: async (entityName: string, id: string) => {
        throw new Error('deleteEntity not implemented for Inventario module');
      }
    };
  }
}

export const inventarioModule = new InventarioModule();

export function createInventarioModule(): InventarioModule {
  return new InventarioModule();
}
