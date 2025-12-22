import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialLeads } from 'shared/schema';

export class CreateLeadTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_lead',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Cria um novo lead comercial',
    parameters: [
      {
        name: 'description',
        type: 'string',
        description: 'Descrição do lead',
        required: true
      },
      {
        name: 'contactName',
        type: 'string',
        description: 'Nome do contacto',
        required: false
      },
      {
        name: 'contactEmail',
        type: 'string',
        description: 'Email do contacto',
        required: false
      },
      {
        name: 'contactPhone',
        type: 'string',
        description: 'Telefone do contacto',
        required: false
      },
      {
        name: 'leadSource',
        type: 'string',
        description: 'Origem do lead (website, referral, cold-call, etc)',
        required: false
      },
      {
        name: 'budgetTotal',
        type: 'number',
        description: 'Valor estimado do orçamento',
        required: false
      }
    ],
    outputSchema: z.object({
      leadId: z.string(),
      description: z.string().nullable(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      description: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      leadSource?: string;
      budgetTotal?: number;
    },
    context: ToolExecutionContext
  ) {
    const [newLead] = await db.insert(commercialLeads).values({
      tenantId: context.tenantId,
      description: input.description,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      leadSource: input.leadSource,
      budgetTotal: input.budgetTotal ? input.budgetTotal.toString() : null,
      status: 'Proposta Enviada',
      ownerId: context.userId
    }).returning();

    return {
      leadId: newLead.id,
      description: newLead.description,
      message: `✅ Lead criado com sucesso!`
    };
  }
}
