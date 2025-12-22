import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices, payments } from 'shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class CalculateFinancialKpisTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'calculate_financial_kpis',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Calcula KPIs financeiros (ROI, margens, EBITDA, quick ratio)',
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
        startDate: z.string(),
        endDate: z.string()
      }),
      revenue: z.number(),
      costs: z.number(),
      grossProfit: z.number(),
      grossMargin: z.number(),
      netMargin: z.number(),
      roi: z.number(),
      ebitda: z.number(),
      quickRatio: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { startDate: string; endDate: string },
    context: ToolExecutionContext
  ) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // Get all receivables (revenue) in the period
    const receivableInvoices = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, context.tenantId),
          eq(invoices.invoiceType, 'receivable'),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate)
        )
      );

    // Get all payables (costs) in the period
    const payableInvoices = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, context.tenantId),
          eq(invoices.invoiceType, 'payable'),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate)
        )
      );

    // Calculate totals
    const revenue = receivableInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    const costs = payableInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    const grossProfit = revenue - costs;

    // Calculate margins
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0; // Simplified: same as gross for now

    // Calculate ROI
    const roi = costs > 0 ? ((revenue - costs) / costs) * 100 : 0;

    // EBITDA - simplified as gross profit (would need depreciation/amortization data for accuracy)
    const ebitda = grossProfit;

    // Quick Ratio - simplified calculation
    // (Current Assets - Inventory) / Current Liabilities
    // We'll use receivables as current assets, payables as current liabilities
    const currentAssets = receivableInvoices.reduce((sum, inv) => 
      inv.paymentStatus === 'pending' ? sum + Number(inv.totalAmount || 0) : sum, 0
    );
    const currentLiabilities = payableInvoices.reduce((sum, inv) => 
      inv.paymentStatus === 'pending' ? sum + Number(inv.totalAmount || 0) : sum, 0
    );
    const quickRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;

    return {
      period: {
        startDate: input.startDate,
        endDate: input.endDate
      },
      revenue: Math.round(revenue * 100) / 100,
      costs: Math.round(costs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      netMargin: Math.round(netMargin * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      ebitda: Math.round(ebitda * 100) / 100,
      quickRatio: Math.round(quickRatio * 100) / 100,
      message: `📊 KPIs calculados: Receita ${revenue.toFixed(2)}€, Margem Bruta ${grossMargin.toFixed(1)}%, ROI ${roi.toFixed(1)}%`
    };
  }
}
