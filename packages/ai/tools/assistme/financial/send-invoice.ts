import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class SendInvoiceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'send_invoice',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Envia uma fatura por email (preparação para integração futura)',
    parameters: [
      {
        name: 'invoiceId',
        type: 'string',
        description: 'ID da fatura',
        required: true
      },
      {
        name: 'recipientEmail',
        type: 'string',
        description: 'Email do destinatário',
        required: false
      }
    ],
    outputSchema: z.object({
      invoiceId: z.string(),
      invoiceNumber: z.string(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      invoiceId: string; 
      recipientEmail?: string;
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

    const [updatedInvoice] = await db
      .update(invoices)
      .set({ 
        status: 'sent',
        sentAt: new Date()
      })
      .where(eq(invoices.id, input.invoiceId))
      .returning();

    return {
      invoiceId: updatedInvoice.id,
      invoiceNumber: updatedInvoice.invoiceNumber,
      status: updatedInvoice.status,
      message: `Fatura ${updatedInvoice.invoiceNumber} marcada como enviada! (Integração de email será implementada em breve)`
    };
  }
}
