import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { opportunities } from 'shared/schema';
import { eq, and, desc, gte } from 'drizzle-orm';

export class ListOpportunitiesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_opportunities',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Lista oportunidades com filtros (stage, status, valor mínimo)',
    parameters: [
      {
        name: 'stage',
        type: 'string',
        description: 'Filtrar por stage',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status (open/won/lost)',
        required: false
      },
      {
        name: 'minValue',
        type: 'number',
        description: 'Valor mínimo estimado',
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
      opportunities: z.array(z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        clientName: z.string().nullable(),
        stage: z.string(),
        priority: z.string(),
        estimatedValue: z.string().nullable(),
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
    input: { stage?: string; status?: string; minValue?: number; limit?: number },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const conditions = [eq(opportunities.tenantId, context.tenantId)];

    if (input.stage) {
      conditions.push(eq(opportunities.stage, input.stage));
    }

    if (input.status) {
      conditions.push(eq(opportunities.status, input.status));
    }

    if (input.minValue) {
      conditions.push(gte(opportunities.estimatedValue, input.minValue.toString()));
    }

    const results = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        description: opportunities.description,
        clientName: opportunities.clientName,
        stage: opportunities.stage,
        priority: opportunities.priority,
        estimatedValue: opportunities.estimatedValue,
        status: opportunities.status,
        createdAt: opportunities.createdAt
      })
      .from(opportunities)
      .where(and(...conditions))
      .orderBy(desc(opportunities.createdAt))
      .limit(limit);

    return {
      opportunities: results,
      total: results.length,
      message: `📋 Listadas ${results.length} oportunidade(s)`
    };
  }
}
