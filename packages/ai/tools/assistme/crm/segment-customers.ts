import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class SegmentCustomersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'segment_customers',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Segmenta clientes por critérios (status, cidade, etc)',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Status do cliente',
        required: false
      },
      {
        name: 'city',
        type: 'string',
        description: 'Cidade',
        required: false
      },
      {
        name: 'hasEmail',
        type: 'boolean',
        description: 'Tem email?',
        required: false
      }
    ],
    outputSchema: z.object({
      customerIds: z.array(z.string()),
      count: z.number(),
      criteria: z.record(z.any()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { status?: string; city?: string; hasEmail?: boolean },
    context: ToolExecutionContext
  ) {
    const conditions = [eq(clients.tenantId, context.tenantId)];

    if (input.status) {
      conditions.push(eq(clients.status, input.status));
    }

    if (input.city) {
      conditions.push(eq(clients.city, input.city));
    }

    if (input.hasEmail !== undefined) {
      if (input.hasEmail) {
        conditions.push(sql`${clients.email} IS NOT NULL AND ${clients.email} != ''`);
      } else {
        conditions.push(sql`${clients.email} IS NULL OR ${clients.email} = ''`);
      }
    }

    const results = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(...conditions));

    const customerIds = results.map(r => r.id);

    return {
      customerIds,
      count: customerIds.length,
      criteria: { status: input.status, city: input.city, hasEmail: input.hasEmail },
      message: `📊 Segmentados ${customerIds.length} cliente(s) com os critérios fornecidos`
    };
  }
}
