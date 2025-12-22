/**
 * Inventory Module - Route Definitions
 */

import type { RouteDefinition } from '../../base/module.interface';

export const inventarioRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/items',
    handler: 'listItems',
    permissions: ['inventario.items.view'],
    description: 'List all items with optional filters'
  },
  {
    method: 'GET',
    path: '/items/:id',
    handler: 'getItem',
    permissions: ['inventario.items.view'],
    description: 'Get item by ID'
  },
  {
    method: 'POST',
    path: '/items',
    handler: 'createItem',
    permissions: ['inventario.items.create'],
    description: 'Create new item'
  },
  {
    method: 'PATCH',
    path: '/items/:id',
    handler: 'updateItem',
    permissions: ['inventario.items.edit'],
    description: 'Update item'
  },
  {
    method: 'DELETE',
    path: '/items/:id',
    handler: 'deleteItem',
    permissions: ['inventario.items.delete'],
    description: 'Delete item'
  },
  {
    method: 'GET',
    path: '/categories',
    handler: 'listCategories',
    permissions: ['inventario.items.view'],
    description: 'List all categories'
  },
  {
    method: 'POST',
    path: '/categories',
    handler: 'createCategory',
    permissions: ['inventario.categories.manage'],
    description: 'Create category'
  },
  {
    method: 'GET',
    path: '/uoms',
    handler: 'listUoms',
    permissions: ['inventario.uom.manage'],
    description: 'List units of measure'
  },
  {
    method: 'POST',
    path: '/uoms',
    handler: 'createUom',
    permissions: ['inventario.uom.manage'],
    description: 'Create unit of measure'
  },
  {
    method: 'GET',
    path: '/recipes',
    handler: 'listRecipes',
    permissions: ['inventario.bom.view'],
    description: 'List recipes/BOMs'
  },
  {
    method: 'GET',
    path: '/recipes/:id',
    handler: 'getRecipe',
    permissions: ['inventario.bom.view'],
    description: 'Get recipe with ingredients'
  },
  {
    method: 'POST',
    path: '/recipes',
    handler: 'createRecipe',
    permissions: ['inventario.bom.manage'],
    description: 'Create recipe/BOM'
  },
  {
    method: 'PATCH',
    path: '/recipes/:id',
    handler: 'updateRecipe',
    permissions: ['inventario.bom.manage'],
    description: 'Update recipe'
  },
  {
    method: 'POST',
    path: '/recipes/:id/calculate-cost',
    handler: 'calculateRecipeCost',
    permissions: ['inventario.costing.view'],
    description: 'Calculate recipe cost'
  },
  {
    method: 'GET',
    path: '/items/:id/suppliers',
    handler: 'getItemSuppliers',
    permissions: ['inventario.suppliers.view'],
    description: 'Get item suppliers'
  },
  {
    method: 'POST',
    path: '/items/:id/suppliers',
    handler: 'addItemSupplier',
    permissions: ['inventario.suppliers.manage'],
    description: 'Add supplier to item'
  },
  {
    method: 'GET',
    path: '/costing/:id',
    handler: 'getItemCosting',
    permissions: ['inventario.costing.view'],
    description: 'Get item costing breakdown'
  },
  {
    method: 'GET',
    path: '/low-stock',
    handler: 'lowStockAdvisory',
    permissions: ['inventario.items.view'],
    description: 'Get low stock items'
  }
];
