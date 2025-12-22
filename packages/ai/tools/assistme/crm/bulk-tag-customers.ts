import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

export class BulkTagCustomersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'bulk_tag_customers',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Adiciona ou remove tags de múltiplos clientes',
    parameters: [
      {
        name: 'customerIds',
        type: 'array',
        description: 'Array de IDs dos clientes',
        required: true,
        items: { type: 'string' }
      },
      {
        name: 'tagsToAdd',
        type: 'array',
        description: 'Tags a adicionar',
        required: false,
        default: [],
        items: { type: 'string' }
      },
      {
        name: 'tagsToRemove',
        type: 'array',
        description: 'Tags a remover',
        required: false,
        default: [],
        items: { type: 'string' }
      }
    ],
    outputSchema: z.object({
      updatedCount: z.number(),
      tagsAdded: z.array(z.string()),
      tagsRemoved: z.array(z.string()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { customerIds: string[]; tagsToAdd?: string[]; tagsToRemove?: string[] },
    context: ToolExecutionContext
  ) {
    const tagsToAdd = input.tagsToAdd || [];
    const tagsToRemove = input.tagsToRemove || [];

    if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
      return {
        updatedCount: 0,
        tagsAdded: [],
        tagsRemoved: [],
        message: '⚠️ Nenhuma tag especificada para adicionar ou remover'
      };
    }

    let updatedCount = 0;

    for (const customerId of input.customerIds) {
      const customer = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.id, customerId),
            eq(clients.tenantId, context.tenantId)
          )
        )
        .limit(1);

      if (!customer.length) continue;

      // Safe parsing with fallback
      const currentOtherInfo = (customer[0].otherInfo && typeof customer[0].otherInfo === 'object')
        ? customer[0].otherInfo as any
        : {};

      const currentTags = Array.isArray(currentOtherInfo.tags) ? currentOtherInfo.tags : [];

      // Add new tags (with deduplication)
      const newTags = Array.from(new Set([...currentTags, ...tagsToAdd]));

      // Remove tags
      const finalTags = newTags.filter(tag => !tagsToRemove.includes(tag));

      // Update with proper object spread
      await db
        .update(clients)
        .set({
          otherInfo: {
            ...currentOtherInfo,
            tags: finalTags
          } as any
        })
        .where(and(
          eq(clients.id, customerId),
          eq(clients.tenantId, context.tenantId)
        ));

      updatedCount++;
    }

    return {
      updatedCount,
      tagsAdded: tagsToAdd,
      tagsRemoved: tagsToRemove,
      message: `✅ ${updatedCount} cliente(s) atualizados. Adicionadas: ${tagsToAdd.join(', ') || 'nenhuma'}. Removidas: ${tagsToRemove.join(', ') || 'nenhuma'}`
    };
  }
}
