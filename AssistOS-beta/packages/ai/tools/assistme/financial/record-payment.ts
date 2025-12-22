import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { payments, invoices } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class RecordPaymentTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'record_payment',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Regista um pagamento recebido',
    parameters: [
      {
        name: 'invoiceId',
        type: 'string',
        description: 'ID da fatura',
        required: true
      },
      {
        name: 'amount',
        type: 'number',
        description: 'Valor recebido',
        required: true
      },
      {
        name: 'paymentMethod',
        type: 'string',
        description: 'Método de pagamento (bank_transfer/cash/card/check)',
        required: true
      },
      {
        name: 'paymentDate',
        type: 'string',
        description: 'Data do pagamento (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'reference',
        type: 'string',
        description: 'Referência do pagamento',
        required: false
      }
    ],
    outputSchema: z.object({
      paymentId: z.string(),
      invoiceId: z.string(),
      amount: z.string(),
      newInvoiceStatus: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      invoiceId: string;
      amount: number;
      paymentMethod: string;
      paymentDate?: string;
      reference?: string;
    },
    context: ToolExecutionContext
  ) {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, input.invoiceId),
        eq(invoices.tenantId, context.tenantId)
      ))
      .limit(1);

    if (!invoice) {
      throw new Error('Fatura não encontrada');
    }

    const [payment] = await db.insert(payments).values({
      tenantId: context.tenantId,
      invoiceId: input.invoiceId,
      type: 'received',
      paymentMethod: input.paymentMethod,
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      amount: input.amount.toString(),
      status: 'completed',
      reference: input.reference,
    }).returning();

    const currentPaid = parseFloat(invoice.paidAmount || '0');
    const newPaidAmount = currentPaid + input.amount;
    const totalAmount = parseFloat(invoice.totalAmount);
    
    let newPaymentStatus = 'pending';
    if (newPaidAmount >= totalAmount) {
      newPaymentStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newPaymentStatus = 'partial';
    }

    await db
      .update(invoices)
      .set({ 
        paidAmount: newPaidAmount.toString(),
        paymentStatus: newPaymentStatus
      })
      .where(eq(invoices.id, input.invoiceId));

    return {
      paymentId: payment.id,
      invoiceId: input.invoiceId,
      amount: payment.amount,
      newInvoiceStatus: newPaymentStatus,
      message: `Pagamento de €${input.amount} registado! Fatura ${invoice.invoiceNumber} agora está: ${newPaymentStatus}`
    };
  }
}
