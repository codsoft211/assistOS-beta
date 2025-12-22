import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class UpdateCustomerTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'update_customer',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Atualiza informações de um cliente existente',
    parameters: [
      {
        name: 'customerId',
        type: 'string',
        description: 'ID do cliente',
        required: true
      },
      {
        name: 'name',
        type: 'string',
        description: 'Nome do cliente',
        required: false
      },
      {
        name: 'email',
        type: 'string',
        description: 'Email',
        required: false
      },
      {
        name: 'phone',
        type: 'string',
        description: 'Telefone',
        required: false
      },
      {
        name: 'company',
        type: 'string',
        description: 'Empresa',
        required: false
      },
      {
        name: 'nif',
        type: 'string',
        description: 'NIF',
        required: false
      },
      {
        name: 'address',
        type: 'string',
        description: 'Morada',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Status (Ativo/Inativo)',
        required: false
      }
    ],
    outputSchema: z.object({
      customerId: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      customerId: string;
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
      nif?: string;
      address?: string;
      status?: string;
    },
    context: ToolExecutionContext
  ) {
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.company !== undefined) updateData.company = input.company;
    if (input.nif !== undefined) updateData.nif = input.nif;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.status !== undefined) updateData.status = input.status;

    if (Object.keys(updateData).length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    const [updatedClient] = await db
      .update(clients)
      .set(updateData)
      .where(
        and(
          eq(clients.id, input.customerId),
          eq(clients.tenantId, context.tenantId)
        )
      )
      .returning();

    if (!updatedClient) {
      throw new Error('Cliente não encontrado');
    }

    return {
      customerId: updatedClient.id,
      message: `✅ Cliente atualizado com sucesso!`
    };
  }
}
