import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, ne } from 'drizzle-orm';

export class AgingReportTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'aging_report',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Relatório aging de clientes (análise de faturas pendentes por período)',
    parameters: [
      {
        name: 'includeAll',
        type: 'boolean',
        description: 'Incluir faturas não vencidas',
        required: false,
        default: false
      }
    ],
    outputSchema: z.object({
      aging: z.object({
        current: z.object({ count: z.number(), amount: z.number() }),
        days0to30: z.object({ count: z.number(), amount: z.number() }),
        days31to60: z.object({ count: z.number(), amount: z.number() }),
        days61to90: z.object({ count: z.number(), amount: z.number() }),
        days90plus: z.object({ count: z.number(), amount: z.number() })
      }),
      totalPending: z.number(),
      totalAmount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { includeAll?: boolean },
    context: ToolExecutionContext
  ) {
    const pendingInvoices = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, context.tenantId),
        eq(invoices.invoiceType, 'receivable'),
        ne(invoices.paymentStatus, 'paid')
      ));

    const now = new Date();
    const aging = {
      current: { count: 0, amount: 0 },
      days0to30: { count: 0, amount: 0 },
      days31to60: { count: 0, amount: 0 },
      days61to90: { count: 0, amount: 0 },
      days90plus: { count: 0, amount: 0 }
    };

    for (const invoice of pendingInvoices) {
      if (!invoice.dueDate) continue;
      
      const daysOverdue = Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24));
      const amount = parseFloat(invoice.totalAmount) - parseFloat(invoice.paidAmount || '0');

      if (daysOverdue < 0 && !input.includeAll) continue;

      if (daysOverdue < 0) {
        aging.current.count++;
        aging.current.amount += amount;
      } else if (daysOverdue <= 30) {
        aging.days0to30.count++;
        aging.days0to30.amount += amount;
      } else if (daysOverdue <= 60) {
        aging.days31to60.count++;
        aging.days31to60.amount += amount;
      } else if (daysOverdue <= 90) {
        aging.days61to90.count++;
        aging.days61to90.amount += amount;
      } else {
        aging.days90plus.count++;
        aging.days90plus.amount += amount;
      }
    }

    const totalPending = Object.values(aging).reduce((sum, period) => sum + period.count, 0);
    const totalAmount = Object.values(aging).reduce((sum, period) => sum + period.amount, 0);

    return {
      aging,
      totalPending,
      totalAmount,
      message: `Aging Report: ${totalPending} fatura(s) pendente(s) totalizando €${totalAmount.toFixed(2)}`
    };
  }
}
