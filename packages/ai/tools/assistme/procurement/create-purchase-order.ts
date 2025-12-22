import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchaseOrders, purchaseOrderLines, purchaseRequisitions, purchaseRequisitionLines } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class CreatePurchaseOrderTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_purchase_order',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Cria ordem de compra a partir de requisicao aprovada ou manual',
    parameters: [
      {
        name: 'supplierId',
        type: 'string',
        description: 'ID do fornecedor',
        required: true
      },
      {
        name: 'orderDate',
        type: 'string',
        description: 'Data da ordem (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'requisitionId',
        type: 'string',
        description: 'ID da requisicao (se aplicavel)',
        required: false
      },
      {
        name: 'expectedDeliveryDate',
        type: 'string',
        description: 'Data esperada de entrega (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'lines',
        type: 'array',
        description: 'Linhas da PO [{productId, quantity, unitPrice}] (obrigatorio se sem requisicao)',
        required: false,
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'ID do produto' },
            quantity: { type: 'number', description: 'Quantidade' },
            unitPrice: { type: 'number', description: 'Preço unitário' },
            description: { type: 'string', description: 'Descrição (opcional)' },
            uom: { type: 'string', description: 'Unidade de medida (opcional)' }
          }
        }
      },
      {
        name: 'taxRate',
        type: 'number',
        description: 'Taxa de imposto (%) - default 23',
        required: false
      }
    ],
    outputSchema: z.object({
      poId: z.string(),
      code: z.string(),
      supplierId: z.string(),
      subtotal: z.number(),
      taxTotal: z.number(),
      totalAmount: z.number(),
      linesCount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      supplierId: string;
      orderDate: string;
      requisitionId?: string;
      expectedDeliveryDate?: string;
      lines?: Array<{ productId: string; quantity: number; unitPrice: number; description?: string; uom?: string }>;
      taxRate?: number;
    },
    context: ToolExecutionContext
  ) {
    const taxRate = input.taxRate || 23;
    const timestamp = Date.now();
    const code = `PO-${timestamp}`;

    // Criar PO em transacao atomica
    const result = await db.transaction(async (tx) => {
      let poLines: Array<{ productId: string; quantity: number; unitPrice: number; description?: string; uom?: string; requisitionLineId?: string }> = [];
      
      // Se tiver requisicao, buscar linhas da requisicao
      if (input.requisitionId) {
        // 1. Lock da requisicao DENTRO do transaction
        const requisition = await tx.query.purchaseRequisitions.findFirst({
          where: and(
            eq(purchaseRequisitions.tenantId, context.tenantId),
            eq(purchaseRequisitions.id, input.requisitionId)
          )
        }).forUpdate();

        // 2. Validar requisicao
        if (!requisition) {
          throw new Error('Requisicao nao encontrada');
        }

        if (requisition.status !== 'approved') {
          throw new Error(`Requisicao deve estar aprovada. Status atual: ${requisition.status}`);
        }

        if (requisition.convertedToPoId) {
          throw new Error('Requisicao ja foi convertida em PO');
        }

        // 3. Buscar linhas da requisicao
        const reqLines = await tx.query.purchaseRequisitionLines.findMany({
          where: and(
            eq(purchaseRequisitionLines.tenantId, context.tenantId),
            eq(purchaseRequisitionLines.requisitionId, input.requisitionId)
          )
        });

        if (reqLines.length === 0) {
          throw new Error('Requisicao nao possui linhas');
        }

        // Converter linhas da requisicao para linhas da PO
        poLines = reqLines.map(line => ({
          productId: line.productId,
          quantity: parseFloat(line.quantity),
          unitPrice: parseFloat(line.estimatedPrice || '0'),
          description: line.description || undefined,
          uom: line.uom || undefined,
          requisitionLineId: line.id
        }));
      } else if (input.lines && input.lines.length > 0) {
        // Usar linhas fornecidas manualmente
        poLines = input.lines;
      } else {
        throw new Error('Deve fornecer requisitionId ou lines');
      }

      // Calcular totais
      let subtotal = 0;
      for (const line of poLines) {
        const lineTotal = line.quantity * line.unitPrice;
        subtotal += lineTotal;
      }

      const taxTotal = (subtotal * taxRate) / 100;
      const totalAmount = subtotal + taxTotal;

      // 4. Inserir PO
      const [po] = await tx.insert(purchaseOrders).values({
        tenantId: context.tenantId,
        code,
        orderDate: input.orderDate,
        expectedDeliveryDate: input.expectedDeliveryDate,
        supplierId: input.supplierId,
        requisitionId: input.requisitionId,
        source: input.requisitionId ? 'requisition' : 'manual',
        status: 'draft',
        subtotal: subtotal.toString(),
        taxTotal: taxTotal.toString(),
        totalAmount: totalAmount.toString(),
        createdBy: context.userId
      }).returning();

      // 5. Inserir linhas da PO
      for (const line of poLines) {
        const lineTotal = line.quantity * line.unitPrice;
        
        await tx.insert(purchaseOrderLines).values({
          tenantId: context.tenantId,
          poId: po.id,
          requisitionLineId: line.requisitionLineId,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity.toString(),
          uom: line.uom,
          unitPrice: line.unitPrice.toString(),
          lineTotal: lineTotal.toString(),
          remainingQuantity: line.quantity.toString()
        });
      }

      // 6. Se tiver requisicao, marcar como convertida
      if (input.requisitionId) {
        await tx.update(purchaseRequisitions)
          .set({
            status: 'converted_to_po',
            convertedToPoId: po.id,
            conversionDate: new Date()
          })
          .where(eq(purchaseRequisitions.id, input.requisitionId));
      }

      return { po, subtotal, taxTotal, totalAmount, linesCount: poLines.length };
    });

    return {
      poId: result.po.id,
      code: result.po.code,
      supplierId: input.supplierId,
      subtotal: result.subtotal,
      taxTotal: result.taxTotal,
      totalAmount: result.totalAmount,
      linesCount: result.linesCount,
      message: `PO ${result.po.code} criada com ${result.linesCount} linha(s). Subtotal: ${result.subtotal.toFixed(2)}, Imposto: ${result.taxTotal.toFixed(2)}, Total: ${result.totalAmount.toFixed(2)}`
    };
  }
}
