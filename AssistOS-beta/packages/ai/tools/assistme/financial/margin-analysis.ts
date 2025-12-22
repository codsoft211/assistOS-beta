import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class MarginAnalysisTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'margin_analysis',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Análise de margem de lucro por período ou cliente',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: 'Data inicial (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data final (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'clientId',
        type: 'string',
        description: 'ID do cliente para análise específica',
        required: false
      }
    ],
    outputSchema: z.object({
      totalRevenue: z.number(),
      totalCost: z.number(),
      grossProfit: z.number(),
      grossMargin: z.number(),
      invoiceCount: z.number(),
      averageMargin: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      startDate?: string;
      endDate?: string;
      clientId?: string;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [
      eq(invoices.tenantId, context.tenantId),
      eq(invoices.invoiceType, 'receivable'),
      eq(invoices.paymentStatus, 'paid')
    ];
    
    if (input.startDate) {
      conditions.push(gte(invoices.issueDate, new Date(input.startDate)));
    }
    
    if (input.endDate) {
      conditions.push(lte(invoices.issueDate, new Date(input.endDate)));
    }
    
    if (input.clientId) {
      conditions.push(eq(invoices.clientId, input.clientId));
    }

    const results = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS NUMERIC)), 0)`,
        totalCost: sql<number>`COALESCE(SUM(CAST(${invoices.netAmount} AS NUMERIC)), 0)`,
        invoiceCount: sql<number>`COUNT(*)`
      })
      .from(invoices)
      .where(and(...conditions));

    const totalRevenue = parseFloat(results[0]?.totalRevenue?.toString() || '0');
    const totalCost = parseFloat(results[0]?.totalCost?.toString() || '0') * 0.7;
    const invoiceCount = parseInt(results[0]?.invoiceCount?.toString() || '0');
    
    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const averageMargin = invoiceCount > 0 ? grossMargin : 0;

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      grossMargin: parseFloat(grossMargin.toFixed(2)),
      invoiceCount,
      averageMargin: parseFloat(averageMargin.toFixed(2)),
      message: `Margem: ${grossMargin.toFixed(1)}% sobre €${totalRevenue.toFixed(2)} em receitas (${invoiceCount} faturas)`
    };
  }
}
