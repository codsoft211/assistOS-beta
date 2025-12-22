import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { budgetingEngineService } from '@platform/services/budgeting-engine';

export class GetBudgetVsActualTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_budget_vs_actual',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Analisa variância entre budget planeado e gastos reais. Mostra breakdown detalhado por dimensão e identifica desvios.',
    parameters: [
      {
        name: 'budgetId',
        type: 'string',
        description: 'ID do orçamento a analisar',
        required: true
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início do período (ISO format: YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de fim do período (ISO format: YYYY-MM-DD)',
        required: false
      }
    ],
    outputSchema: z.object({
      budgetId: z.string(),
      period: z.object({
        start: z.string(),
        end: z.string()
      }),
      budgeted: z.number(),
      actual: z.number(),
      variance: z.number(),
      variancePercentage: z.number(),
      status: z.enum(['on_track', 'warning', 'exceeded']),
      breakdown: z.array(z.object({
        dimension: z.string(),
        dimensionValue: z.string(),
        budgeted: z.number(),
        actual: z.number(),
        variance: z.number()
      })),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      budgetId: string;
      startDate?: string;
      endDate?: string;
    },
    context: ToolExecutionContext
  ) {
    // Default period: current month if not provided
    const now = new Date();
    const start = input.startDate ? new Date(input.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = input.endDate ? new Date(input.endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Use Budgeting Engine to analyze variance
    const varianceAnalysis = await budgetingEngineService.analyzeVariance(
      context.tenantId,
      input.budgetId,
      { start, end }
    );

    return {
      budgetId: varianceAnalysis.budgetId,
      period: {
        start: varianceAnalysis.period.start.toISOString().split('T')[0],
        end: varianceAnalysis.period.end.toISOString().split('T')[0]
      },
      budgeted: varianceAnalysis.budgeted,
      actual: varianceAnalysis.actual,
      variance: varianceAnalysis.variance,
      variancePercentage: varianceAnalysis.variancePercentage,
      status: varianceAnalysis.status,
      breakdown: varianceAnalysis.breakdown,
      message: `Análise de variância: ${varianceAnalysis.variancePercentage > 0 ? 'excedido' : 'dentro do budget'} em ${Math.abs(varianceAnalysis.variancePercentage).toFixed(1)}% (€${Math.abs(varianceAnalysis.variance).toFixed(2)})`
    };
  }
}

