import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryCounts, inventoryLevels } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class StockCountTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'stock_count',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Inicia uma contagem física de inventário (stock take)',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém',
        required: true
      },
      {
        name: 'countType',
        type: 'string',
        description: 'Tipo de contagem (full/partial/cycle)',
        required: false,
        default: 'cycle'
      },
      {
        name: 'productIds',
        type: 'array',
        description: 'IDs de produtos específicos (para contagem parcial)',
        required: false
      },
      {
        name: 'scheduledDate',
        type: 'string',
        description: 'Data agendada (YYYY-MM-DD)',
        required: false
      }
    ],
    outputSchema: z.object({
      countId: z.string(),
      countType: z.string(),
      itemsToCount: z.number(),
      status: z.enum(['scheduled', 'in_progress', 'completed']),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      warehouseId: string;
      countType?: string;
      productIds?: string[];
      scheduledDate?: string;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [
      eq(inventoryLevels.tenantId, context.tenantId),
      eq(inventoryLevels.warehouseId, input.warehouseId)
    ];

    // Get items to count
    const itemsToCount = await db.select().from(inventoryLevels)
      .where(and(...conditions));

    const countedItems = input.productIds 
      ? itemsToCount.filter(item => input.productIds!.includes(item.productId))
      : itemsToCount;

    // Create inventory count records for each item
    const countRecords = await Promise.all(
      countedItems.map(async (item) => {
        const systemQty = parseFloat(item.qtyOnHand);
        // For now, use system qty as counted qty (to be updated later)
        const [countRecord] = await db.insert(inventoryCounts).values({
          tenantId: context.tenantId,
          warehouseId: input.warehouseId,
          productId: item.productId,
          countedQty: systemQty.toString(),
          systemQty: systemQty.toString(),
          delta: '0',
          countedBy: context.userId,
          justification: `Contagem ${input.countType || 'cycle'} - ${input.scheduledDate ? 'Agendada' : 'Em progresso'}`
        }).returning();
        return countRecord;
      })
    );

    const countId = countRecords[0]?.id || `CNT-${Date.now()}`;
    
    const countTypeLabel = input.countType === 'full' ? 'completa' :
                          input.countType === 'partial' ? 'parcial' : 'cíclica';
    
    return {
      countId,
      countType: input.countType || 'cycle',
      itemsToCount: countRecords.length,
      status: input.scheduledDate ? 'scheduled' as const : 'in_progress' as const,
      message: `Contagem ${countTypeLabel} ${countId} iniciada no armazém ${input.warehouseId}. ${countRecords.length} item(s) a contar${input.scheduledDate ? `. Agendada para ${input.scheduledDate}` : ''}`
    };
  }
}
