import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';

export class CalculateIvaTaxTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'calculate_iva_tax',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Calcula IVA (23%, 13%, 6%) para valores monetários',
    parameters: [
      {
        name: 'amount',
        type: 'number',
        description: 'Valor monetário base (sem IVA)',
        required: true
      },
      {
        name: 'rate',
        type: 'string',
        description: 'Taxa de IVA: normal (23%), intermediate (13%), ou reduced (6%)',
        required: true
      }
    ],
    outputSchema: z.object({
      netAmount: z.number(),
      vatAmount: z.number(),
      grossAmount: z.number(),
      rate: z.string(),
      ratePercentage: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { amount: number; rate: 'normal' | 'intermediate' | 'reduced' },
    context: ToolExecutionContext
  ) {
    const rateMap: Record<string, number> = {
      normal: 0.23,
      intermediate: 0.13,
      reduced: 0.06
    };

    const vatRate = rateMap[input.rate];
    if (!vatRate && vatRate !== 0) {
      throw new Error('Taxa de IVA inválida. Use: normal, intermediate, ou reduced');
    }

    const netAmount = input.amount;
    const vatAmount = netAmount * vatRate;
    const grossAmount = netAmount + vatAmount;

    return {
      netAmount: Math.round(netAmount * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      grossAmount: Math.round(grossAmount * 100) / 100,
      rate: input.rate,
      ratePercentage: vatRate * 100,
      message: `💶 IVA calculado: ${netAmount.toFixed(2)}€ + ${vatAmount.toFixed(2)}€ (${(vatRate * 100)}%) = ${grossAmount.toFixed(2)}€`
    };
  }
}
