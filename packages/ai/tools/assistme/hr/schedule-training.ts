import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { trainingPrograms } from 'shared/schema';

export class ScheduleTrainingTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'schedule_training',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Agenda uma formação ou treino para os funcionários',
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: 'Título da formação',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição da formação',
        required: false
      },
      {
        name: 'instructor',
        type: 'string',
        description: 'Nome do instrutor',
        required: false
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início (YYYY-MM-DD HH:MM)',
        required: true
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de fim (YYYY-MM-DD HH:MM)',
        required: false
      },
      {
        name: 'participants',
        type: 'array',
        description: 'IDs dos participantes',
        required: false
      }
    ],
    outputSchema: z.object({
      trainingId: z.string(),
      title: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      title: string;
      description?: string;
      instructor?: string;
      startDate: string;
      endDate?: string;
      participants?: string[];
    },
    context: ToolExecutionContext
  ) {
    const [training] = await db.insert(trainingPrograms).values({
      tenantId: context.tenantId,
      title: input.title,
      description: input.description,
      instructor: input.instructor,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      participants: input.participants || [],
      status: 'Agendada',
      createdBy: context.userId
    }).returning();

    const participantCount = input.participants?.length || 0;

    return {
      trainingId: training.id,
      title: training.title,
      message: `Formação "${training.title}" agendada com sucesso${participantCount > 0 ? ` (${participantCount} participantes)` : ''}`
    };
  }
}
