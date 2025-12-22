import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';

export class CreateContactTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_contact',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Cria um contacto individual para um cliente/empresa',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do contacto',
        required: true
      },
      {
        name: 'email',
        type: 'string',
        description: 'Email do contacto',
        required: false
      },
      {
        name: 'phone',
        type: 'string',
        description: 'Telefone do contacto',
        required: false
      },
      {
        name: 'company',
        type: 'string',
        description: 'Empresa associada',
        required: false
      },
      {
        name: 'role',
        type: 'string',
        description: 'Função/cargo',
        required: false
      }
    ],
    outputSchema: z.object({
      contactId: z.string(),
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
      role?: string;
    },
    context: ToolExecutionContext
  ) {
    const otherInfo: any = {};
    if (input.role) {
      otherInfo.role = input.role;
    }

    const [newContact] = await db.insert(clients).values({
      tenantId: context.tenantId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company,
      otherInfo: Object.keys(otherInfo).length > 0 ? otherInfo : null,
      status: 'Ativo',
      createdBy: context.userId
    }).returning();

    return {
      contactId: newContact.id,
      name: newContact.name,
      message: `✅ Contacto "${newContact.name}" criado com sucesso!`
    };
  }
}
