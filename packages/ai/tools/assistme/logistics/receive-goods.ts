import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryTransactions, inventoryLevels } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ReceiveGoodsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'receive_goods',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Regista receção de mercadorias (entrada de stock via PO)',
    parameters: [
      {
        name: 'purchaseOrderId',
        type: 'string',
        description: 'ID da ordem de compra',
        required: true
      },
      {
        name: 'warehouseId',
        type: 'string',
        description: 'Armazém de destino',
        required: true
      },
      {
        name: 'receivedItems',
        type: 'array',
        description: 'Lista de itens recebidos com quantidades [{productId, quantity}]',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Observações (danos, diferenças)',
        required: false
      }
    ],
    outputSchema: z.object({
      receiptId: z.string(),
      purchaseOrderId: z.string(),
      status: z.enum(['complete', 'partial', 'discrepancy']),
      receivedItems: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      purchaseOrderId: string;
      warehouseId: string;
      receivedItems: Array<{ productId: string; quantity: number }>;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    const items = Array.isArray(input.receivedItems) ? input.receivedItems : [];
    
    // Wrap in transaction for atomicity
    const receipt = await db.transaction(async (tx) => {
      // Create a master receipt transaction
      const [rec] = await tx.insert(inventoryTransactions).values({
        tenantId: context.tenantId,
        type: 'receipt',
        productId: null,
        warehouseToId: input.warehouseId,
        qty: items.reduce((sum, item) => sum + item.quantity, 0).toString(),
        linkedDocumentId: input.purchaseOrderId,
        performedBy: context.userId,
        notes: input.notes,
        metadata: { items }
      }).returning();

      // Process each received item
      for (const item of items) {
        // 1. UPSERT first to ensure row exists (safe concurrent insert)
        await tx.insert(inventoryLevels)
          .values({
            tenantId: context.tenantId,
            productId: item.productId,
            warehouseId: input.warehouseId,
            qtyOnHand: '0',
            qtyReserved: '0'
          })
          .onConflictDoNothing({
            target: [inventoryLevels.warehouseId, inventoryLevels.productId]
          });

        // 2. Lock the row INSIDE transaction (guaranteed to exist after UPSERT)
        const currentLevel = await tx.query.inventoryLevels.findFirst({
          where: and(
            eq(inventoryLevels.tenantId, context.tenantId),
            eq(inventoryLevels.productId, item.productId),
            eq(inventoryLevels.warehouseId, input.warehouseId)
          )
        }).forUpdate();

        // 3. Insert individual receipt transaction
        await tx.insert(inventoryTransactions).values({
          tenantId: context.tenantId,
          type: 'receipt',
          productId: item.productId,
          warehouseToId: input.warehouseId,
          qty: item.quantity.toString(),
          linkedDocumentId: input.purchaseOrderId,
          performedBy: context.userId,
          rootId: rec.id
        });

        // 4. Update inventory level atomically
        const currentQty = parseFloat(currentLevel!.qtyOnHand);
        const newQty = currentQty + item.quantity;
        await tx.update(inventoryLevels)
          .set({ qtyOnHand: newQty.toString() })
          .where(eq(inventoryLevels.id, currentLevel!.id));
      }

      return rec;
    });
    
    return {
      receiptId: receipt.id,
      purchaseOrderId: input.purchaseOrderId,
      status: 'complete' as const,
      receivedItems: items.length,
      message: `Receção ${receipt.id} completa: ${items.length} item(s) recebido(s) para PO ${input.purchaseOrderId}. Stock atualizado no armazém ${input.warehouseId}`
    };
  }
}
