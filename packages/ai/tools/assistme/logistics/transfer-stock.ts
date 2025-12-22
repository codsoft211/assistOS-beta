import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryTransactions, inventoryLevels } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class TransferStockTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'transfer_stock',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Transfere stock entre armazéns',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto',
        required: true
      },
      {
        name: 'fromWarehouseId',
        type: 'string',
        description: 'Armazém de origem',
        required: true
      },
      {
        name: 'toWarehouseId',
        type: 'string',
        description: 'Armazém de destino',
        required: true
      },
      {
        name: 'quantity',
        type: 'number',
        description: 'Quantidade a transferir',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas/observações',
        required: false
      }
    ],
    outputSchema: z.object({
      transferId: z.string(),
      status: z.enum(['pending', 'in_transit', 'completed']),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    // Wrap in transaction for atomicity with row-level locking
    const result = await db.transaction(async (tx) => {
      // 1. Read source warehouse with row-level lock (forUpdate) INSIDE transaction
      const fromLevel = await tx.query.inventoryLevels.findFirst({
        where: and(
          eq(inventoryLevels.tenantId, context.tenantId),
          eq(inventoryLevels.productId, input.productId),
          eq(inventoryLevels.warehouseId, input.fromWarehouseId)
        )
      }).forUpdate();

      // 2. Validate stock availability INSIDE transaction with locked data
      const currentQty = fromLevel ? parseFloat(fromLevel.qtyOnHand) : 0;
      if (!fromLevel || currentQty < input.quantity) {
        throw new Error(`Stock insuficiente: ${currentQty} disponível, ${input.quantity} solicitado`);
      }

      // 3. UPSERT destination warehouse (safe concurrent insert)
      await tx.insert(inventoryLevels)
        .values({
          tenantId: context.tenantId,
          productId: input.productId,
          warehouseId: input.toWarehouseId,
          qtyOnHand: '0',
          qtyReserved: '0'
        })
        .onConflictDoNothing({
          target: [inventoryLevels.warehouseId, inventoryLevels.productId]
        });

      // 4. Lock destination warehouse (now guaranteed to exist)
      const toLevel = await tx.query.inventoryLevels.findFirst({
        where: and(
          eq(inventoryLevels.tenantId, context.tenantId),
          eq(inventoryLevels.productId, input.productId),
          eq(inventoryLevels.warehouseId, input.toWarehouseId)
        )
      }).forUpdate();

      // 5. Insert transfer transaction
      const [transaction] = await tx.insert(inventoryTransactions).values({
        tenantId: context.tenantId,
        type: 'transfer',
        productId: input.productId,
        warehouseFromId: input.fromWarehouseId,
        warehouseToId: input.toWarehouseId,
        qty: input.quantity.toString(),
        performedBy: context.userId,
        notes: input.notes
      }).returning();

      // 6. Update source warehouse (decrease)
      const newSourceQty = currentQty - input.quantity;
      await tx.update(inventoryLevels)
        .set({ qtyOnHand: newSourceQty.toString() })
        .where(eq(inventoryLevels.id, fromLevel.id));

      // 7. Update destination warehouse (increase) - guaranteed to exist after UPSERT
      const toCurrentQty = parseFloat(toLevel!.qtyOnHand);
      const newDestQty = toCurrentQty + input.quantity;
      await tx.update(inventoryLevels)
        .set({ qtyOnHand: newDestQty.toString() })
        .where(eq(inventoryLevels.id, toLevel!.id));

      return transaction;
    });
    
    return {
      transferId: result.id,
      status: 'completed' as const,
      message: `Transferência ${result.id} criada: ${input.quantity} unidades de ${input.fromWarehouseId} → ${input.toWarehouseId}. Status: Completo`
    };
  }
}
