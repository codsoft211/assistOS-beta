import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ExportCustomersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'export_customers',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Exporta lista de clientes em formato JSON (frontend converte para CSV/Excel)',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de registos',
        required: false,
        default: 1000
      }
    ],
    outputSchema: z.object({
      data: z.array(z.record(z.any())),
      count: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { status?: string; limit?: number },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 1000;
    const conditions = [eq(clients.tenantId, context.tenantId)];

    if (input.status) {
      conditions.push(eq(clients.status, input.status));
    }

    const results = await db
      .select({
        id: clients.id,
        nome: clients.name,
        email: clients.email,
        telefone: clients.phone,
        empresa: clients.company,
        nif: clients.nif,
        morada: clients.address,
        cidade: clients.city,
        codigoPostal: clients.postalCode,
        pais: clients.country,
        status: clients.status,
        criadoEm: clients.createdAt
      })
      .from(clients)
      .where(and(...conditions))
      .limit(limit);

    return {
      data: results,
      count: results.length,
      message: `📥 Exportados ${results.length} cliente(s)`
    };
  }
}
