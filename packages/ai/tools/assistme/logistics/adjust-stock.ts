import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryTransactions, inventoryLevels } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class AdjustStockTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'adjust_stock',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Ajusta níveis de stock (correções de inventário, quebras, devoluções)',
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
        name: 'newQuantity',
        type: 'number',
        description: 'Nova quantidade após ajuste',
        required: true
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Razão do ajuste (damage/loss/return/correction)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas adicionais',
        required: false
      }
    ],
    outputSchema: z.object({
      adjustmentId: z.string(),
      previousQuantity: z.number(),
      newQuantity: z.number(),
      difference: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      productId: string;
      warehouseId: string;
      newQuantity: number;
      reason: string;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    // Wrap in transaction for atomicity with row-level locking
    const result = await db.transaction(async (tx) => {
      // 1. UPSERT first to ensure row exists (safe concurrent insert)
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

      // 2. Lock the row INSIDE transaction (guaranteed to exist after UPSERT)
      const currentLevel = await tx.query.inventoryLevels.findFirst({
        where: and(
          eq(inventoryLevels.tenantId, context.tenantId),
          eq(inventoryLevels.productId, input.productId),
          eq(inventoryLevels.warehouseId, input.warehouseId)
        )
      }).forUpdate();

      // 3. Calculate difference with locked data
      const previousQuantity = parseFloat(currentLevel!.qtyOnHand);
      const difference = input.newQuantity - previousQuantity;

      // 4. Insert adjustment transaction
      const [adj] = await tx.insert(inventoryTransactions).values({
        tenantId: context.tenantId,
        type: 'adjustment',
        productId: input.productId,
        warehouseToId: input.warehouseId,
        qty: Math.abs(difference).toString(),
        reason: input.reason,
        performedBy: context.userId,
        notes: input.notes,
        metadata: {
          previousQuantity,
          newQuantity: input.newQuantity,
          difference
        }
      }).returning();

      // 5. Update inventory level atomically
      await tx.update(inventoryLevels)
        .set({ qtyOnHand: input.newQuantity.toString() })
        .where(eq(inventoryLevels.id, currentLevel!.id));

      return { adj, previousQuantity, difference };
    });

    const diffSign = result.difference >= 0 ? '+' : '';
    
    const reasonLabel = input.reason === 'damage' ? 'Dano' :
                       input.reason === 'loss' ? 'Perda' :
                       input.reason === 'return' ? 'Devolução' : 'Correção';
    
    return {
      adjustmentId: result.adj.id,
      previousQuantity: result.previousQuantity,
      newQuantity: input.newQuantity,
      difference: result.difference,
      message: `Ajuste ${result.adj.id} registado: ${reasonLabel}. Stock alterado de ${result.previousQuantity} para ${input.newQuantity} unidades (${diffSign}${result.difference})`
    };
  }
}
