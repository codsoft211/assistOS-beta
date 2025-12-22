import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export class ListCustomersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_customers',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os clientes com filtros opcionais',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status (Ativo/Inativo)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      },
      {
        name: 'offset',
        type: 'number',
        description: 'Offset para paginação',
        required: false,
        default: 0
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
        status: z.string(),
        createdAt: z.date()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { status?: string; limit?: number; offset?: number },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const offset = input.offset || 0;

    const conditions = [eq(clients.tenantId, context.tenantId)];
    
    if (input.status) {
      conditions.push(eq(clients.status, input.status));
    }

    const results = await db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
        company: clients.company,
        nif: clients.nif,
        status: clients.status,
        createdAt: clients.createdAt
      })
      .from(clients)
      .where(and(...conditions))
      .orderBy(desc(clients.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      customers: results,
      total: results.length,
      message: `📋 Listados ${results.length} cliente(s)`
    };
  }
}
