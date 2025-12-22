import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialActivities } from 'shared/schema';

export class LogCallTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'log_call',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Regista uma chamada telefónica',
    parameters: [
      {
        name: 'leadId',
        type: 'string',
        description: 'ID do lead',
        required: true
      },
      {
        name: 'subject',
        type: 'string',
        description: 'Assunto da chamada',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Notas da chamada',
        required: false
      },
      {
        name: 'outcome',
        type: 'string',
        description: 'Resultado (answered, voicemail, no_answer, callback_needed)',
        required: false
      },
      {
        name: 'duration',
        type: 'number',
        description: 'Duração em minutos',
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
      subject: string;
      description?: string;
      outcome?: string;
      duration?: number;
    },
    context: ToolExecutionContext
  ) {
    const metadata: any = {};
    if (input.outcome) metadata.outcome = input.outcome;

    const [newActivity] = await db.insert(commercialActivities).values({
      tenantId: context.tenantId,
      leadId: input.leadId,
      activityType: 'call',
      subject: input.subject,
      description: input.description,
      outcome: input.outcome,
      duration: input.duration,
      completedAt: new Date(),
      createdBy: context.userId,
      metadata: Object.keys(metadata).length > 0 ? metadata : null
    }).returning();

    return {
      activityId: newActivity.id,
      subject: newActivity.subject,
      message: `📞 Chamada registada com sucesso!`
    };
  }
}
