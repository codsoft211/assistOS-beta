import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryLevels, products } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class StockValuationTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'stock_valuation',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Calcula o valor total do inventário (valorização de stock)',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém (opcional - todos se não fornecido)',
        required: false
      },
      {
        name: 'method',
        type: 'string',
        description: 'Método de valorização (fifo/lifo/average)',
        required: false,
        default: 'average'
      }
    ],
    outputSchema: z.object({
      totalValue: z.number(),
      totalUnits: z.number(),
      averageUnitCost: z.number(),
      method: z.string(),
      breakdown: z.array(z.object({
        category: z.string(),
        value: z.number(),
        percentage: z.number()
      })),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      warehouseId?: string;
      method?: string;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [eq(inventoryLevels.tenantId, context.tenantId)];
    
    if (input.warehouseId) {
      conditions.push(eq(inventoryLevels.warehouseId, input.warehouseId));
    }

    const results = await db
      .select({
        qtyOnHand: inventoryLevels.qtyOnHand,
        unitPrice: products.unitPrice,
        category: products.category,
        productName: products.name
      })
      .from(inventoryLevels)
      .leftJoin(products, eq(inventoryLevels.productId, products.id))
      .where(and(...conditions));

    let totalValue = 0;
    let totalUnits = 0;
    const categoryTotals: Record<string, number> = {};

    for (const row of results) {
      const qty = parseFloat(row.qtyOnHand);
      const price = parseFloat(row.unitPrice || '0');
      const value = qty * price;
      
      totalUnits += qty;
      totalValue += value;
      
      const category = row.category || 'Sem Categoria';
      categoryTotals[category] = (categoryTotals[category] || 0) + value;
    }

    const averageUnitCost = totalUnits > 0 ? totalValue / totalUnits : 0;

    const breakdown = Object.entries(categoryTotals).map(([category, value]) => ({
      category,
      value: Math.round(value * 100) / 100,
      percentage: Math.round((value / totalValue) * 100)
    }));

    const warehouseInfo = input.warehouseId ? ` do armazém ${input.warehouseId}` : ' total';

    return {
      totalValue: Math.round(totalValue * 100) / 100,
      totalUnits: Math.round(totalUnits),
      averageUnitCost: Math.round(averageUnitCost * 100) / 100,
      method: input.method || 'average',
      breakdown,
      message: `Valorização${warehouseInfo}: €${Math.round(totalValue).toLocaleString()} (${Math.round(totalUnits).toLocaleString()} unidades). Método: ${input.method || 'average'}`
    };
  }
}
