import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projects, clients } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class CreateProjectTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_project',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Cria um novo projeto no sistema de gestão de projetos',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do projeto',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição do projeto',
        required: false
      },
      {
        name: 'clientId',
        type: 'string',
        description: 'ID do cliente',
        required: false
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de fim prevista (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'plannedBudget',
        type: 'number',
        description: 'Orçamento planeado',
        required: false
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Prioridade do projeto (Low/Medium/High)',
        required: false,
        default: 'Medium'
      }
    ],
    outputSchema: z.object({
      projectId: z.string(),
      name: z.string(),
      projectCode: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      name: string;
      description?: string;
      clientId?: string;
      startDate: string;
      endDate?: string;
      plannedBudget?: number;
      priority?: string;
    },
    context: ToolExecutionContext
  ) {
    // SECURITY: If clientId provided, verify it belongs to tenant before creating project
    if (input.clientId) {
      const client = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, input.clientId),
          eq(clients.tenantId, context.tenantId)
        )
      });

      if (!client) {
        throw new Error('Cliente não encontrado ou sem permissão');
      }
    }

    const projectCode = `PROJ-${Date.now()}`;
    
    const [newProject] = await db.insert(projects).values({
      tenantId: context.tenantId,
      name: input.name,
      description: input.description,
      clientId: input.clientId,
      projectCode,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      plannedBudget: input.plannedBudget?.toString(),
      priority: input.priority || 'Medium',
      status: 'planning',
      actualCost: '0',
      createdBy: context.userId
    }).returning() as any[];

    return {
      projectId: newProject.id,
      name: newProject.name,
      projectCode: newProject.projectCode,
      message: `Projeto "${newProject.name}" criado com sucesso com o código ${newProject.projectCode}!`
    };
  }
}
