import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryTransactions } from 'shared/schema';

export class CreatePickingListTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_picking_list',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Cria uma lista de picking para preparar encomendas',
    parameters: [
      {
        name: 'orderId',
        type: 'string',
        description: 'ID da encomenda',
        required: true
      },
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém',
        required: true
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Prioridade (high/normal/low)',
        required: false,
        default: 'normal'
      }
    ],
    outputSchema: z.object({
      pickingListId: z.string(),
      orderId: z.string(),
      items: z.array(z.object({
        productId: z.string(),
        productName: z.string(),
        quantity: z.number(),
        location: z.string()
      })),
      status: z.enum(['pending', 'in_progress', 'completed']),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      orderId: string;
      warehouseId: string;
      priority?: string;
    },
    context: ToolExecutionContext
  ) {
    // Create a picking list transaction record with metadata
    const pickingMetadata = {
      orderId: input.orderId,
      warehouseId: input.warehouseId,
      priority: input.priority || 'normal',
      status: 'pending',
      createdAt: new Date().toISOString(),
      items: [] as any[]
    };

    const [pickingRecord] = await db.insert(inventoryTransactions).values({
      tenantId: context.tenantId,
      type: 'picking',
      productId: null,
      warehouseFromId: input.warehouseId,
      qty: '0',
      performedBy: context.userId,
      notes: `Lista de picking para encomenda ${input.orderId}`,
      metadata: pickingMetadata
    }).returning();

    return {
      pickingListId: pickingRecord.id,
      orderId: input.orderId,
      items: [],
      status: 'pending' as const,
      message: `Lista de picking ${pickingRecord.id} criada para encomenda ${input.orderId}. Prioridade: ${input.priority || 'normal'}. Use transfer-stock para adicionar itens.`
    };
  }
}
