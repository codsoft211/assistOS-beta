import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projectTimeEntries, projects } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class TrackTimeTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'track_time',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Regista tempo trabalhado numa tarefa ou projeto',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'ID do projeto',
        required: true
      },
      {
        name: 'taskId',
        type: 'string',
        description: 'ID da tarefa (opcional)',
        required: false
      },
      {
        name: 'hours',
        type: 'number',
        description: 'Número de horas trabalhadas',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição do trabalho realizado',
        required: true
      },
      {
        name: 'date',
        type: 'string',
        description: 'Data do trabalho (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'billable',
        type: 'boolean',
        description: 'Se o tempo é faturável',
        required: false,
        default: true
      }
    ],
    outputSchema: z.object({
      entryId: z.string(),
      hours: z.string(),
      description: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      projectId: string;
      taskId?: string;
      hours: number;
      description: string;
      date?: string;
      billable?: boolean;
    },
    context: ToolExecutionContext
  ) {
    // SECURITY: Verify project belongs to tenant before logging time
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, input.projectId),
        eq(projects.tenantId, context.tenantId)
      )
    });

    if (!project) {
      throw new Error('Projeto não encontrado ou sem permissão');
    }

    const [timeEntry] = await db.insert(projectTimeEntries).values({
      tenantId: context.tenantId,
      projectId: input.projectId,
      taskId: input.taskId,
      userId: context.userId,
      date: input.date ? new Date(input.date) : new Date(),
      hours: input.hours.toString(),
      description: input.description,
      billable: input.billable !== undefined ? input.billable : true,
      status: 'draft'
    }).returning();

    return {
      entryId: timeEntry.id,
      hours: timeEntry.hours,
      description: timeEntry.description,
      message: `Registadas ${timeEntry.hours} horas de trabalho com sucesso!`
    };
  }
}
