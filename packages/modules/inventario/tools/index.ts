/**
 * Inventory Module - AI Tools for AssistME
 * 
 * These tools allow AssistME to interact with the Inventory module.
 */

import type { ModuleTool } from '../../base/module.interface';

export const inventarioTools: ModuleTool[] = [
  {
    name: 'list_items',
    description: 'List all items/products in the inventory catalog. Can filter by type, category, or status.',
    parameters: {
      type: 'object',
      properties: {
        itemType: {
          type: 'string',
          enum: ['RAW', 'SALE', 'SEMI', 'SERVICE', 'PACKAGING'],
          description: 'Filter by item type'
        },
        category: {
          type: 'string',
          description: 'Filter by category name'
        },
        isSellable: {
          type: 'boolean',
          description: 'Filter by sellable items only'
        },
        isPurchasable: {
          type: 'boolean',
          description: 'Filter by purchasable items only'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active/inactive status'
        },
        search: {
          type: 'string',
          description: 'Search term to filter by name or code'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return (default: 50)'
        }
      },
      required: []
    },
    handler: 'inventario.listItems'
  },
  {
    name: 'get_item',
    description: 'Get detailed information about a specific item by ID or code',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Item ID'
        },
        code: {
          type: 'string',
          description: 'Item code'
        }
      },
      required: []
    },
    handler: 'inventario.getItem'
  },
  {
    name: 'create_item',
    description: 'Create a new item in the inventory catalog',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Unique item code'
        },
        name: {
          type: 'string',
          description: 'Item name'
        },
        description: {
          type: 'string',
          description: 'Item description'
        },
        itemType: {
          type: 'string',
          enum: ['RAW', 'SALE', 'SEMI', 'SERVICE', 'PACKAGING'],
          description: 'Item type classification'
        },
        isSellable: {
          type: 'boolean',
          description: 'Can this item be sold?'
        },
        isPurchasable: {
          type: 'boolean',
          description: 'Can this item be purchased?'
        },
        cost: {
          type: 'number',
          description: 'Purchase/production cost'
        },
        price: {
          type: 'number',
          description: 'Sale price (if sellable)'
        },
        category: {
          type: 'string',
          description: 'Item category'
        }
      },
      required: ['code', 'name', 'itemType']
    },
    handler: 'inventario.createItem'
  },
  {
    name: 'update_item',
    description: 'Update an existing item in the inventory catalog',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Item ID to update'
        },
        name: {
          type: 'string',
          description: 'New item name'
        },
        description: {
          type: 'string',
          description: 'New item description'
        },
        cost: {
          type: 'number',
          description: 'New purchase/production cost'
        },
        price: {
          type: 'number',
          description: 'New sale price'
        },
        category: {
          type: 'string',
          description: 'New category'
        },
        isActive: {
          type: 'boolean',
          description: 'Active status'
        }
      },
      required: ['id']
    },
    handler: 'inventario.updateItem'
  },
  {
    name: 'get_item_costing',
    description: 'Get detailed costing breakdown for an item, including recipe/BOM costs if applicable',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Item ID'
        }
      },
      required: ['id']
    },
    handler: 'inventario.getItemCosting'
  },
  {
    name: 'list_recipes',
    description: 'List all recipes/BOMs for producing items',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'Filter by product ID'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active recipes only'
        }
      },
      required: []
    },
    handler: 'inventario.listRecipes'
  },
  {
    name: 'get_recipe',
    description: 'Get detailed recipe/BOM with all ingredients',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Recipe ID'
        }
      },
      required: ['id']
    },
    handler: 'inventario.getRecipe'
  },
  {
    name: 'calculate_recipe_cost',
    description: 'Calculate the total cost of a recipe based on current ingredient prices',
    parameters: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'string',
          description: 'Recipe ID to calculate'
        }
      },
      required: ['recipeId']
    },
    handler: 'inventario.calculateRecipeCost'
  },
  {
    name: 'list_categories',
    description: 'List all item categories',
    parameters: {
      type: 'object',
      properties: {
        parentId: {
          type: 'string',
          description: 'Filter by parent category (for subcategories)'
        }
      },
      required: []
    },
    handler: 'inventario.listCategories'
  },
  {
    name: 'list_uoms',
    description: 'List all units of measure',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['weight', 'volume', 'units', 'time', 'length'],
          description: 'Filter by UoM category'
        }
      },
      required: []
    },
    handler: 'inventario.listUoms'
  },
  {
    name: 'get_item_suppliers',
    description: 'Get supplier information for an item',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'Product ID'
        }
      },
      required: ['productId']
    },
    handler: 'inventario.getItemSuppliers'
  },
  {
    name: 'low_stock_advisory',
    description: 'Get items with low stock levels that may need replenishment',
    parameters: {
      type: 'object',
      properties: {
        threshold: {
          type: 'number',
          description: 'Stock threshold to consider as low (default: 10)'
        },
        category: {
          type: 'string',
          description: 'Filter by category'
        }
      },
      required: []
    },
    handler: 'inventario.lowStockAdvisory'
  }
];
