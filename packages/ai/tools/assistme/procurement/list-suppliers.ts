import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { suppliers } from 'shared/schema';
import { eq, and, desc, ilike, or } from 'drizzle-orm';

export class ListSuppliersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_suppliers',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os fornecedores com filtros opcionais. Use quando user perguntar "quais sao os fornecedores?", "listar fornecedores", "fornecedores ativos", etc.',
    parameters: [
      {
        name: 'category',
        type: 'string',
        description: 'Filtrar por categoria (raw_materials, finished_goods, services, consumables)',
        required: false
      },
      {
        name: 'type',
        type: 'string',
        description: 'Filtrar por tipo (preferred, approved, trial, blocked)',
        required: false
      },
      {
        name: 'search',
        type: 'string',
        description: 'Pesquisar por nome, NIF ou email',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Numero maximo de resultados (default: 50)',
        required: false,
        default: 50
      }
    ],
    outputSchema: z.object({
      suppliers: z.array(z.object({
        id: z.string(),
        code: z.string().nullable(),
        name: z.string(),
        legalName: z.string().nullable(),
        taxId: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        city: z.string().nullable(),
        category: z.string().nullable(),
        type: z.string().nullable()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      category?: string; 
      type?: string;
      search?: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const conditions: any[] = [eq(suppliers.tenantId, context.tenantId)];
    
    if (context.environment) {
      conditions.push(eq(suppliers.environment, context.environment));
    }
    
    if (input.category) {
      conditions.push(eq(suppliers.category, input.category));
    }
    
    if (input.type) {
      conditions.push(eq(suppliers.type, input.type));
    }

    if (input.search) {
      const searchPattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(suppliers.name, searchPattern),
          ilike(suppliers.taxId, searchPattern),
          ilike(suppliers.email, searchPattern)
        )
      );
    }

    const results = await db
      .select({
        id: suppliers.id,
        code: suppliers.code,
        name: suppliers.name,
        legalName: suppliers.legalName,
        taxId: suppliers.taxId,
        email: suppliers.email,
        phone: suppliers.phone,
        city: suppliers.city,
        category: suppliers.category,
        type: suppliers.type
      })
      .from(suppliers)
      .where(and(...conditions))
      .orderBy(desc(suppliers.createdAt))
      .limit(limit);

    return {
      suppliers: results,
      total: results.length,
      message: `Encontrados ${results.length} fornecedor(es)`
    };
  }
}
