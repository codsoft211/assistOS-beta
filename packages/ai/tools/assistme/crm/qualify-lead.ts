import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialLeads } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class QualifyLeadTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'qualify_lead',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Qualifica um lead calculando score baseado em completude e valor',
    parameters: [
      {
        name: 'leadId',
        type: 'string',
        description: 'ID do lead',
        required: true
      }
    ],
    outputSchema: z.object({
      leadId: z.string(),
      score: z.number(),
      quality: z.string(),
      breakdown: z.object({
        completeness: z.number(),
        valueScore: z.number()
      }),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { leadId: string },
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

    let completeness = 0;
    const fields = [
      lead.contactName,
      lead.contactEmail,
      lead.contactPhone,
      lead.description,
      lead.leadSource,
      lead.budgetTotal
    ];

    const filledFields = fields.filter(f => f !== null && f !== undefined && f !== '').length;
    completeness = Math.round((filledFields / fields.length) * 100);

    let valueScore = 0;
    if (lead.budgetTotal) {
      const budget = parseFloat(lead.budgetTotal.toString());
      if (budget > 10000) valueScore = 100;
      else if (budget > 5000) valueScore = 75;
      else if (budget > 1000) valueScore = 50;
      else valueScore = 25;
    }

    const totalScore = Math.round((completeness * 0.5) + (valueScore * 0.5));

    let quality = 'Baixo';
    if (totalScore >= 75) quality = 'Alto';
    else if (totalScore >= 50) quality = 'Médio';

    return {
      leadId: input.leadId,
      score: totalScore,
      quality,
      breakdown: {
        completeness,
        valueScore
      },
      message: `📊 Lead qualificado: Score ${totalScore}/100 (${quality})`
    };
  }
}
