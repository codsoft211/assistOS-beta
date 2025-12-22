import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projects, projectTasks } from 'shared/schema';
import { eq, and, ne } from 'drizzle-orm';

export class CloseProjectTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'close_project',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Fecha um projeto marcando-o como concluído após validações',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'ID do projeto a fechar',
        required: true
      },
      {
        name: 'forceClose',
        type: 'boolean',
        description: 'Forçar fecho mesmo com tarefas pendentes',
        required: false,
        default: false
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas de fecho do projeto',
        required: false
      }
    ],
    outputSchema: z.object({
      projectId: z.string(),
      projectName: z.string(),
      status: z.string(),
      closedAt: z.any(),
      warnings: z.array(z.string()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      projectId: string;
      forceClose?: boolean;
      notes?: string;
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

    if (project.status === 'completed' || project.status === 'cancelled') {
      throw new Error(`Projeto já está ${project.status === 'completed' ? 'concluído' : 'cancelado'}`);
    }

    const warnings: string[] = [];

    // SECURITY: Only fetch tasks that belong to tenant
    const incompleteTasks = await db
      .select()
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, input.projectId),
          eq(projectTasks.tenantId, context.tenantId),
          ne(projectTasks.status, 'completed'),
          ne(projectTasks.status, 'done')
        )
      );

    if (incompleteTasks.length > 0 && !input.forceClose) {
      throw new Error(
        `Não é possível fechar o projeto. Existem ${incompleteTasks.length} tarefa(s) por concluir. Use forceClose=true para forçar o fecho.`
      );
    }

    if (incompleteTasks.length > 0 && input.forceClose) {
      warnings.push(`Projeto fechado com ${incompleteTasks.length} tarefa(s) ainda pendente(s)`);
    }

    const updateData: any = {
      status: 'completed',
      endDate: new Date(),
      updatedAt: new Date()
    };

    if (input.notes) {
      const existingNotes = project.notes || '';
      updateData.notes = existingNotes 
        ? `${existingNotes}\n\n[Fecho ${new Date().toISOString()}]: ${input.notes}`
        : `[Fecho ${new Date().toISOString()}]: ${input.notes}`;
    }

    // SECURITY: Update only projects that belong to tenant
    const [closedProject] = await db
      .update(projects)
      .set(updateData)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.tenantId, context.tenantId)
        )
      )
      .returning();

    return {
      projectId: closedProject.id,
      projectName: closedProject.name,
      status: closedProject.status,
      closedAt: closedProject.endDate,
      warnings,
      message: warnings.length > 0
        ? `Projeto "${closedProject.name}" fechado com avisos: ${warnings.join(', ')}`
        : `Projeto "${closedProject.name}" fechado com sucesso!`
    };
  }
}
