import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projects } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class CheckBudgetVarianceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'check_budget_variance',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Verifica o desvio orçamental de um projeto (budget vs custo real)',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'ID do projeto',
        required: true
      }
    ],
    outputSchema: z.object({
      projectId: z.string(),
      projectName: z.string(),
      plannedBudget: z.any().nullable(),
      actualCost: z.any().nullable(),
      variance: z.number(),
      variancePercentage: z.number(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      projectId: string;
    },
    context: ToolExecutionContext
  ) {
    // SECURITY: Only access projects that belong to tenant
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, input.projectId),
        eq(projects.tenantId, context.tenantId)
      )
    });

    if (!project) {
      throw new Error('Projeto não encontrado ou sem permissão');
    }

    const plannedBudget = parseFloat(project.plannedBudget || '0');
    const actualCost = parseFloat(project.actualCost || '0');
    const variance = plannedBudget - actualCost;
    const variancePercentage = plannedBudget > 0 
      ? ((variance / plannedBudget) * 100) 
      : 0;

    let status = 'dentro_orcamento';
    let message = `Projeto dentro do orçamento`;

    if (variancePercentage < -10) {
      status = 'acima_orcamento';
      message = `Projeto está ${Math.abs(variancePercentage).toFixed(1)}% acima do orçamento planeado`;
    } else if (variancePercentage < 0) {
      status = 'ligeiramente_acima';
      message = `Projeto está ligeiramente acima do orçamento (${Math.abs(variancePercentage).toFixed(1)}%)`;
    } else if (variancePercentage > 0) {
      message = `Projeto está ${variancePercentage.toFixed(1)}% abaixo do orçamento planeado`;
    }

    return {
      projectId: project.id,
      projectName: project.name,
      plannedBudget: project.plannedBudget,
      actualCost: project.actualCost,
      variance,
      variancePercentage: parseFloat(variancePercentage.toFixed(2)),
      status,
      message
    };
  }
}
