import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, or, ilike } from 'drizzle-orm';

export class SearchCustomersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'search_customers',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Pesquisa clientes por nome, email ou NIF (case-insensitive)',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Texto para pesquisar (nome, email ou NIF)',
        required: true
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 10
      }
    ],
    outputSchema: z.object({
      customers: z.array(z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        company: z.string().nullable(),
        nif: z.string().nullable(),
        status: z.string()
      })),
      count: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { query: string; limit?: number },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 10;
    const query = `%${input.query}%`;

    const results = await db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
        company: clients.company,
        nif: clients.nif,
        status: clients.status
      })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, context.tenantId),
          or(
            ilike(clients.name, query),
            ilike(clients.email, query),
            ilike(clients.nif, query),
            ilike(clients.company, query)
          )
        )
      )
      .limit(limit);

    return {
      customers: results,
      count: results.length,
      message: `🔍 Encontrados ${results.length} cliente(s)`
    };
  }
}
