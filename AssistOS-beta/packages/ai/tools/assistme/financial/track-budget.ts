import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { budgetingEngineService } from '@platform/services/budgeting-engine';
import { db } from '../../../../../apps/api/db';
import { budgets } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class TrackBudgetTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'track_budget',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Acompanha execução orçamental usando Budgeting Engine. Calcula gastos reais de invoices e compara com budget.',
    parameters: [
      {
        name: 'budgetId',
        type: 'string',
        description: 'ID do orçamento a acompanhar',
        required: false
      },
      {
        name: 'category',
        type: 'string',
        description: 'Categoria do budget (se não fornecer budgetId)',
        required: false
      }
    ],
    outputSchema: z.object({
      budgets: z.array(z.object({
        budgetId: z.string(),
        name: z.string(),
        category: z.string(),
        allocated: z.number(),
        spent: z.number(),
        remaining: z.number(),
        percentageUsed: z.number(),
        status: z.enum(['on_track', 'warning', 'exceeded'])
      })),
      totalAllocated: z.number(),
      totalSpent: z.number(),
      totalRemaining: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      budgetId?: string;
      category?: string;
    },
    context: ToolExecutionContext
  ) {
    // If budgetId provided, get specific budget
    if (input.budgetId) {
      const budget = await db
        .select()
        .from(budgets)
        .where(
          and(
            eq(budgets.tenantId, context.tenantId),
            eq(budgets.id, input.budgetId)
          )
        )
        .limit(1);

      if (!budget.length) {
        throw new Error('Orçamento não encontrado');
      }

      const b = budget[0];
      const allocated = parseFloat(b.amount);
      
      // Use Budgeting Engine to get actual spending
      const tracking = await budgetingEngineService.trackSpending(context.tenantId);
      const budgetTracking = tracking.budgets.find(bt => bt.id === input.budgetId);
      
      const spent = budgetTracking?.spent || 0;
      const remaining = allocated - spent;
      const percentageUsed = allocated > 0 ? (spent / allocated) * 100 : 0;
      const status = budgetTracking?.status || 'on_track';

      return {
        budgets: [{
          budgetId: b.id,
          name: b.name,
          category: b.category || '',
          allocated,
          spent,
          remaining,
          percentageUsed: parseFloat(percentageUsed.toFixed(2)),
          status: status as 'on_track' | 'warning' | 'exceeded'
        }],
        totalAllocated: allocated,
        totalSpent: spent,
        totalRemaining: remaining,
        message: `Orçamento "${b.name}": ${percentageUsed.toFixed(1)}% utilizado (€${spent.toFixed(2)} de €${allocated.toFixed(2)})`
      };
    }

    // If category provided, get budgets for that category
    if (input.category) {
      const categoryBudgets = await db
        .select()
        .from(budgets)
        .where(
          and(
            eq(budgets.tenantId, context.tenantId),
            eq(budgets.category, input.category)
          )
        );

      const tracking = await budgetingEngineService.trackSpending(context.tenantId);
      
      const budgetsWithTracking = categoryBudgets.map(b => {
        const allocated = parseFloat(b.amount);
        const budgetTracking = tracking.budgets.find(bt => bt.id === b.id);
        const spent = budgetTracking?.spent || 0;
        const remaining = allocated - spent;
        const percentageUsed = allocated > 0 ? (spent / allocated) * 100 : 0;
        const status = budgetTracking?.status || 'on_track';

        return {
          budgetId: b.id,
          name: b.name,
          category: b.category || '',
          allocated,
          spent,
          remaining,
          percentageUsed: parseFloat(percentageUsed.toFixed(2)),
          status: status as 'on_track' | 'warning' | 'exceeded'
        };
      });

      const totalAllocated = budgetsWithTracking.reduce((sum, b) => sum + b.allocated, 0);
      const totalSpent = budgetsWithTracking.reduce((sum, b) => sum + b.spent, 0);
      const totalRemaining = totalAllocated - totalSpent;

      return {
        budgets: budgetsWithTracking,
        totalAllocated,
        totalSpent,
        totalRemaining,
        message: `Encontrados ${budgetsWithTracking.length} orçamentos na categoria "${input.category}"`
      };
    }

    // If neither provided, get all budgets
    const tracking = await budgetingEngineService.trackSpending(context.tenantId);

    return {
      budgets: tracking.budgets,
      totalAllocated: tracking.totalAllocated,
      totalSpent: tracking.totalSpent,
      totalRemaining: tracking.totalRemaining,
      message: `Acompanhamento de ${tracking.budgets.length} orçamentos`
    };
  }
}
