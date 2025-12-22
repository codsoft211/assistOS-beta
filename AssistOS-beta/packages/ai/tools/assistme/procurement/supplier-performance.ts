import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { suppliers, purchaseOrders, receipts, receiptLines } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class SupplierPerformanceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'supplier_performance',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Avalia performance de fornecedor e atualiza scores',
    parameters: [
      {
        name: 'supplierId',
        type: 'string',
        description: 'ID do fornecedor',
        required: true
      }
    ],
    outputSchema: z.object({
      supplierId: z.string(),
      supplierName: z.string(),
      metrics: z.object({
        totalOrders: z.number(),
        totalOrdersValue: z.number(),
        onTimeDeliveryRate: z.number(),
        qualityScore: z.number(),
        overallScore: z.number()
      }),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      supplierId: string;
    },
    context: ToolExecutionContext
  ) {
    // Usar transacao com forUpdate para evitar race conditions
    const result = await db.transaction(async (tx) => {
      // 1. UPSERT para garantir que row existe (embora fornecedor ja deva existir)
      // Neste caso, nao faz sentido UPSERT pois estamos apenas atualizando
      // Entao vamos diretamente fazer Lock com forUpdate
      
      // 2. Lock do fornecedor DENTRO do transaction
      const supplier = await tx.query.suppliers.findFirst({
        where: and(
          eq(suppliers.tenantId, context.tenantId),
          eq(suppliers.id, input.supplierId)
        )
      }).forUpdate();

      // 3. Validar fornecedor existe
      if (!supplier) {
        throw new Error('Fornecedor nao encontrado');
      }

      // 4. Buscar todas as POs do fornecedor
      const pos = await tx.query.purchaseOrders.findMany({
        where: and(
          eq(purchaseOrders.tenantId, context.tenantId),
          eq(purchaseOrders.supplierId, input.supplierId)
        )
      });

      const totalOrders = pos.length;
      const totalOrdersValue = pos.reduce((sum, po) => sum + parseFloat(po.totalAmount || '0'), 0);

      // 5. Calcular taxa de entrega no prazo
      const posWithDelivery = pos.filter(po => 
        po.status === 'fully_received' || po.status === 'partially_received'
      );

      let onTimeCount = 0;
      for (const po of posWithDelivery) {
        if (po.expectedDeliveryDate && po.supplierAcknowledgedAt) {
          const expected = new Date(po.expectedDeliveryDate);
          const actual = new Date(po.supplierAcknowledgedAt);
          
          if (actual <= expected) {
            onTimeCount++;
          }
        }
      }

      const onTimeDeliveryRate = posWithDelivery.length > 0 
        ? (onTimeCount / posWithDelivery.length) * 100 
        : 0;

      // 6. Calcular quality score baseado em recepcoes
      const allReceipts = await tx.query.receipts.findMany({
        where: and(
          eq(receipts.tenantId, context.tenantId)
        )
      });

      // Filtrar receipts relacionados com POs deste fornecedor
      const supplierPoIds = new Set(pos.map(po => po.id));
      const supplierReceipts = allReceipts.filter(r => supplierPoIds.has(r.poId));

      let totalReceived = 0;
      let totalAccepted = 0;
      let totalRejected = 0;

      for (const receipt of supplierReceipts) {
        const lines = await tx.query.receiptLines.findMany({
          where: eq(receiptLines.receiptId, receipt.id)
        });

        for (const line of lines) {
          const received = parseFloat(line.receivedQuantity || '0');
          const accepted = parseFloat(line.acceptedQuantity || '0');
          const rejected = parseFloat(line.rejectedQuantity || '0');
          
          totalReceived += received;
          totalAccepted += accepted;
          totalRejected += rejected;
        }
      }

      // Quality score: % de produtos aceitos vs recebidos
      const qualityScore = totalReceived > 0 
        ? (totalAccepted / totalReceived) * 10 
        : 5; // Default neutro

      // 7. Calcular overall score (media ponderada)
      // on-time delivery: 40%, quality: 40%, outros: 20%
      const otdScore = (onTimeDeliveryRate / 100) * 10;
      const othersScore = 5; // Default neutro para comunicacao, preco, etc
      const overallScore = (otdScore * 0.4) + (qualityScore * 0.4) + (othersScore * 0.2);

      // 8. Update atomicamente
      await tx.update(suppliers)
        .set({
          totalOrdersCount: totalOrders,
          totalOrdersValue: totalOrdersValue.toString(),
          onTimeDeliveryRate: onTimeDeliveryRate.toFixed(2),
          qualityScore: qualityScore.toFixed(1),
          overallScore: overallScore.toFixed(1),
          updatedAt: new Date()
        })
        .where(eq(suppliers.id, input.supplierId));

      return {
        supplier,
        metrics: {
          totalOrders,
          totalOrdersValue,
          onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 10) / 10,
          qualityScore: Math.round(qualityScore * 10) / 10,
          overallScore: Math.round(overallScore * 10) / 10
        }
      };
    });

    return {
      supplierId: input.supplierId,
      supplierName: result.supplier.name,
      metrics: result.metrics,
      message: `Performance do fornecedor ${result.supplier.name} atualizada. Score geral: ${result.metrics.overallScore}/10`
    };
  }
}
