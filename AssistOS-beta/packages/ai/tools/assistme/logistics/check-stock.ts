import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryLevels, reorderingRules } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class CheckStockTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'check_stock',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Verifica o stock disponível de um produto específico',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto',
        required: true
      },
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém (opcional - se não fornecido mostra stock total)',
        required: false
      }
    ],
    outputSchema: z.object({
      productId: z.string(),
      availableQuantity: z.number(),
      reservedQuantity: z.number(),
      reorderLevel: z.number().optional(),
      status: z.enum(['in_stock', 'low_stock', 'out_of_stock']),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      productId: string;
      warehouseId?: string;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [
      eq(inventoryLevels.tenantId, context.tenantId),
      eq(inventoryLevels.productId, input.productId)
    ];

    if (input.warehouseId) {
      conditions.push(eq(inventoryLevels.warehouseId, input.warehouseId));
    }

    const levels = await db.select().from(inventoryLevels)
      .where(and(...conditions));

    if (levels.length === 0) {
      return {
        productId: input.productId,
        availableQuantity: 0,
        reservedQuantity: 0,
        status: 'out_of_stock' as const,
        message: `Produto não encontrado${input.warehouseId ? ` no armazém ${input.warehouseId}` : ''}`
      };
    }

    const totalQty = levels.reduce((sum, l) => sum + parseFloat(l.qtyOnHand), 0);
    const reserved = levels.reduce((sum, l) => sum + parseFloat(l.qtyReserved || '0'), 0);
    
    // Get reorder point from first level or from reordering rules
    let reorderLevel: number | undefined;
    if (levels[0].reorderPoint) {
      reorderLevel = parseFloat(levels[0].reorderPoint);
    } else {
      // Try to get from reordering rules
      const rules = await db.select().from(reorderingRules)
        .where(and(
          eq(reorderingRules.tenantId, context.tenantId),
          eq(reorderingRules.productId, input.productId),
          eq(reorderingRules.isActive, true)
        ))
        .limit(1);
      
      if (rules.length > 0) {
        reorderLevel = parseFloat(rules[0].minQty);
      }
    }

    const status = totalQty === 0 ? 'out_of_stock' : 
                   (reorderLevel && totalQty < reorderLevel) ? 'low_stock' : 'in_stock';
    
    const warehouseInfo = input.warehouseId ? ` no armazém ${input.warehouseId}` : '';
    const statusLabel = status === 'in_stock' ? 'Stock OK' : 
                       status === 'low_stock' ? 'Stock Baixo' : 'Sem Stock';
    
    return {
      productId: input.productId,
      availableQuantity: totalQty,
      reservedQuantity: reserved,
      reorderLevel,
      status,
      message: `Stock${warehouseInfo}: ${totalQty} unidades disponíveis, ${reserved} reservadas. Status: ${statusLabel}`
    };
  }
}
