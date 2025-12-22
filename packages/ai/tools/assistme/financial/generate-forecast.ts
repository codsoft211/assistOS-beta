import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { budgetingEngineService } from '@platform/services/budgeting-engine';

export class GenerateForecastTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_forecast',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Gera previsão financeira baseada em dados históricos. Analisa tendências e sazonalidade para projetar receitas, custos e margens futuras.',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início do período de previsão (ISO format: YYYY-MM-DD)',
        required: true
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de fim do período de previsão (ISO format: YYYY-MM-DD)',
        required: true
      },
      {
        name: 'lookbackMonths',
        type: 'number',
        description: 'Número de meses de histórico a considerar (default: 12)',
        required: false
      },
      {
        name: 'modules',
        type: 'array',
        items: { type: 'string' },
        description: 'Lista de módulos para incluir na previsão (opcional)',
        required: false
      }
    ],
    outputSchema: z.object({
      period: z.object({
        start: z.string(),
        end: z.string()
      }),
      forecastedRevenue: z.number(),
      forecastedCosts: z.number(),
      forecastedMargin: z.number(),
      confidence: z.enum(['high', 'medium', 'low']),
      assumptions: z.array(z.string()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      startDate: string;
      endDate: string;
      lookbackMonths?: number;
      modules?: string[];
    },
    context: ToolExecutionContext
  ) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);

    if (start >= end) {
      throw new Error('Data de início deve ser anterior à data de fim');
    }

    // Use Budgeting Engine to generate forecast
    const forecast = await budgetingEngineService.generateForecast(
      context.tenantId,
      { start, end },
      input.lookbackMonths || 12,
      input.modules
    );

    return {
      period: {
        start: forecast.period.start.toISOString().split('T')[0],
        end: forecast.period.end.toISOString().split('T')[0]
      },
      forecastedRevenue: forecast.forecastedRevenue,
      forecastedCosts: forecast.forecastedCosts,
      forecastedMargin: forecast.forecastedMargin,
      confidence: forecast.confidence,
      assumptions: forecast.assumptions,
      message: `Previsão gerada: Receita €${forecast.forecastedRevenue.toFixed(2)}, Custos €${forecast.forecastedCosts.toFixed(2)}, Margem €${forecast.forecastedMargin.toFixed(2)} (${forecast.confidence} confidence)`
    };
  }
}

