import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, lt, ne } from 'drizzle-orm';

export class PaymentReminderTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'payment_reminder',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Envia lembrete de pagamento para faturas vencidas',
    parameters: [
      {
        name: 'invoiceId',
        type: 'string',
        description: 'ID da fatura específica',
        required: false
      },
      {
        name: 'daysOverdue',
        type: 'number',
        description: 'Enviar para faturas vencidas há X dias',
        required: false,
        default: 1
      }
    ],
    outputSchema: z.object({
      reminders: z.array(z.object({
        invoiceId: z.string(),
        invoiceNumber: z.string(),
        clientName: z.string().nullable(),
        amount: z.string(),
        daysOverdue: z.number()
      })),
      totalReminders: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      invoiceId?: string;
      daysOverdue?: number;
    },
    context: ToolExecutionContext
  ) {
    const daysOverdue = input.daysOverdue || 1;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);

    let overdueInvoices;

    if (input.invoiceId) {
      overdueInvoices = await db
        .select()
        .from(invoices)
        .where(and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.tenantId, context.tenantId)
        ));
    } else {
      overdueInvoices = await db
        .select()
        .from(invoices)
        .where(and(
          eq(invoices.tenantId, context.tenantId),
          eq(invoices.invoiceType, 'receivable'),
          ne(invoices.paymentStatus, 'paid'),
          lt(invoices.dueDate, cutoffDate)
        ))
        .limit(20);
    }

    const now = new Date();
    const reminders = overdueInvoices.map(invoice => {
      const daysOverdue = invoice.dueDate 
        ? Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        amount: invoice.totalAmount,
        daysOverdue
      };
    });

    return {
      reminders,
      totalReminders: reminders.length,
      message: `${reminders.length} lembrete(s) de pagamento preparado(s) (Integração de email será implementada em breve)`
    };
  }
}
