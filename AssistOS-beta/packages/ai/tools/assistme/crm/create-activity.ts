import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialActivities } from 'shared/schema';

export class CreateActivityTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_activity',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Cria uma atividade genérica ligada a um lead',
    parameters: [
      {
        name: 'leadId',
        type: 'string',
        description: 'ID do lead',
        required: true
      },
      {
        name: 'activityType',
        type: 'string',
        description: 'Tipo de atividade (call, meeting, email, task, note)',
        required: true
      },
      {
        name: 'subject',
        type: 'string',
        description: 'Assunto',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição',
        required: false
      },
      {
        name: 'outcome',
        type: 'string',
        description: 'Resultado',
        required: false
      }
    ],
    outputSchema: z.object({
      activityId: z.string(),
      subject: z.string().nullable(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      leadId: string;
      activityType: string;
      subject: string;
      description?: string;
      outcome?: string;
    },
    context: ToolExecutionContext
  ) {
    const [newActivity] = await db.insert(commercialActivities).values({
      tenantId: context.tenantId,
      leadId: input.leadId,
      activityType: input.activityType,
      subject: input.subject,
      description: input.description,
      outcome: input.outcome,
      completedAt: new Date(),
      createdBy: context.userId
    }).returning();

    return {
      activityId: newActivity.id,
      subject: newActivity.subject,
      message: `✅ Atividade "${newActivity.subject}" registada com sucesso!`
    };
  }
}
