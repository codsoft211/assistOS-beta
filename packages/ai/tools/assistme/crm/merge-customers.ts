import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients, opportunities, salesOrders, commercialLeads } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class MergeCustomersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'merge_customers',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Junta dois clientes duplicados (move relações e marca duplicado como inativo)',
    parameters: [
      {
        name: 'primaryCustomerId',
        type: 'string',
        description: 'ID do cliente principal (que vai ficar)',
        required: true
      },
      {
        name: 'duplicateCustomerId',
        type: 'string',
        description: 'ID do cliente duplicado (que será marcado como inativo)',
        required: true
      }
    ],
    outputSchema: z.object({
      primaryCustomerId: z.string(),
      mergedCount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { primaryCustomerId: string; duplicateCustomerId: string },
    context: ToolExecutionContext
  ) {
    let mergedCount = 0;

    await db.update(opportunities)
      .set({ clientId: input.primaryCustomerId })
      .where(
        and(
          eq(opportunities.clientId, input.duplicateCustomerId),
          eq(opportunities.tenantId, context.tenantId)
        )
      );

    await db.update(salesOrders)
      .set({ clientId: input.primaryCustomerId })
      .where(
        and(
          eq(salesOrders.clientId, input.duplicateCustomerId),
          eq(salesOrders.tenantId, context.tenantId)
        )
      );

    const [inactivatedClient] = await db
      .update(clients)
      .set({ status: 'Inativo - Duplicado' })
      .where(
        and(
          eq(clients.id, input.duplicateCustomerId),
          eq(clients.tenantId, context.tenantId)
        )
      )
      .returning();

    if (!inactivatedClient) {
      throw new Error('Cliente duplicado não encontrado');
    }

    mergedCount = 1;

    return {
      primaryCustomerId: input.primaryCustomerId,
      mergedCount,
      message: `✅ Clientes unidos com sucesso! Relações movidas para o cliente principal.`
    };
  }
}
