import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';

export class CalculateVatTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'calculate_vat',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Calcula IVA português para uma fatura (23% normal, 13% intermédio, 6% reduzido)',
    parameters: [
      {
        name: 'netAmount',
        type: 'number',
        description: 'Valor líquido (sem IVA)',
        required: true
      },
      {
        name: 'vatRate',
        type: 'number',
        description: 'Taxa de IVA (23, 13, ou 6)',
        required: false,
        default: 23
      }
    ],
    outputSchema: z.object({
      netAmount: z.number(),
      vatRate: z.number(),
      vatAmount: z.number(),
      grossAmount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      netAmount: number;
      vatRate?: number;
    },
    context: ToolExecutionContext
  ) {
    const vatRate = input.vatRate || 23;
    
    const validRates = [23, 13, 6, 0];
    if (!validRates.includes(vatRate)) {
      throw new Error(`Taxa de IVA inválida. Use 23% (normal), 13% (intermédio), 6% (reduzido), ou 0% (isento)`);
    }

    const vatAmount = (input.netAmount * vatRate) / 100;
    const grossAmount = input.netAmount + vatAmount;

    let rateLabel = '';
    if (vatRate === 23) rateLabel = 'normal';
    else if (vatRate === 13) rateLabel = 'intermédio';
    else if (vatRate === 6) rateLabel = 'reduzido';
    else if (vatRate === 0) rateLabel = 'isento';

    return {
      netAmount: input.netAmount,
      vatRate,
      vatAmount: parseFloat(vatAmount.toFixed(2)),
      grossAmount: parseFloat(grossAmount.toFixed(2)),
      message: `IVA calculado (${vatRate}% ${rateLabel}): €${vatAmount.toFixed(2)} | Total: €${grossAmount.toFixed(2)}`
    };
  }
}
