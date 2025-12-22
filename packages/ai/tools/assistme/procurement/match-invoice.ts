import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchasingInvoices, purchasingInvoiceLines, purchaseOrders, purchaseOrderLines, receipts, receiptLines } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class MatchInvoiceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'match_invoice',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Valida fatura vs PO vs Recebimento (3-way matching)',
    parameters: [
      {
        name: 'invoiceId',
        type: 'string',
        description: 'ID da fatura',
        required: true
      }
    ],
    outputSchema: z.object({
      invoiceId: z.string(),
      matchStatus: z.string(),
      hasDiscrepancies: z.boolean(),
      discrepancies: z.array(z.string()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      invoiceId: string;
    },
    context: ToolExecutionContext
  ) {
    // Usar transacao com forUpdate para evitar race conditions
    const result = await db.transaction(async (tx) => {
      // 1. Lock da fatura DENTRO do transaction
      const invoice = await tx.query.purchasingInvoices.findFirst({
        where: and(
          eq(purchasingInvoices.tenantId, context.tenantId),
          eq(purchasingInvoices.id, input.invoiceId)
        )
      }).forUpdate();

      // 2. Validar fatura existe
      if (!invoice) {
        throw new Error('Fatura nao encontrada');
      }

      const discrepancies: string[] = [];
      let poDiscrepancy = false;
      let receiptDiscrepancy = false;
      let priceDiscrepancy = false;
      let poDiscrepancyAmount = 0;
      let priceDiscrepancyAmount = 0;

      // 3. Se tiver PO, validar contra PO
      if (invoice.poId) {
        const po = await tx.query.purchaseOrders.findFirst({
          where: and(
            eq(purchaseOrders.tenantId, context.tenantId),
            eq(purchaseOrders.id, invoice.poId)
          )
        });

        if (!po) {
          discrepancies.push('PO nao encontrada');
          poDiscrepancy = true;
        } else {
          // Validar totais
          const invoiceTotal = parseFloat(invoice.totalAmount);
          const poTotal = parseFloat(po.totalAmount);
          const tolerance = 0.01; // Tolerancia de 1 centimo

          if (Math.abs(invoiceTotal - poTotal) > tolerance) {
            const diff = invoiceTotal - poTotal;
            discrepancies.push(`Divergencia de valor: Fatura ${invoiceTotal.toFixed(2)} vs PO ${poTotal.toFixed(2)} (diff: ${diff.toFixed(2)})`);
            priceDiscrepancy = true;
            priceDiscrepancyAmount = diff;
          }

          // Validar linhas
          const invoiceLines = await tx.query.purchasingInvoiceLines.findMany({
            where: and(
              eq(purchasingInvoiceLines.tenantId, context.tenantId),
              eq(purchasingInvoiceLines.invoiceId, input.invoiceId)
            )
          });

          const poLines = await tx.query.purchaseOrderLines.findMany({
            where: and(
              eq(purchaseOrderLines.tenantId, context.tenantId),
              eq(purchaseOrderLines.poId, invoice.poId)
            )
          });

          // Validar quantidade de linhas
          if (invoiceLines.length !== poLines.length) {
            discrepancies.push(`Numero de linhas diferente: Fatura ${invoiceLines.length} vs PO ${poLines.length}`);
            poDiscrepancy = true;
          }

          // Validar cada linha da fatura contra PO
          for (const invLine of invoiceLines) {
            if (invLine.poLineId) {
              const poLine = poLines.find(pl => pl.id === invLine.poLineId);
              
              if (!poLine) {
                discrepancies.push(`Linha da fatura referencia PO line inexistente: ${invLine.poLineId}`);
                poDiscrepancy = true;
                continue;
              }

              // Validar quantidade
              const invQty = parseFloat(invLine.quantity);
              const poQty = parseFloat(poLine.quantity);
              
              if (Math.abs(invQty - poQty) > 0.001) {
                discrepancies.push(`Quantidade divergente no produto ${invLine.productId}: Fatura ${invQty} vs PO ${poQty}`);
                poDiscrepancy = true;
              }

              // Validar preco unitario
              const invPrice = parseFloat(invLine.unitPrice);
              const poPrice = parseFloat(poLine.unitPrice);
              
              if (Math.abs(invPrice - poPrice) > 0.01) {
                discrepancies.push(`Preco unitario divergente no produto ${invLine.productId}: Fatura ${invPrice.toFixed(2)} vs PO ${poPrice.toFixed(2)}`);
                priceDiscrepancy = true;
              }
            }
          }
        }
      }

      // 4. Se tiver Receipt, validar quantidades recebidas
      if (invoice.receiptId) {
        const receipt = await tx.query.receipts.findFirst({
          where: and(
            eq(receipts.tenantId, context.tenantId),
            eq(receipts.id, invoice.receiptId)
          )
        });

        if (!receipt) {
          discrepancies.push('Recebimento nao encontrado');
          receiptDiscrepancy = true;
        } else {
          const invoiceLines = await tx.query.purchasingInvoiceLines.findMany({
            where: and(
              eq(purchasingInvoiceLines.tenantId, context.tenantId),
              eq(purchasingInvoiceLines.invoiceId, input.invoiceId)
            )
          });

          const recLines = await tx.query.receiptLines.findMany({
            where: and(
              eq(receiptLines.tenantId, context.tenantId),
              eq(receiptLines.receiptId, invoice.receiptId)
            )
          });

          // Validar cada linha contra recebimento
          for (const invLine of invoiceLines) {
            if (invLine.receiptLineId) {
              const recLine = recLines.find(rl => rl.id === invLine.receiptLineId);
              
              if (!recLine) {
                discrepancies.push(`Linha da fatura referencia receipt line inexistente: ${invLine.receiptLineId}`);
                receiptDiscrepancy = true;
                continue;
              }

              const invQty = parseFloat(invLine.quantity);
              const recQty = parseFloat(recLine.acceptedQuantity);
              
              if (Math.abs(invQty - recQty) > 0.001) {
                discrepancies.push(`Quantidade faturada difere do recebido no produto ${invLine.productId}: Fatura ${invQty} vs Recebido ${recQty}`);
                receiptDiscrepancy = true;
              }
            }
          }
        }
      }

      // 5. Determinar status final
      const matchStatus = discrepancies.length === 0 ? 'matched' : 'discrepancy';

      // 6. Update da fatura atomicamente
      await tx.update(purchasingInvoices)
        .set({
          threeWayMatchStatus: matchStatus,
          matchedAt: new Date(),
          matchedByAgentId: 'match_invoice_tool',
          poDiscrepancy,
          poDiscrepancyAmount: poDiscrepancyAmount !== 0 ? poDiscrepancyAmount.toString() : null,
          receiptDiscrepancy,
          receiptDiscrepancyDetails: receiptDiscrepancy ? { discrepancies } : null,
          priceDiscrepancy,
          priceDiscrepancyAmount: priceDiscrepancyAmount !== 0 ? priceDiscrepancyAmount.toString() : null
        })
        .where(eq(purchasingInvoices.id, input.invoiceId));

      return {
        invoiceId: input.invoiceId,
        matchStatus,
        discrepancies
      };
    });

    const hasDiscrepancies = result.discrepancies.length > 0;
    const statusLabel = hasDiscrepancies ? 'com discrepancias' : 'validada';
    const discrepancyInfo = hasDiscrepancies ? `. Discrepancias: ${result.discrepancies.join('; ')}` : '';

    return {
      invoiceId: result.invoiceId,
      matchStatus: result.matchStatus,
      hasDiscrepancies,
      discrepancies: result.discrepancies,
      message: `Fatura ${statusLabel}${discrepancyInfo}`
    };
  }
}
