import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryTransactions, inventoryLevels } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class CreateStockMovementTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_stock_movement',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Cria um movimento de stock (entrada ou saída)',
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
        description: 'ID do armazém',
        required: true
      },
      {
        name: 'movementType',
        type: 'string',
        description: 'Tipo de movimento (in/out/adjustment)',
        required: true
      },
      {
        name: 'quantity',
        type: 'number',
        description: 'Quantidade',
        required: true
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Motivo do movimento',
        required: false
      },
      {
        name: 'reference',
        type: 'string',
        description: 'Referência (ex: número de PO, nota de entrega)',
        required: false
      }
    ],
    outputSchema: z.object({
      movementId: z.string(),
      productId: z.string(),
      quantity: z.number(),
      newStockLevel: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      productId: string;
      warehouseId: string;
      movementType: string;
      quantity: number;
      reason?: string;
      reference?: string;
    },
    context: ToolExecutionContext
  ) {
    const transactionType = input.movementType === 'in' ? 'receipt' :
                           input.movementType === 'out' ? 'shipment' : 'adjustment';

    // Wrap in transaction for atomicity with row-level locking
    const result = await db.transaction(async (tx) => {
      // 1. For 'in' movements, UPSERT first to ensure row exists (safe concurrent insert)
      if (input.movementType === 'in') {
        await tx.insert(inventoryLevels)
          .values({
            tenantId: context.tenantId,
            productId: input.productId,
            warehouseId: input.warehouseId,
            qtyOnHand: '0',
            qtyReserved: '0'
          })
          .onConflictDoNothing({
            target: [inventoryLevels.warehouseId, inventoryLevels.productId]
          });
      }

      // 2. Lock warehouse level (guaranteed to exist for 'in', may not exist for 'out')
      const currentLevel = await tx.query.inventoryLevels.findFirst({
        where: and(
          eq(inventoryLevels.tenantId, context.tenantId),
          eq(inventoryLevels.productId, input.productId),
          eq(inventoryLevels.warehouseId, input.warehouseId)
        )
      }).forUpdate();

      // 3. For outbound movements, validate stock availability INSIDE transaction with locked data
      if (input.movementType === 'out') {
        const availableQty = currentLevel ? parseFloat(currentLevel.qtyOnHand) : 0;
        if (!currentLevel || availableQty < input.quantity) {
          throw new Error(`Stock insuficiente: ${availableQty} disponível, ${input.quantity} solicitado`);
        }
      }

      // 4. Insert transaction
      const [transaction] = await tx.insert(inventoryTransactions).values({
        tenantId: context.tenantId,
        type: transactionType,
        productId: input.productId,
        warehouseToId: input.movementType === 'in' ? input.warehouseId : undefined,
        warehouseFromId: input.movementType === 'out' ? input.warehouseId : undefined,
        qty: input.quantity.toString(),
        reason: input.reason,
        linkedDocumentId: input.reference,
        performedBy: context.userId,
        notes: input.reference ? `Referência: ${input.reference}` : undefined
      }).returning();

      // 5. Update inventory level - guaranteed to exist for 'in' movements after UPSERT
      const currentQty = parseFloat(currentLevel!.qtyOnHand);
      const newStockLevel = input.movementType === 'in' 
        ? currentQty + input.quantity 
        : currentQty - input.quantity;

      await tx.update(inventoryLevels)
        .set({ qtyOnHand: newStockLevel.toString() })
        .where(eq(inventoryLevels.id, currentLevel!.id));

      return { transaction, newStockLevel };
    });

    const movementLabel = input.movementType === 'in' ? 'Entrada' : 
                          input.movementType === 'out' ? 'Saída' : 'Ajuste';

    return {
      movementId: result.transaction.id,
      productId: input.productId,
      quantity: input.quantity,
      newStockLevel: result.newStockLevel,
      message: `${movementLabel} de stock registrada: ${input.quantity} unidades. Stock atual: ${result.newStockLevel} unidades. Movimento: ${result.transaction.id}`
    };
  }
}
