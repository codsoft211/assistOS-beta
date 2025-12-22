import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class CreateCreditNoteTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_credit_note',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Cria uma nota de crédito (devolução/anulação de fatura)',
    parameters: [
      {
        name: 'originalInvoiceId',
        type: 'string',
        description: 'ID da fatura original',
        required: true
      },
      {
        name: 'amount',
        type: 'number',
        description: 'Valor da nota de crédito',
        required: true
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Motivo da nota de crédito',
        required: false
      }
    ],
    outputSchema: z.object({
      creditNoteId: z.string(),
      creditNoteNumber: z.string(),
      amount: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      originalInvoiceId: string;
      amount: number;
      reason?: string;
    },
    context: ToolExecutionContext
  ) {
    const [originalInvoice] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, input.originalInvoiceId),
        eq(invoices.tenantId, context.tenantId)
      ))
      .limit(1);

    if (!originalInvoice) {
      throw new Error('Fatura original não encontrada');
    }

    const creditNoteNumber = `CN-${Date.now()}`;
    
    const [creditNote] = await db.insert(invoices).values({
      tenantId: context.tenantId,
      invoiceType: 'receivable',
      invoiceNumber: creditNoteNumber,
      documentType: 'credit_note',
      clientId: originalInvoice.clientId,
      clientName: originalInvoice.clientName,
      issueDate: new Date(),
      status: 'issued',
      paymentStatus: 'paid',
      totalAmount: (-Math.abs(input.amount)).toString(),
      subtotal: (-Math.abs(input.amount)).toString(),
      taxAmount: '0',
      paidAmount: (-Math.abs(input.amount)).toString(),
      notes: input.reason || `Nota de crédito referente à fatura ${originalInvoice.invoiceNumber}`,
      relatedInvoiceId: input.originalInvoiceId,
    }).returning();

    return {
      creditNoteId: creditNote.id,
      creditNoteNumber: creditNote.invoiceNumber,
      amount: creditNote.totalAmount,
      message: `Nota de crédito ${creditNote.invoiceNumber} criada! Valor: €${Math.abs(parseFloat(creditNote.totalAmount)).toFixed(2)}`
    };
  }
}
