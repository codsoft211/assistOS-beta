import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { opportunities } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class UpdateOpportunityTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'update_opportunity',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Atualiza uma oportunidade (stage, valor, status, etc)',
    parameters: [
      {
        name: 'opportunityId',
        type: 'string',
        description: 'ID da oportunidade',
        required: true
      },
      {
        name: 'stage',
        type: 'string',
        description: 'Stage do pipeline (prospecting, qualification, proposal, negotiation, closed_won, closed_lost)',
        required: false
      },
      {
        name: 'estimatedValue',
        type: 'number',
        description: 'Valor estimado',
        required: false
      },
      {
        name: 'probability',
        type: 'number',
        description: 'Probabilidade de fechar (0-100)',
        required: false
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Prioridade (low/medium/high)',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Status (open/won/lost)',
        required: false
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas',
        required: false
      }
    ],
    outputSchema: z.object({
      opportunityId: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      opportunityId: string;
      stage?: string;
      estimatedValue?: number;
      probability?: number;
      priority?: string;
      status?: string;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    const updateData: any = {};
    
    if (input.stage !== undefined) updateData.stage = input.stage;
    if (input.estimatedValue !== undefined) updateData.estimatedValue = input.estimatedValue.toString();
    if (input.probability !== undefined) updateData.probability = input.probability;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.notes !== undefined) updateData.notes = input.notes;

    if (Object.keys(updateData).length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    const [updatedOpportunity] = await db
      .update(opportunities)
      .set(updateData)
      .where(
        and(
          eq(opportunities.id, input.opportunityId),
          eq(opportunities.tenantId, context.tenantId)
        )
      )
      .returning();

    if (!updatedOpportunity) {
      throw new Error('Oportunidade não encontrada');
    }

    return {
      opportunityId: updatedOpportunity.id,
      message: `✅ Oportunidade atualizada com sucesso!`
    };
  }
}
