import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';

export class CalculateIrcEstimateTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'calculate_irc_estimate',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Estima IRC (Imposto sobre Rendimento Coletivo) a 21% sobre lucros',
    parameters: [
      {
        name: 'revenue',
        type: 'number',
        description: 'Receitas totais do período',
        required: true
      },
      {
        name: 'expenses',
        type: 'number',
        description: 'Despesas totais do período',
        required: true
      },
      {
        name: 'year',
        type: 'number',
        description: 'Ano fiscal',
        required: true
      }
    ],
    outputSchema: z.object({
      revenue: z.number(),
      expenses: z.number(),
      profit: z.number(),
      taxableProfit: z.number(),
      ircAmount: z.number(),
      effectiveRate: z.number(),
      year: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { revenue: number; expenses: number; year: number },
    context: ToolExecutionContext
  ) {
    const profit = input.revenue - input.expenses;
    const taxableProfit = Math.max(0, profit); // IRC only on positive profits
    const ircRate = 0.21; // 21% standard IRC rate in Portugal
    const ircAmount = taxableProfit * ircRate;
    const effectiveRate = input.revenue > 0 ? (ircAmount / input.revenue) * 100 : 0;

    return {
      revenue: Math.round(input.revenue * 100) / 100,
      expenses: Math.round(input.expenses * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      taxableProfit: Math.round(taxableProfit * 100) / 100,
      ircAmount: Math.round(ircAmount * 100) / 100,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      year: input.year,
      message: `📊 IRC estimado para ${input.year}: ${ircAmount.toFixed(2)}€ (21% sobre lucro de ${taxableProfit.toFixed(2)}€)`
    };
  }
}
