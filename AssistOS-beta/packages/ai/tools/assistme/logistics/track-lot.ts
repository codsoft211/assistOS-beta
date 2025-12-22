import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryBatches, inventoryTransactions, products } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class TrackLotTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'track_lot',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Rastreia lote ou número de série de produtos (rastreabilidade)',
    parameters: [
      {
        name: 'lotNumber',
        type: 'string',
        description: 'Número do lote ou série',
        required: true
      },
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto (opcional)',
        required: false
      }
    ],
    outputSchema: z.object({
      lotNumber: z.string(),
      productId: z.string(),
      productName: z.string(),
      manufacturingDate: z.string(),
      expiryDate: z.string().optional(),
      currentQuantity: z.number(),
      movements: z.array(z.object({
        date: z.string(),
        type: z.string(),
        quantity: z.number(),
        location: z.string()
      })),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      lotNumber: string;
      productId?: string;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [
      eq(inventoryBatches.tenantId, context.tenantId),
      eq(inventoryBatches.batchNumber, input.lotNumber)
    ];

    if (input.productId) {
      conditions.push(eq(inventoryBatches.productId, input.productId));
    }

    const [batch] = await db
      .select({
        batchNumber: inventoryBatches.batchNumber,
        productId: inventoryBatches.productId,
        productName: products.name,
        warehouseId: inventoryBatches.warehouseId,
        qtyBatchOnHand: inventoryBatches.qtyBatchOnHand,
        expiryDate: inventoryBatches.expiryDate,
        createdAt: inventoryBatches.createdAt,
      })
      .from(inventoryBatches)
      .leftJoin(products, eq(inventoryBatches.productId, products.id))
      .where(and(...conditions))
      .limit(1);

    if (!batch) {
      throw new Error(`Lote ${input.lotNumber} não encontrado`);
    }

    // Get movements for this batch
    const transactions = await db.select()
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.tenantId, context.tenantId),
        eq(inventoryTransactions.batchId, input.lotNumber)
      ))
      .orderBy(inventoryTransactions.createdAt);

    const movements = transactions.map(t => {
      const isIncoming = t.type === 'receipt' || t.type === 'transfer';
      const qty = parseFloat(t.qty);
      return {
        date: t.createdAt.toISOString().split('T')[0],
        type: t.type === 'receipt' ? 'Receção' :
              t.type === 'shipment' ? 'Saída' :
              t.type === 'transfer' ? 'Transferência' : t.type,
        quantity: isIncoming ? qty : -qty,
        location: t.warehouseToId || t.warehouseFromId || 'N/A'
      };
    });
    
    const currentQuantity = parseFloat(batch.qtyBatchOnHand);
    const manufacturingDate = batch.createdAt.toISOString().split('T')[0];
    const expiryDate = batch.expiryDate?.toISOString().split('T')[0];
    
    return {
      lotNumber: batch.batchNumber,
      productId: batch.productId,
      productName: batch.productName || 'Produto sem nome',
      manufacturingDate,
      expiryDate,
      currentQuantity,
      movements,
      message: `Lote ${batch.batchNumber}: ${movements.length} movimentos registados. Quantidade atual: ${currentQuantity} unidades${expiryDate ? `. Validade: ${expiryDate}` : ''}`
    };
  }
}
