import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projects, projectPhases, projectTasks } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class GenerateGanttTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_gantt',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Gera dados estruturados para criar um Gantt chart do projeto',
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
      startDate: z.any().nullable(),
      endDate: z.any().nullable(),
      phases: z.array(z.object({
        id: z.string(),
        name: z.string(),
        startDate: z.any().nullable(),
        endDate: z.any().nullable(),
        status: z.string(),
        order: z.number()
      })),
      tasks: z.array(z.object({
        id: z.string(),
        name: z.string(),
        phaseId: z.any().nullable(),
        startDate: z.any().nullable(),
        dueDate: z.any().nullable(),
        status: z.string(),
        assignedTo: z.any().nullable(),
        dependencies: z.any().nullable(),
        isCriticalPath: z.boolean()
      })),
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
      .select({
        id: projectPhases.id,
        name: projectPhases.name,
        startDate: projectPhases.startDate,
        endDate: projectPhases.endDate,
        status: projectPhases.status,
        order: projectPhases.phaseOrder
      })
      .from(projectPhases)
      .where(
        and(
          eq(projectPhases.projectId, input.projectId),
          eq(projectPhases.tenantId, context.tenantId)
        )
      );

    // SECURITY: Only fetch tasks that belong to tenant
    const tasks = await db
      .select({
        id: projectTasks.id,
        name: projectTasks.name,
        phaseId: projectTasks.phaseId,
        startDate: projectTasks.startDate,
        dueDate: projectTasks.dueDate,
        status: projectTasks.status,
        assignedTo: projectTasks.assignedTo,
        dependencies: projectTasks.dependencies,
        isCriticalPath: projectTasks.isCriticalPath
      })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, input.projectId),
          eq(projectTasks.tenantId, context.tenantId)
        )
      );

    return {
      projectId: project.id,
      projectName: project.name,
      startDate: project.startDate,
      endDate: project.endDate,
      phases,
      tasks,
      message: `Dados Gantt gerados para o projeto "${project.name}" com ${phases.length} fases e ${tasks.length} tarefas`
    };
  }
}
