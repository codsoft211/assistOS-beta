import { db } from "../../../../../apps/api/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { 
  commercialLeads,
  commercialPipeline,
  commercialForecasts,
  budgetQuotes
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  forecastPeriod: z.enum(['monthly', 'quarterly', 'yearly']),
  periodsAhead: z.number().int().positive().max(12),
  includeHistorical: z.boolean(),
});

type Input = z.infer<typeof inputSchema>;

export const ForecastSalesRevenueTool: ToolDefinition<Input> = {
  name: "forecast-sales-revenue",
  description: "Gera previsao de receita baseada no pipeline comercial e tendencias historicas",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Gerar previsao de receita
    // Esta e uma operacao de leitura complexa, nao precisa de transaction
    
    // 1. Buscar leads ativos no pipeline
    const activeLeads = await db.query.commercialLeads.findMany({
      where: and(
        eq(commercialLeads.tenantId, context.tenantId),
        // Leads que nao foram perdidos ou cancelados
      ),
      columns: {
        id: true,
        status: true,
        budgetTotal: true,
        eventDate: true,
        createdAt: true
      }
    });

    // 2. Buscar orcamentos aprovados
    const approvedQuotes = await db.query.budgetQuotes.findMany({
      where: and(
        eq(budgetQuotes.tenantId, context.tenantId),
        eq(budgetQuotes.status, 'approved')
      ),
      columns: {
        id: true,
        totalWithVat: true,
        approvedAt: true
      }
    });

    // 3. Calcular pipeline value (valor total em pipeline)
    const totalPipelineValue = activeLeads.reduce((sum, lead) => {
      return sum + (lead.budgetTotal ? parseFloat(lead.budgetTotal) : 0);
    }, 0);

    // 4. Calcular weighted pipeline value (baseado em probabilidades)
    // Atribuir probabilidades por status (simplificado)
    const statusProbabilities: Record<string, number> = {
      'new': 0.1,
      'contacted': 0.2,
      'qualified': 0.4,
      'proposal': 0.6,
      'negotiation': 0.8,
      'approved': 0.95,
      'converted': 1.0,
      'won': 1.0,
    };

    const weightedPipelineValue = activeLeads.reduce((sum, lead) => {
      const value = lead.budgetTotal ? parseFloat(lead.budgetTotal) : 0;
      const probability = statusProbabilities[lead.status || 'new'] || 0.1;
      return sum + (value * probability);
    }, 0);

    // 5. Buscar dados historicos para calcular taxa de conversao
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const historicalLeads = await db.query.commercialLeads.findMany({
      where: and(
        eq(commercialLeads.tenantId, context.tenantId),
        gte(commercialLeads.createdAt, sixMonthsAgo)
      ),
      columns: {
        id: true,
        status: true,
        budgetTotal: true,
        createdAt: true
      }
    });

    const totalHistorical = historicalLeads.length;
    const convertedHistorical = historicalLeads.filter(l => 
      l.status === 'converted' || l.status === 'won' || l.status === 'approved'
    ).length;

    const historicalConversionRate = totalHistorical > 0 
      ? convertedHistorical / totalHistorical 
      : 0.2; // 20% default

    // 6. Calcular revenue esperada
    const expectedRevenue = weightedPipelineValue;
    
    // Revenue conservadora (usando conversion rate historica)
    const conservativeRevenue = totalPipelineValue * historicalConversionRate;

    // 7. Calcular valor ja confirmado (orcamentos aprovados)
    const confirmedRevenue = approvedQuotes.reduce((sum, quote) => {
      return sum + (quote.totalWithVat ? parseFloat(quote.totalWithVat) : 0);
    }, 0);

    // 8. Gerar previsoes por periodo
    const forecasts = [];
    const now = new Date();

    for (let i = 1; i <= input.periodsAhead; i++) {
      const periodStart = new Date(now);
      const periodEnd = new Date(now);

      if (input.forecastPeriod === 'monthly') {
        periodStart.setMonth(now.getMonth() + i - 1);
        periodEnd.setMonth(now.getMonth() + i);
      } else if (input.forecastPeriod === 'quarterly') {
        periodStart.setMonth(now.getMonth() + (i - 1) * 3);
        periodEnd.setMonth(now.getMonth() + i * 3);
      } else { // yearly
        periodStart.setFullYear(now.getFullYear() + i - 1);
        periodEnd.setFullYear(now.getFullYear() + i);
      }

      // Distribuir receita prevista pelos periodos
      const periodRevenue = expectedRevenue / input.periodsAhead;
      const periodConservative = conservativeRevenue / input.periodsAhead;

      forecasts.push({
        period: input.forecastPeriod,
        periodNumber: i,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        expectedRevenue: periodRevenue,
        conservativeRevenue: periodConservative,
        optimisticRevenue: periodRevenue * 1.2, // 20% mais otimista
        confidence: historicalConversionRate > 0.3 ? 'high' : 'medium'
      });
    }

    // 9. Buscar forecasts anteriores se existirem
    let historicalForecasts = null;
    if (input.includeHistorical) {
      historicalForecasts = await db.query.commercialForecasts.findMany({
        where: eq(commercialForecasts.tenantId, context.tenantId),
        limit: 6,
        orderBy: (forecasts, { desc }) => [desc(forecasts.createdAt)]
      });
    }

    return {
      success: true,
      data: {
        summary: {
          totalPipelineValue,
          weightedPipelineValue,
          expectedRevenue,
          conservativeRevenue,
          confirmedRevenue,
          historicalConversionRate: historicalConversionRate * 100,
          leadsInPipeline: activeLeads.length,
          approvedQuotes: approvedQuotes.length
        },
        forecasts,
        historicalData: {
          leadsLast6Months: totalHistorical,
          convertedLast6Months: convertedHistorical,
          conversionRate: historicalConversionRate * 100
        },
        historicalForecasts: historicalForecasts?.map(f => ({
          period: f.forecastPeriod,
          expected: f.expectedRevenue,
          actual: f.actualRevenue,
          accuracy: f.forecastAccuracy
        })),
        message: `Previsao gerada: ${forecasts.length} periodos. Receita esperada: ${expectedRevenue.toFixed(2)} EUR (conservadora: ${conservativeRevenue.toFixed(2)} EUR)`
      }
    };
  },
};
