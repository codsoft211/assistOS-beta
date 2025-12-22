import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class AgingAnalysisTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'aging_analysis',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Análise aging de recebíveis/pagáveis (0-30, 31-60, 61-90, 90+ dias)',
    parameters: [
      {
        name: 'type',
        type: 'string',
        description: 'Tipo de análise: receivables (a receber) ou payables (a pagar)',
        required: true
      }
    ],
    outputSchema: z.object({
      buckets: z.array(z.object({
        range: z.string(),
        count: z.number(),
        amount: z.number()
      })),
      totalOverdue: z.number(),
      totalOverdueAmount: z.number(),
      averageDays: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { type: 'receivables' | 'payables' },
    context: ToolExecutionContext
  ) {
    const invoiceType = input.type === 'receivables' ? 'receivable' : 'payable';
    
    // Get all pending invoices of the specified type
    const pendingInvoices = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, context.tenantId),
          eq(invoices.invoiceType, invoiceType),
          eq(invoices.paymentStatus, 'pending')
        )
      );

    const today = new Date();
    const buckets = {
      '0-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+': { count: 0, amount: 0 }
    };

    let totalDaysOverdue = 0;
    let overdueCount = 0;
    let totalOverdueAmount = 0;

    for (const invoice of pendingInvoices) {
      if (!invoice.dueDate) continue;

      const dueDate = new Date(invoice.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue > 0) {
        overdueCount++;
        totalDaysOverdue += daysOverdue;
        totalOverdueAmount += Number(invoice.totalAmount || 0);
      }

      // Skip future invoices (not yet due)
      if (daysOverdue <= 0) continue;

      const amount = Number(invoice.totalAmount || 0);

      if (daysOverdue <= 30) {
        buckets['0-30'].count++;
        buckets['0-30'].amount += amount;
      } else if (daysOverdue <= 60) {
        buckets['31-60'].count++;
        buckets['31-60'].amount += amount;
      } else if (daysOverdue <= 90) {
        buckets['61-90'].count++;
        buckets['61-90'].amount += amount;
      } else {
        buckets['90+'].count++;
        buckets['90+'].amount += amount;
      }
    }

    const averageDays = overdueCount > 0 ? Math.round(totalDaysOverdue / overdueCount) : 0;

    const bucketsArray = Object.entries(buckets).map(([range, data]) => ({
      range,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100
    }));

    const typeLabel = input.type === 'receivables' ? 'receber' : 'pagar';

    return {
      buckets: bucketsArray,
      totalOverdue: overdueCount,
      totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
      averageDays,
      message: `📊 Análise aging (${typeLabel}): ${overdueCount} faturas vencidas, média de ${averageDays} dias`
    };
  }
}
