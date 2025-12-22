import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { financialGridService } from '@platform/services/financial-grid';

export class CompareScenariosTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'compare_scenarios',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Compara múltiplos cenários financeiros. Mostra diferenças em receitas, custos, margens e identifica o melhor cenário.',
    parameters: [
      {
        name: 'baseScenarioId',
        type: 'string',
        description: 'ID do cenário base para comparação',
        required: true
      },
      {
        name: 'comparisonScenarioIds',
        type: 'array',
        items: { type: 'string' },
        description: 'Lista de IDs dos cenários a comparar com o base',
        required: true
      }
    ],
    outputSchema: z.object({
      baseScenario: z.object({
        id: z.string(),
        name: z.string(),
        revenue: z.number(),
        costs: z.number(),
        margin: z.number(),
        marginPercentage: z.number()
      }),
      comparisons: z.array(z.object({
        scenarioId: z.string(),
        scenarioName: z.string(),
        revenue: z.number(),
        costs: z.number(),
        margin: z.number(),
        marginPercentage: z.number(),
        revenueDiff: z.number(),
        costsDiff: z.number(),
        marginDiff: z.number(),
        marginPercentageDiff: z.number()
      })),
      bestScenario: z.object({
        scenarioId: z.string(),
        scenarioName: z.string(),
        margin: z.number()
      }).optional(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      baseScenarioId: string;
      comparisonScenarioIds: string[];
    },
    context: ToolExecutionContext
  ) {
    if (input.comparisonScenarioIds.length === 0) {
      throw new Error('Deve fornecer pelo menos um cenário para comparação');
    }

    // Use Financial Grid to compare scenarios
    const comparison = await financialGridService.compareScenarios(
      context.tenantId,
      input.baseScenarioId,
      input.comparisonScenarioIds
    );

    // Find best scenario (highest margin)
    let bestScenario: { scenarioId: string; scenarioName: string; margin: number } | undefined;
    if (comparison.comparisons && comparison.comparisons.length > 0) {
      const best = comparison.comparisons.reduce((best, curr) => {
        const currMargin = curr.margin || 0;
        const bestMargin = best.margin || 0;
        return currMargin > bestMargin ? curr : best;
      });
      
      if (best.margin && best.margin > (comparison.baseScenario?.margin || 0)) {
        bestScenario = {
          scenarioId: best.scenarioId,
          scenarioName: best.scenarioName || '',
          margin: best.margin
        };
      }
    }

    return {
      baseScenario: {
        id: comparison.baseScenario?.id || input.baseScenarioId,
        name: comparison.baseScenario?.name || 'Cenário Base',
        revenue: comparison.baseScenario?.revenue || 0,
        costs: comparison.baseScenario?.costs || 0,
        margin: comparison.baseScenario?.margin || 0,
        marginPercentage: comparison.baseScenario?.marginPercentage || 0
      },
      comparisons: comparison.comparisons || [],
      bestScenario,
      message: bestScenario 
        ? `Melhor cenário: ${bestScenario.scenarioName} com margem de €${bestScenario.margin.toFixed(2)}`
        : `Cenário base mantém a melhor margem: €${(comparison.baseScenario?.margin || 0).toFixed(2)}`
    };
  }
}

