import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { opportunities } from 'shared/schema';

export class CreateOpportunityTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_opportunity',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Cria uma nova oportunidade comercial',
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: 'Título da oportunidade',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição',
        required: false
      },
      {
        name: 'clientId',
        type: 'string',
        description: 'ID do cliente',
        required: false
      },
      {
        name: 'clientName',
        type: 'string',
        description: 'Nome do cliente',
        required: false
      },
      {
        name: 'type',
        type: 'string',
        description: 'Tipo de oportunidade',
        required: true
      },
      {
        name: 'estimatedValue',
        type: 'number',
        description: 'Valor estimado',
        required: false
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Prioridade (low/medium/high)',
        required: false,
        default: 'medium'
      }
    ],
    outputSchema: z.object({
      opportunityId: z.string(),
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
      clientId?: string;
      clientName?: string;
      type: string;
      estimatedValue?: number;
      priority?: string;
    },
    context: ToolExecutionContext
  ) {
    const [newOpportunity] = await db.insert(opportunities).values({
      tenantId: context.tenantId,
      title: input.title,
      description: input.description,
      clientId: input.clientId,
      clientName: input.clientName,
      type: input.type,
      source: 'manual',
      stage: 'prospecting',
      priority: input.priority || 'medium',
      estimatedValue: input.estimatedValue ? input.estimatedValue.toString() : null,
      status: 'open',
      createdBy: context.userId
    }).returning();

    return {
      opportunityId: newOpportunity.id,
      title: newOpportunity.title,
      message: `✅ Oportunidade "${newOpportunity.title}" criada com sucesso!`
    };
  }
}
