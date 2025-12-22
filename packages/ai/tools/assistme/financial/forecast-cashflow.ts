import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, lte, gte, sql } from 'drizzle-orm';

export class ForecastCashflowTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'forecast_cashflow',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Prevê cash flow para próximos 90 dias baseado em faturas e pagamentos pendentes',
    parameters: [
      {
        name: 'daysAhead',
        type: 'number',
        description: 'Número de dias para projetar (default: 90)',
        required: false,
        default: 90
      }
    ],
    outputSchema: z.object({
      forecast: z.array(z.object({
        weekStart: z.string(),
        weekEnd: z.string(),
        inflow: z.number(),
        outflow: z.number(),
        netCashflow: z.number()
      })),
      totalInflow: z.number(),
      totalOutflow: z.number(),
      projectedBalance: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { daysAhead?: number },
    context: ToolExecutionContext
  ) {
    const daysAhead = input.daysAhead || 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const forecastEnd = new Date(today);
    forecastEnd.setDate(today.getDate() + daysAhead);

    // Query pending receivables (invoiceType = 'receivable', paymentStatus = 'pending')
    const receivables = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, context.tenantId),
          eq(invoices.invoiceType, 'receivable'),
          eq(invoices.paymentStatus, 'pending'),
          gte(invoices.dueDate, today),
          lte(invoices.dueDate, forecastEnd)
        )
      );

    // Query pending payables (invoiceType = 'payable', paymentStatus = 'pending')
    const payables = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, context.tenantId),
          eq(invoices.invoiceType, 'payable'),
          eq(invoices.paymentStatus, 'pending'),
          gte(invoices.dueDate, today),
          lte(invoices.dueDate, forecastEnd)
        )
      );

    // Group by week
    const weeklyForecast: Record<string, { inflow: number; outflow: number }> = {};

    const getWeekKey = (date: Date | null) => {
      if (!date) return 'unknown';
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      return weekStart.toISOString().split('T')[0];
    };

    for (const inv of receivables) {
      const weekKey = getWeekKey(inv.dueDate);
      if (!weeklyForecast[weekKey]) {
        weeklyForecast[weekKey] = { inflow: 0, outflow: 0 };
      }
      weeklyForecast[weekKey].inflow += Number(inv.totalAmount || 0);
    }

    for (const inv of payables) {
      const weekKey = getWeekKey(inv.dueDate);
      if (!weeklyForecast[weekKey]) {
        weeklyForecast[weekKey] = { inflow: 0, outflow: 0 };
      }
      weeklyForecast[weekKey].outflow += Number(inv.totalAmount || 0);
    }

    // Convert to array and sort by date
    const forecast = Object.entries(weeklyForecast)
      .map(([weekStart, { inflow, outflow }]) => {
        const weekStartDate = new Date(weekStart);
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 6);
        
        return {
          weekStart,
          weekEnd: weekEndDate.toISOString().split('T')[0],
          inflow: Math.round(inflow * 100) / 100,
          outflow: Math.round(outflow * 100) / 100,
          netCashflow: Math.round((inflow - outflow) * 100) / 100
        };
      })
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const totalInflow = forecast.reduce((sum, w) => sum + w.inflow, 0);
    const totalOutflow = forecast.reduce((sum, w) => sum + w.outflow, 0);
    const projectedBalance = totalInflow - totalOutflow;

    return {
      forecast,
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      projectedBalance: Math.round(projectedBalance * 100) / 100,
      message: `📈 Previsão de cash flow para ${daysAhead} dias: ${forecast.length} semanas analisadas`
    };
  }
}
