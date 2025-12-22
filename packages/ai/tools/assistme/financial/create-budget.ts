import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { financialGridService } from '@platform/services/financial-grid';

export class CreateBudgetTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_budget',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Cria um novo orçamento utilizando o Financial Grid. Suporta períodos diários, semanais, mensais, trimestrais ou anuais.',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do orçamento (ex: "Marketing - Novembro 2025")',
        required: true
      },
      {
        name: 'period',
        type: 'string',
        description: 'Período do orçamento: "daily", "weekly", "monthly", "quarterly" ou "yearly"',
        required: true
      },
      {
        name: 'amount',
        type: 'number',
        description: 'Valor total do orçamento (€)',
        required: true
      },
      {
        name: 'category',
        type: 'string',
        description: 'Categoria (operations/sales/marketing/it/other)',
        required: false
      }
    ],
    outputSchema: z.object({
      budgetId: z.string(),
      name: z.string(),
      period: z.string(),
      amount: z.number(),
      category: z.string().nullable(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      name: string;
      period: string;
      amount: number;
      category?: string;
    },
    context: ToolExecutionContext
  ) {
    // Validate period
    const validPeriods = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    if (!validPeriods.includes(input.period.toLowerCase())) {
      throw new Error(`Período inválido. Use: ${validPeriods.join(', ')}`);
    }

    if (!context.userId) {
      throw new Error('User ID é necessário para criar budget');
    }

    const environment = (context.environment || 'production') as 'production' | 'sandbox';

    // Use FinancialGridService to create budget
    const newBudget = await financialGridService.createBudget(
      context.tenantId,
      {
        name: input.name,
        period: input.period.toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
        amount: input.amount,
        category: input.category,
      },
      context.userId,
      environment
    );

    return {
      budgetId: newBudget.id,
      name: newBudget.name,
      period: newBudget.period,
      amount: parseFloat(newBudget.amount),
      category: newBudget.category,
      message: `Orçamento "${newBudget.name}" criado para período ${newBudget.period} com valor €${parseFloat(newBudget.amount).toFixed(2)}`
    };
  }
}
