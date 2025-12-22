import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projects, projectPhases, projectTasks, projectTimeEntries } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class ProjectStatusReportTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'project_status_report',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Gera um relatório completo de status do projeto com progresso, orçamento e recursos',
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
      status: z.string(),
      budget: z.object({
        planned: z.any().nullable(),
        actual: z.any().nullable(),
        variance: z.number(),
        variancePercentage: z.number()
      }),
      progress: z.object({
        totalPhases: z.number(),
        completedPhases: z.number(),
        totalTasks: z.number(),
        completedTasks: z.number(),
        overallProgress: z.number()
      }),
      timeTracked: z.object({
        totalHours: z.number(),
        billableHours: z.number()
      }),
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

    // SECURITY: Only fetch phases that belong to tenant
    const phases = await db
      .select()
      .from(projectPhases)
      .where(
        and(
          eq(projectPhases.projectId, input.projectId),
          eq(projectPhases.tenantId, context.tenantId)
        )
      );

    // SECURITY: Only fetch tasks that belong to tenant
    const tasks = await db
      .select()
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, input.projectId),
          eq(projectTasks.tenantId, context.tenantId)
        )
      );

    // SECURITY: Only fetch time entries that belong to tenant
    const timeEntries = await db
      .select()
      .from(projectTimeEntries)
      .where(
        and(
          eq(projectTimeEntries.projectId, input.projectId),
          eq(projectTimeEntries.tenantId, context.tenantId)
        )
      );

    const completedPhases = phases.filter(p => p.status === 'completed').length;
    const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'done').length;

    const totalHours = timeEntries.reduce((sum, entry) => sum + parseFloat(entry.hours || '0'), 0);
    const billableHours = timeEntries
      .filter(e => e.billable)
      .reduce((sum, entry) => sum + parseFloat(entry.hours || '0'), 0);

    const plannedBudget = parseFloat(project.plannedBudget || '0');
    const actualCost = parseFloat(project.actualCost || '0');
    const variance = plannedBudget - actualCost;
    const variancePercentage = plannedBudget > 0 ? ((variance / plannedBudget) * 100) : 0;

    const overallProgress = tasks.length > 0 
      ? Math.round((completedTasks / tasks.length) * 100)
      : 0;

    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      budget: {
        planned: project.plannedBudget,
        actual: project.actualCost,
        variance,
        variancePercentage: parseFloat(variancePercentage.toFixed(2))
      },
      progress: {
        totalPhases: phases.length,
        completedPhases,
        totalTasks: tasks.length,
        completedTasks,
        overallProgress
      },
      timeTracked: {
        totalHours: parseFloat(totalHours.toFixed(2)),
        billableHours: parseFloat(billableHours.toFixed(2))
      },
      message: `Relatório de status gerado: Projeto "${project.name}" está ${overallProgress}% concluído`
    };
  }
}
