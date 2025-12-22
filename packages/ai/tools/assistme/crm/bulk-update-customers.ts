import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

export class BulkUpdateCustomersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'bulk_update_customers',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Atualiza múltiplos clientes de uma só vez',
    parameters: [
      {
        name: 'customerIds',
        type: 'array',
        description: 'Array de IDs dos clientes a atualizar',
        required: true,
        items: { type: 'string' }
      },
      {
        name: 'updates',
        type: 'object',
        description: 'Objeto com campos a atualizar (status, tags, metadata, etc)',
        required: true,
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          company: { type: 'string' },
          nif: { type: 'string' },
          status: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          postalCode: { type: 'string' },
          country: { type: 'string' },
          district: { type: 'string' },
          website: { type: 'string' }
        }
      }
    ],
    outputSchema: z.object({
      updatedCount: z.number(),
      successIds: z.array(z.string()),
      failedIds: z.array(z.string()),
      errors: z.array(z.object({
        customerId: z.string(),
        error: z.string()
      })),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { customerIds: string[]; updates: any },
    context: ToolExecutionContext
  ) {
    const successIds: string[] = [];
    const failedIds: string[] = [];
    const errors: Array<{ customerId: string; error: string }> = [];

    const allowedFields = ['name', 'email', 'phone', 'company', 'nif', 'status', 'address', 'city', 'postalCode', 'country', 'district', 'website'];
    const updateData: any = {};

    for (const [key, value] of Object.entries(input.updates)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return {
        updatedCount: 0,
        successIds: [],
        failedIds: input.customerIds,
        errors: [{ customerId: 'all', error: 'Nenhum campo válido para atualizar' }],
        message: '❌ Nenhum campo válido fornecido'
      };
    }

    updateData.updatedAt = new Date();

    for (const customerId of input.customerIds) {
      try {
        const result = await db
          .update(clients)
          .set(updateData)
          .where(
            and(
              eq(clients.id, customerId),
              eq(clients.tenantId, context.tenantId)
            )
          );

        successIds.push(customerId);
      } catch (error) {
        failedIds.push(customerId);
        errors.push({
          customerId,
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
      }
    }

    return {
      updatedCount: successIds.length,
      successIds,
      failedIds,
      errors,
      message: `✅ ${successIds.length} cliente(s) atualizados com sucesso. ${failedIds.length} falhas.`
    };
  }
}
