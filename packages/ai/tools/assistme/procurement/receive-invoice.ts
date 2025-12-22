import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchasingInvoices, purchasingInvoiceLines, suppliers } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ReceiveInvoiceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'receive_invoice',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Regista fatura recebida de fornecedor',
    parameters: [
      {
        name: 'supplierId',
        type: 'string',
        description: 'ID do fornecedor',
        required: true
      },
      {
        name: 'invoiceNumber',
        type: 'string',
        description: 'Numero da fatura do fornecedor',
        required: true
      },
      {
        name: 'invoiceDate',
        type: 'string',
        description: 'Data da fatura (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'poId',
        type: 'string',
        description: 'ID da ordem de compra (se aplicavel)',
        required: false
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'Data de vencimento (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'lines',
        type: 'array',
        description: 'Linhas da fatura [{productId, quantity, unitPrice, taxRate}]',
        required: true,
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'ID do produto (opcional)' },
            description: { type: 'string', description: 'Descrição (opcional)' },
            quantity: { type: 'number', description: 'Quantidade' },
            unitPrice: { type: 'number', description: 'Preço unitário' },
            taxRate: { type: 'number', description: 'Taxa de imposto (%)' },
            poLineId: { type: 'string', description: 'ID da linha PO (opcional)' }
          },
          required: ['quantity', 'unitPrice', 'taxRate']
        }
      }
    ],
    outputSchema: z.object({
      invoiceId: z.string(),
      code: z.string(),
      invoiceNumber: z.string(),
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
      invoiceNumber: string;
      invoiceDate: string;
      poId?: string;
      dueDate?: string;
      lines: Array<{ productId?: string; description?: string; quantity: number; unitPrice: number; taxRate: number; poLineId?: string }>;
    },
    context: ToolExecutionContext
  ) {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    
    if (lines.length === 0) {
      throw new Error('Fatura deve conter pelo menos uma linha');
    }

    // Buscar dados do fornecedor para denormalização
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, context.tenantId),
          eq(suppliers.id, input.supplierId)
        )
      )
      .limit(1);

    if (!supplier) {
      throw new Error(`Fornecedor com ID ${input.supplierId} não encontrado`);
    }

    const timestamp = Date.now();
    const code = `INV-${timestamp}`;

    // Calcular totais
    let subtotal = 0;
    let taxTotal = 0;

    for (const line of lines) {
      const lineSubtotal = line.quantity * line.unitPrice;
      const lineTax = (lineSubtotal * line.taxRate) / 100;
      subtotal += lineSubtotal;
      taxTotal += lineTax;
    }

    const totalAmount = subtotal + taxTotal;

    // Criar fatura em transacao atomica
    const result = await db.transaction(async (tx) => {
      // 1. Inserir fatura com campos do fornecedor denormalizados
      const [invoice] = await tx.insert(purchasingInvoices).values({
        tenantId: context.tenantId,
        environment: context.environment || 'production',
        code,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        supplierId: input.supplierId,
        supplierName: supplier.name,
        supplierNif: supplier.taxId || null,
        poId: input.poId,
        submissionSource: 'manual',
        subtotal: subtotal.toString(),
        taxTotal: taxTotal.toString(),
        totalAmount: totalAmount.toString(),
        dueDate: input.dueDate,
        status: 'draft',
        threeWayMatchStatus: 'pending',
        remainingAmount: totalAmount.toString(),
        createdBy: context.userId
      }).returning();

      // 2. Inserir linhas da fatura
      for (const line of lines) {
        const lineSubtotal = line.quantity * line.unitPrice;
        const lineTotal = lineSubtotal + (lineSubtotal * line.taxRate / 100);
        const lineTax = lineSubtotal * line.taxRate / 100;

        await tx.insert(purchasingInvoiceLines).values({
          tenantId: context.tenantId,
          environment: context.environment || 'production',
          invoiceId: invoice.id,
          poLineId: line.poLineId,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          lineTotal: lineTotal.toString(),
          taxRate: line.taxRate.toString(),
          taxAmount: lineTax.toString()
        });
      }

      return invoice;
    });

    return {
      invoiceId: result.id,
      code: result.code,
      invoiceNumber: input.invoiceNumber,
      subtotal,
      taxTotal,
      totalAmount,
      linesCount: lines.length,
      message: `Fatura ${input.invoiceNumber} (${result.code}) registada com ${lines.length} linha(s). Total: ${totalAmount.toFixed(2)}`
    };
  }
}
