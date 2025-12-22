import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projects } from 'shared/schema';
import { eq, and, gte, lte, or, like } from 'drizzle-orm';

export class ListProjectsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_projects',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Lista projetos com filtros opcionais por status, cliente ou data',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status do projeto (planning/active/on_hold/completed/cancelled)',
        required: false
      },
      {
        name: 'clientId',
        type: 'string',
        description: 'Filtrar por ID do cliente',
        required: false
      },
      {
        name: 'startDateFrom',
        type: 'string',
        description: 'Data inicial para filtro (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'startDateTo',
        type: 'string',
        description: 'Data final para filtro (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    outputSchema: z.object({
      projects: z.array(z.object({
        id: z.string(),
        name: z.string(),
        projectCode: z.string(),
        status: z.string(),
        startDate: z.any().nullable(),
        plannedBudget: z.any().nullable()
      })),
      count: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      status?: string;
      clientId?: string;
      startDateFrom?: string;
      startDateTo?: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const conditions: any[] = [eq(projects.tenantId, context.tenantId)];

    if (input.status) {
      conditions.push(eq(projects.status, input.status));
    }
    
    if (input.clientId) {
      conditions.push(eq(projects.clientId, input.clientId));
    }
    
    if (input.startDateFrom) {
      conditions.push(gte(projects.startDate, new Date(input.startDateFrom)));
    }
    
    if (input.startDateTo) {
      conditions.push(lte(projects.startDate, new Date(input.startDateTo)));
    }

    const projectsList = await db
      .select({
        id: projects.id,
        name: projects.name,
        projectCode: projects.projectCode,
        status: projects.status,
        startDate: projects.startDate,
        plannedBudget: projects.plannedBudget
      })
      .from(projects)
      .where(and(...conditions))
      .limit(input.limit || 50);

    return {
      projects: projectsList,
      count: projectsList.length,
      message: `Encontrados ${projectsList.length} projeto(s)`
    };
  }
}
