import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { opportunities } from 'shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class ForecastDealsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'forecast_deals',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Previsão de negócios do pipeline por data de fecho/probabilidade',
    parameters: [
      {
        name: 'dateRange',
        type: 'object',
        description: 'Intervalo de datas (from, to)',
        required: false
      },
      {
        name: 'stage',
        type: 'string',
        description: 'Fase específica do pipeline',
        required: false
      },
      {
        name: 'userId',
        type: 'string',
        description: 'ID do utilizador (para previsão individual)',
        required: false
      }
    ],
    outputSchema: z.object({
      forecast: z.object({
        totalValue: z.number(),
        weightedValue: z.number(),
        dealCount: z.number(),
        avgProbability: z.number(),
        confidence: z.string()
      }),
      breakdownByMonth: z.array(z.object({
        month: z.string(),
        totalValue: z.number(),
        weightedValue: z.number(),
        dealCount: z.number()
      })),
      breakdownByStage: z.array(z.object({
        stage: z.string(),
        totalValue: z.number(),
        weightedValue: z.number(),
        dealCount: z.number()
      })),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { dateRange?: any; stage?: string; userId?: string },
    context: ToolExecutionContext
  ) {
    const conditions: any[] = [eq(opportunities.tenantId, context.tenantId)];

    if (input.dateRange) {
      if (input.dateRange.from) {
        conditions.push(gte(opportunities.expectedCloseDate, new Date(input.dateRange.from)));
      }
      if (input.dateRange.to) {
        conditions.push(lte(opportunities.expectedCloseDate, new Date(input.dateRange.to)));
      }
    }

    if (input.stage) {
      conditions.push(eq(opportunities.stage, input.stage));
    }

    const deals = await db
      .select()
      .from(opportunities)
      .where(and(...conditions));

    let totalValue = 0;
    let weightedValue = 0;
    let totalProbability = 0;
    const monthlyBreakdown: Record<string, { totalValue: number; weightedValue: number; dealCount: number }> = {};
    const stageBreakdown: Record<string, { totalValue: number; weightedValue: number; dealCount: number }> = {};

    for (const deal of deals) {
      const value = typeof deal.estimatedValue === 'string' ? parseFloat(deal.estimatedValue) : (deal.estimatedValue || 0);
      const probability = deal.probability || 0;
      const weighted = value * (probability / 100);

      totalValue += value;
      weightedValue += weighted;
      totalProbability += probability;

      if (deal.expectedCloseDate) {
        const monthKey = deal.expectedCloseDate.toString().substring(0, 7);
        if (!monthlyBreakdown[monthKey]) {
          monthlyBreakdown[monthKey] = { totalValue: 0, weightedValue: 0, dealCount: 0 };
        }
        monthlyBreakdown[monthKey].totalValue += value;
        monthlyBreakdown[monthKey].weightedValue += weighted;
        monthlyBreakdown[monthKey].dealCount++;
      }

      const stage = deal.stage || 'unknown';
      if (!stageBreakdown[stage]) {
        stageBreakdown[stage] = { totalValue: 0, weightedValue: 0, dealCount: 0 };
      }
      stageBreakdown[stage].totalValue += value;
      stageBreakdown[stage].weightedValue += weighted;
      stageBreakdown[stage].dealCount++;
    }

    const avgProbability = deals.length > 0 ? totalProbability / deals.length : 0;
    
    let confidence = 'baixa';
    if (avgProbability >= 70) confidence = 'alta';
    else if (avgProbability >= 40) confidence = 'média';

    const breakdownByMonth = Object.entries(monthlyBreakdown).map(([month, data]) => ({
      month,
      totalValue: Math.round(data.totalValue * 100) / 100,
      weightedValue: Math.round(data.weightedValue * 100) / 100,
      dealCount: data.dealCount
    })).sort((a, b) => a.month.localeCompare(b.month));

    const breakdownByStage = Object.entries(stageBreakdown).map(([stage, data]) => ({
      stage,
      totalValue: Math.round(data.totalValue * 100) / 100,
      weightedValue: Math.round(data.weightedValue * 100) / 100,
      dealCount: data.dealCount
    }));

    return {
      forecast: {
        totalValue: Math.round(totalValue * 100) / 100,
        weightedValue: Math.round(weightedValue * 100) / 100,
        dealCount: deals.length,
        avgProbability: Math.round(avgProbability),
        confidence
      },
      breakdownByMonth,
      breakdownByStage,
      message: `📈 Previsão: €${Math.round(weightedValue)} (${deals.length} negócios, confiança ${confidence})`
    };
  }
}
