import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, lt, ne } from 'drizzle-orm';

export class CheckOverdueTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'check_overdue_invoices',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Verifica faturas vencidas e não pagas',
    parameters: [
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 100
      }
    ],
    outputSchema: z.object({
      overdueInvoices: z.array(z.object({
        id: z.string(),
        invoiceNumber: z.string(),
        clientName: z.string().nullable(),
        totalAmount: z.string(),
        dueDate: z.date().nullable(),
        daysOverdue: z.number()
      })),
      totalOverdue: z.number(),
      totalAmount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { limit?: number },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 100;
    const now = new Date();

    const results = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientName: invoices.clientName,
        totalAmount: invoices.totalAmount,
        dueDate: invoices.dueDate
      })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, context.tenantId),
        lt(invoices.dueDate, now),
        ne(invoices.paymentStatus, 'paid')
      ))
      .limit(limit);

    const overdueInvoices = results.map(invoice => {
      const daysOverdue = invoice.dueDate 
        ? Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      return {
        ...invoice,
        daysOverdue
      };
    });

    const totalAmount = results.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);

    return {
      overdueInvoices,
      totalOverdue: results.length,
      totalAmount,
      message: `${results.length} fatura(s) vencida(s)! Valor total: €${totalAmount.toFixed(2)}`
    };
  }
}
