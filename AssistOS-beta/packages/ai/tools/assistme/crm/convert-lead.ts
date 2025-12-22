import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialLeads, opportunities } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ConvertLeadTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'convert_lead',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Converte um lead em oportunidade',
    parameters: [
      {
        name: 'leadId',
        type: 'string',
        description: 'ID do lead a converter',
        required: true
      },
      {
        name: 'opportunityTitle',
        type: 'string',
        description: 'Título da oportunidade',
        required: false
      },
      {
        name: 'estimatedValue',
        type: 'number',
        description: 'Valor estimado',
        required: false
      }
    ],
    outputSchema: z.object({
      leadId: z.string(),
      opportunityId: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      leadId: string;
      opportunityTitle?: string;
      estimatedValue?: number;
    },
    context: ToolExecutionContext
  ) {
    const [lead] = await db
      .select()
      .from(commercialLeads)
      .where(
        and(
          eq(commercialLeads.id, input.leadId),
          eq(commercialLeads.tenantId, context.tenantId)
        )
      );

    if (!lead) {
      throw new Error('Lead não encontrado');
    }

    const title = input.opportunityTitle || lead.description || 'Nova Oportunidade';
    const value = input.estimatedValue || (lead.budgetTotal ? parseFloat(lead.budgetTotal.toString()) : null);

    const [newOpportunity] = await db.insert(opportunities).values({
      tenantId: context.tenantId,
      title,
      description: lead.description,
      leadId: lead.id,
      clientName: lead.contactName,
      type: lead.eventType || 'general',
      source: 'converted_lead',
      stage: 'prospecting',
      priority: 'medium',
      estimatedValue: value ? value.toString() : null,
      status: 'open',
      assignedTo: lead.ownerId,
      createdBy: context.userId
    }).returning();

    await db
      .update(commercialLeads)
      .set({ status: 'Convertido' })
      .where(eq(commercialLeads.id, input.leadId));

    return {
      leadId: input.leadId,
      opportunityId: newOpportunity.id,
      message: `✅ Lead convertido em oportunidade com sucesso!`
    };
  }
}
