import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialActivities } from 'shared/schema';

export class LogEmailTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'log_email',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Regista um email enviado/recebido',
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
        description: 'Assunto do email',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Corpo do email ou resumo',
        required: false
      },
      {
        name: 'outcome',
        type: 'string',
        description: 'Resultado (sent, received, replied, opened)',
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
    },
    context: ToolExecutionContext
  ) {
    const metadata: any = {};
    if (input.outcome) metadata.emailStatus = input.outcome;

    const [newActivity] = await db.insert(commercialActivities).values({
      tenantId: context.tenantId,
      leadId: input.leadId,
      activityType: 'email',
      subject: input.subject,
      description: input.description,
      outcome: input.outcome,
      completedAt: new Date(),
      createdBy: context.userId,
      metadata: Object.keys(metadata).length > 0 ? metadata : null
    }).returning();

    return {
      activityId: newActivity.id,
      subject: newActivity.subject,
      message: `📧 Email registado com sucesso!`
    };
  }
}
