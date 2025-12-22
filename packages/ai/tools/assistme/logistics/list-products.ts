import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { products } from 'shared/schema';
import { eq, and, desc, ilike, or } from 'drizzle-orm';

export class ListProductsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_products',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os produtos/artigos com filtros opcionais. Use quando user perguntar "quais sao os produtos?", "listar artigos", "produtos vendaveis", etc.',
    parameters: [
      {
        name: 'itemType',
        type: 'string',
        description: 'Filtrar por tipo de item (RAW, SALE, SEMI, SERVICE, PACKAGING)',
        required: false
      },
      {
        name: 'isSellable',
        type: 'boolean',
        description: 'Filtrar apenas produtos vendaveis',
        required: false
      },
      {
        name: 'isPurchasable',
        type: 'boolean',
        description: 'Filtrar apenas produtos compraveis',
        required: false
      },
      {
        name: 'search',
        type: 'string',
        description: 'Pesquisar por nome ou codigo',
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
      products: z.array(z.object({
        id: z.string(),
        code: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        itemType: z.string(),
        isSellable: z.boolean(),
        isPurchasable: z.boolean(),
        price: z.string(),
        cost: z.string().nullable(),
        stock: z.number()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      itemType?: string; 
      isSellable?: boolean;
      isPurchasable?: boolean;
      search?: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const conditions: any[] = [eq(products.tenantId, context.tenantId)];
    
    if (context.environment) {
      conditions.push(eq(products.environment, context.environment));
    }
    
    if (input.itemType) {
      conditions.push(eq(products.itemType, input.itemType));
    }
    
    if (input.isSellable !== undefined) {
      conditions.push(eq(products.isSellable, input.isSellable));
    }
    
    if (input.isPurchasable !== undefined) {
      conditions.push(eq(products.isPurchasable, input.isPurchasable));
    }

    if (input.search) {
      const searchPattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(products.name, searchPattern),
          ilike(products.code, searchPattern)
        )
      );
    }

    const results = await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        description: products.description,
        itemType: products.itemType,
        isSellable: products.isSellable,
        isPurchasable: products.isPurchasable,
        price: products.price,
        cost: products.cost,
        stock: products.stock
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(desc(products.createdAt))
      .limit(limit);

    return {
      products: results,
      total: results.length,
      message: `Encontrados ${results.length} produto(s)`
    };
  }
}
