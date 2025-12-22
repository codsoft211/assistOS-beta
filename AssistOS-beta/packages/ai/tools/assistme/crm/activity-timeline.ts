import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialActivities } from 'shared/schema';
import { eq, and, gte, lte, inArray, desc } from 'drizzle-orm';

export class ActivityTimelineTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_activity_timeline',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Obtém todas as atividades de um cliente (chamadas, emails, reuniões, notas) ordenadas por data',
    parameters: [
      {
        name: 'customerId',
        type: 'string',
        description: 'ID do cliente',
        required: true
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início (ISO 8601)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de fim (ISO 8601)',
        required: false
      },
      {
        name: 'activityTypes',
        type: 'array',
        description: 'Tipos de atividade a incluir (call, email, meeting, note)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de atividades',
        required: false,
        default: 50
      }
    ],
    outputSchema: z.object({
      activities: z.array(z.object({
        id: z.string(),
        type: z.string(),
        subject: z.string().nullable(),
        notes: z.string().nullable(),
        date: z.string(),
        userId: z.string().nullable(),
        metadata: z.any()
      })),
      totalCount: z.number(),
      dateRange: z.object({
        from: z.string().nullable(),
        to: z.string().nullable()
      }),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      customerId: string; 
      startDate?: string; 
      endDate?: string; 
      activityTypes?: string[];
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;

    const conditions: any[] = [
      eq(commercialActivities.tenantId, context.tenantId),
      eq(commercialActivities.clientId, input.customerId)
    ];

    if (input.startDate) {
      conditions.push(gte(commercialActivities.createdAt, new Date(input.startDate)));
    }

    if (input.endDate) {
      conditions.push(lte(commercialActivities.createdAt, new Date(input.endDate)));
    }

    if (input.activityTypes && input.activityTypes.length > 0) {
      conditions.push(inArray(commercialActivities.type, input.activityTypes));
    }

    const results = await db
      .select({
        id: commercialActivities.id,
        type: commercialActivities.type,
        subject: commercialActivities.subject,
        notes: commercialActivities.notes,
        date: commercialActivities.createdAt,
        userId: commercialActivities.createdBy,
        metadata: commercialActivities.metadata
      })
      .from(commercialActivities)
      .where(and(...conditions))
      .orderBy(desc(commercialActivities.createdAt))
      .limit(limit);

    return {
      activities: results.map(a => ({
        ...a,
        date: a.date.toISOString()
      })),
      totalCount: results.length,
      dateRange: {
        from: input.startDate || null,
        to: input.endDate || null
      },
      message: `📋 ${results.length} atividade(s) encontrada(s)`
    };
  }
}
