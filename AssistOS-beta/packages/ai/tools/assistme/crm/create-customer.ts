import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';

export class CreateCustomerTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_customer',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Cria um novo cliente no sistema CRM',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do cliente',
        required: true
      },
      {
        name: 'email',
        type: 'string',
        description: 'Email do cliente',
        required: false
      },
      {
        name: 'phone',
        type: 'string',
        description: 'Telefone do cliente',
        required: false
      },
      {
        name: 'company',
        type: 'string',
        description: 'Empresa do cliente',
        required: false
      },
      {
        name: 'nif',
        type: 'string',
        description: 'NIF (contribuinte)',
        required: false
      },
      {
        name: 'address',
        type: 'string',
        description: 'Morada',
        required: false
      },
      {
        name: 'city',
        type: 'string',
        description: 'Cidade',
        required: false
      },
      {
        name: 'postalCode',
        type: 'string',
        description: 'Código Postal',
        required: false
      }
    ],
    outputSchema: z.object({
      customerId: z.string(),
      name: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      name: string; 
      email?: string; 
      phone?: string; 
      company?: string; 
      nif?: string;
      address?: string;
      city?: string;
      postalCode?: string;
    },
    context: ToolExecutionContext
  ) {
    const [newClient] = await db.insert(clients).values({
      tenantId: context.tenantId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company,
      nif: input.nif,
      address: input.address,
      city: input.city,
      postalCode: input.postalCode,
      status: 'Ativo',
      createdBy: context.userId
    }).returning();

    return {
      customerId: newClient.id,
      name: newClient.name,
      message: `✅ Cliente "${newClient.name}" criado com sucesso!`
    };
  }
}
