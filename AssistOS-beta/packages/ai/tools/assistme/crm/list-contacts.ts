import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, desc, isNotNull } from 'drizzle-orm';

export class ListContactsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_contacts',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Lista contactos (clientes com email ou telefone)',
    parameters: [
      {
        name: 'company',
        type: 'string',
        description: 'Filtrar por empresa',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    outputSchema: z.object({
      contacts: z.array(z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        company: z.string().nullable(),
        status: z.string()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { company?: string; limit?: number },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const conditions = [
      eq(clients.tenantId, context.tenantId)
    ];

    if (input.company) {
      conditions.push(eq(clients.company, input.company));
    }

    const results = await db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
        company: clients.company,
        status: clients.status
      })
      .from(clients)
      .where(and(...conditions))
      .orderBy(desc(clients.createdAt))
      .limit(limit);

    return {
      contacts: results,
      total: results.length,
      message: `📋 Listados ${results.length} contacto(s)`
    };
  }
}
