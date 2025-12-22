import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class ForecastRevenueTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'forecast_revenue',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Previsão de receita baseada em faturas pendentes e histórico',
    parameters: [
      {
        name: 'forecastMonths',
        type: 'number',
        description: 'Número de meses para previsão',
        required: false,
        default: 3
      },
      {
        name: 'lookbackMonths',
        type: 'number',
        description: 'Meses de histórico para análise',
        required: false,
        default: 6
      }
    ],
    outputSchema: z.object({
      historicalAverage: z.number(),
      pendingInvoices: z.number(),
      forecastedRevenue: z.number(),
      confidenceLevel: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      forecastMonths?: number;
      lookbackMonths?: number;
    },
    context: ToolExecutionContext
  ) {
    const forecastMonths = input.forecastMonths || 3;
    const lookbackMonths = input.lookbackMonths || 6;

    const lookbackDate = new Date();
    lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);

    const historicalResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS NUMERIC)), 0)`
      })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, context.tenantId),
        eq(invoices.invoiceType, 'receivable'),
        eq(invoices.paymentStatus, 'paid'),
        gte(invoices.issueDate, lookbackDate)
      ));

    const historicalTotal = parseFloat(historicalResult[0]?.total?.toString() || '0');
    const historicalAverage = historicalTotal / lookbackMonths;

    const pendingResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS NUMERIC)), 0)`
      })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, context.tenantId),
        eq(invoices.invoiceType, 'receivable'),
        eq(invoices.status, 'sent')
      ));

    const pendingInvoices = parseFloat(pendingResult[0]?.total?.toString() || '0');

    const forecastedRevenue = (historicalAverage * forecastMonths) + (pendingInvoices * 0.8);

    const confidenceLevel = lookbackMonths >= 6 ? 'high' : lookbackMonths >= 3 ? 'medium' : 'low';

    return {
      historicalAverage,
      pendingInvoices,
      forecastedRevenue,
      confidenceLevel,
      message: `Previsão ${forecastMonths} meses: €${forecastedRevenue.toFixed(2)} (baseado em média mensal de €${historicalAverage.toFixed(2)} + faturas pendentes €${pendingInvoices.toFixed(2)})`
    };
  }
}
