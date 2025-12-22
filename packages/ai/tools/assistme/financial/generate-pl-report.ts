import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices, purchasingInvoices } from 'shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class GeneratePLReportTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_pl_report',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Gera relatório P&L (Profit & Loss) para um período',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: 'Data inicial (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data final (YYYY-MM-DD)',
        required: true
      }
    ],
    outputSchema: z.object({
      period: z.object({
        start: z.string(),
        end: z.string()
      }),
      revenue: z.number(),
      expenses: z.number(),
      netProfit: z.number(),
      profitMargin: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      startDate: string;
      endDate: string;
    },
    context: ToolExecutionContext
  ) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    const revenueResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS NUMERIC)), 0)`
      })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, context.tenantId),
        eq(invoices.invoiceType, 'receivable'),
        eq(invoices.paymentStatus, 'paid'),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate)
      ));

    const expensesResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${purchasingInvoices.totalAmount} AS NUMERIC)), 0)`
      })
      .from(purchasingInvoices)
      .where(and(
        eq(purchasingInvoices.tenantId, context.tenantId),
        eq(purchasingInvoices.status, 'approved'),
        gte(purchasingInvoices.receiptDate, startDate),
        lte(purchasingInvoices.receiptDate, endDate)
      ));

    const revenue = parseFloat(revenueResult[0]?.total?.toString() || '0');
    const expenses = parseFloat(expensesResult[0]?.total?.toString() || '0');
    const netProfit = revenue - expenses;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      period: {
        start: input.startDate,
        end: input.endDate
      },
      revenue,
      expenses,
      netProfit,
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      message: `P&L: Receitas €${revenue.toFixed(2)} - Despesas €${expenses.toFixed(2)} = Lucro €${netProfit.toFixed(2)} (${profitMargin.toFixed(1)}% margem)`
    };
  }
}
