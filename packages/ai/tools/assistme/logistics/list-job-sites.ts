import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { jobSites } from 'shared/schema';
import { eq, and, desc, ilike, or } from 'drizzle-orm';

export class ListJobSitesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_job_sites',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os locais de servico/job sites com filtros opcionais. Use quando user perguntar "quais sao os locais?", "listar espacos", "venues disponiveis", etc.',
    parameters: [
      {
        name: 'siteType',
        type: 'string',
        description: 'Filtrar por tipo (venue, client_home, rental, outdoor)',
        required: false
      },
      {
        name: 'city',
        type: 'string',
        description: 'Filtrar por cidade',
        required: false
      },
      {
        name: 'hasKitchen',
        type: 'boolean',
        description: 'Filtrar locais com cozinha',
        required: false
      },
      {
        name: 'search',
        type: 'string',
        description: 'Pesquisar por nome ou morada',
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
      jobSites: z.array(z.object({
        id: z.string(),
        name: z.string(),
        code: z.string().nullable(),
        siteType: z.string(),
        address: z.string().nullable(),
        city: z.string().nullable(),
        postalCode: z.string().nullable(),
        maxCapacity: z.number().nullable(),
        hasKitchen: z.boolean().nullable(),
        hasParking: z.boolean().nullable(),
        contactName: z.string().nullable(),
        contactPhone: z.string().nullable()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      siteType?: string; 
      city?: string;
      hasKitchen?: boolean;
      search?: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const conditions: any[] = [eq(jobSites.tenantId, context.tenantId)];
    
    if (input.siteType) {
      conditions.push(eq(jobSites.siteType, input.siteType));
    }
    
    if (input.city) {
      conditions.push(ilike(jobSites.city, `%${input.city}%`));
    }
    
    if (input.hasKitchen !== undefined) {
      conditions.push(eq(jobSites.hasKitchen, input.hasKitchen));
    }

    if (input.search) {
      const searchPattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(jobSites.name, searchPattern),
          ilike(jobSites.address, searchPattern)
        )
      );
    }

    const results = await db
      .select({
        id: jobSites.id,
        name: jobSites.name,
        code: jobSites.code,
        siteType: jobSites.siteType,
        address: jobSites.address,
        city: jobSites.city,
        postalCode: jobSites.postalCode,
        maxCapacity: jobSites.maxCapacity,
        hasKitchen: jobSites.hasKitchen,
        hasParking: jobSites.hasParking,
        contactName: jobSites.contactName,
        contactPhone: jobSites.contactPhone
      })
      .from(jobSites)
      .where(and(...conditions))
      .orderBy(desc(jobSites.createdAt))
      .limit(limit);

    return {
      jobSites: results,
      total: results.length,
      message: `Encontrados ${results.length} local(is) de servico`
    };
  }
}
