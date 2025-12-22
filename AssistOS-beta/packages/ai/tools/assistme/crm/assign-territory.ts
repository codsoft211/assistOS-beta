import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

export class AssignTerritoryTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'assign_territory',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Atribui clientes a territórios de vendas',
    parameters: [
      {
        name: 'customerIds',
        type: 'array',
        description: 'Array de IDs dos clientes',
        required: true
      },
      {
        name: 'territory',
        type: 'string',
        description: 'Nome do território (e.g., "Norte", "Lisboa", "Sul")',
        required: true
      },
      {
        name: 'assignedTo',
        type: 'string',
        description: 'ID do utilizador responsável pelo território',
        required: false
      }
    ],
    outputSchema: z.object({
      assignedCount: z.number(),
      territory: z.string(),
      assignedTo: z.string().nullable(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { customerIds: string[]; territory: string; assignedTo?: string },
    context: ToolExecutionContext
  ) {
    const customers = await db
      .select()
      .from(clients)
      .where(
        and(
          inArray(clients.id, input.customerIds),
          eq(clients.tenantId, context.tenantId)
        )
      );

    let assignedCount = 0;

    for (const customer of customers) {
      const currentOtherInfo = (customer.otherInfo as any) || {};

      await db
        .update(clients)
        .set({
          otherInfo: {
            ...currentOtherInfo,
            territory: input.territory,
            assignedTo: input.assignedTo || null,
            territoryAssignedAt: new Date().toISOString()
          } as any,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(clients.id, customer.id),
            eq(clients.tenantId, context.tenantId)
          )
        );

      assignedCount++;
    }

    return {
      assignedCount,
      territory: input.territory,
      assignedTo: input.assignedTo || null,
      message: `✅ ${assignedCount} cliente(s) atribuídos ao território "${input.territory}"`
    };
  }
}
