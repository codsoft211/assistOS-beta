import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryLevels, products } from 'shared/schema';
import { eq, and, sql, lt } from 'drizzle-orm';

export class ListStockItemsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_stock_items',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os itens em stock com seus níveis atuais',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém (opcional)',
        required: false
      },
      {
        name: 'lowStockOnly',
        type: 'boolean',
        description: 'Mostrar apenas itens com stock baixo',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    outputSchema: z.object({
      items: z.array(z.object({
        productId: z.string(),
        productName: z.string(),
        quantity: z.number(),
        reorderLevel: z.number(),
        status: z.string()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      warehouseId?: string;
      lowStockOnly?: boolean;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [eq(inventoryLevels.tenantId, context.tenantId)];
    
    if (input.warehouseId) {
      conditions.push(eq(inventoryLevels.warehouseId, input.warehouseId));
    }

    const results = await db
      .select({
        productId: inventoryLevels.productId,
        productName: products.name,
        qtyOnHand: inventoryLevels.qtyOnHand,
        reorderPoint: inventoryLevels.reorderPoint,
        minThreshold: inventoryLevels.minThreshold,
      })
      .from(inventoryLevels)
      .leftJoin(products, eq(inventoryLevels.productId, products.id))
      .where(and(...conditions))
      .limit(input.limit || 50);

    const items = results.map(row => {
      const quantity = parseFloat(row.qtyOnHand);
      const reorderLevel = parseFloat(row.reorderPoint || row.minThreshold || '0');
      const status = quantity === 0 ? 'out_of_stock' :
                    quantity < reorderLevel ? 'low_stock' : 'in_stock';
      
      return {
        productId: row.productId,
        productName: row.productName || 'Produto sem nome',
        quantity,
        reorderLevel,
        status
      };
    });

    const filtered = input.lowStockOnly 
      ? items.filter(item => item.status !== 'in_stock')
      : items;

    return {
      items: filtered,
      total: filtered.length,
      message: `Encontrados ${filtered.length} itens em stock${input.lowStockOnly ? ' (apenas stock baixo)' : ''}`
    };
  }
}
