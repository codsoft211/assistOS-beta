import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, or, ilike, gte, lte, sql, desc, asc } from 'drizzle-orm';

export class AdvancedCustomerSearchTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'advanced_customer_search',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Pesquisa avançada de clientes com filtros complexos (tags, datas, status, campos personalizados)',
    parameters: [
      {
        name: 'filters',
        type: 'object',
        description: 'Filtros de pesquisa (tags, status, dateRange, customFields)',
        required: false,
        default: {}
      },
      {
        name: 'sortBy',
        type: 'string',
        description: 'Campo para ordenação',
        required: false,
        default: 'createdAt'
      },
      {
        name: 'orderBy',
        type: 'string',
        description: 'Direção da ordenação (asc/desc)',
        required: false,
        default: 'desc'
      },
      {
        name: 'page',
        type: 'number',
        description: 'Número da página',
        required: false,
        default: 1
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Resultados por página',
        required: false,
        default: 20
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
        tags: z.array(z.string()).nullable(),
        createdAt: z.string()
      })),
      totalCount: z.number(),
      page: z.number(),
      totalPages: z.number(),
      hasMore: z.boolean(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      filters?: any; 
      sortBy?: string; 
      orderBy?: string; 
      page?: number; 
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const page = input.page || 1;
    const limit = input.limit || 20;
    const offset = (page - 1) * limit;
    const sortBy = input.sortBy || 'createdAt';
    const orderBy = input.orderBy || 'desc';

    const conditions: any[] = [eq(clients.tenantId, context.tenantId)];

    if (input.filters) {
      if (input.filters.status) {
        conditions.push(eq(clients.status, input.filters.status));
      }

      if (input.filters.tags && Array.isArray(input.filters.tags)) {
        for (const tag of input.filters.tags) {
          conditions.push(sql`${clients.otherInfo}->>'tags' LIKE ${'%' + tag + '%'}`);
        }
      }

      if (input.filters.dateRange) {
        if (input.filters.dateRange.from) {
          conditions.push(gte(clients.createdAt, new Date(input.filters.dateRange.from)));
        }
        if (input.filters.dateRange.to) {
          conditions.push(lte(clients.createdAt, new Date(input.filters.dateRange.to)));
        }
      }

      if (input.filters.search) {
        conditions.push(
          or(
            ilike(clients.name, `%${input.filters.search}%`),
            ilike(clients.email, `%${input.filters.search}%`),
            ilike(clients.company, `%${input.filters.search}%`),
            ilike(clients.nif, `%${input.filters.search}%`)
          )
        );
      }
    }

    const orderColumn = sortBy === 'createdAt' ? clients.createdAt : 
                       sortBy === 'name' ? clients.name :
                       clients.createdAt;
    const orderDirection = orderBy === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const results = await db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
        company: clients.company,
        nif: clients.nif,
        status: clients.status,
        otherInfo: clients.otherInfo,
        createdAt: clients.createdAt
      })
      .from(clients)
      .where(and(...conditions))
      .orderBy(orderDirection)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(and(...conditions));

    const totalCount = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    return {
      customers: results.map(r => ({
        ...r,
        tags: (r.otherInfo as any)?.tags || [],
        createdAt: r.createdAt.toISOString()
      })),
      totalCount,
      page,
      totalPages,
      hasMore: page < totalPages,
      message: `🔍 Encontrados ${totalCount} cliente(s) - Página ${page}/${totalPages}`
    };
  }
}
