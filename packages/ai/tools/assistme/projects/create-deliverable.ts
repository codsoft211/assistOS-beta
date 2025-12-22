import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projectDeliverables, projects, projectMilestones } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class CreateDeliverableTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_deliverable',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Cria um deliverable (entregável) vinculado a um milestone do projeto',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'ID do projeto',
        required: true
      },
      {
        name: 'milestoneId',
        type: 'string',
        description: 'ID do milestone associado',
        required: false
      },
      {
        name: 'name',
        type: 'string',
        description: 'Nome do entregável',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição do entregável',
        required: false
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'Data de entrega esperada (YYYY-MM-DD ou ISO timestamp)',
        required: false
      }
    ],
    outputSchema: z.object({
      deliverableId: z.string(),
      name: z.string(),
      milestoneId: z.string().nullable(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      projectId: string;
      milestoneId?: string;
      name: string;
      description?: string;
      dueDate?: string;
    },
    context: ToolExecutionContext
  ) {
    // Validate project exists and belongs to tenant
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, input.projectId),
        eq(projects.tenantId, context.tenantId)
      )
    });

    if (!project) {
      throw new Error('Projeto não encontrado ou sem permissão');
    }

    // If milestoneId provided, validate it exists and belongs to same project
    if (input.milestoneId) {
      const milestone = await db.query.projectMilestones.findFirst({
        where: and(
          eq(projectMilestones.id, input.milestoneId),
          eq(projectMilestones.tenantId, context.tenantId),
          eq(projectMilestones.projectId, input.projectId)
        )
      });

      if (!milestone) {
        throw new Error('Milestone não encontrado ou não pertence a este projeto');
      }
    }

    const [newDeliverable] = await db.insert(projectDeliverables).values({
      tenantId: context.tenantId,
      projectId: input.projectId,
      milestoneId: input.milestoneId || null,
      name: input.name,
      description: input.description || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: 'pending'
    }).returning() as any[];

    return {
      deliverableId: newDeliverable.id,
      name: newDeliverable.name,
      milestoneId: newDeliverable.milestoneId,
      status: newDeliverable.status,
      message: `Entregável "${newDeliverable.name}" criado com sucesso no projeto "${project.name}"!`
    };
  }
}
