import { db } from "../../../../../apps/api/db";
import { and, eq, desc } from "drizzle-orm";
import { leadActivities, users, commercialLeads, angariacaoLeads } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().describe("ID do lead para listar atividades"),
  activityType: z.string().optional().describe("Filtrar por tipo (note, call, email, meeting, status_change)"),
  limit: z.number().int().positive().optional().describe("Numero maximo de resultados (default: 20)"),
});

type Input = z.infer<typeof inputSchema>;

export const ListLeadActivitiesTool: ToolDefinition<Input> = {
  name: "list-lead-activities",
  description: "Lista todas as atividades/historico de um lead especifico. Use quando user perguntar 'historico do lead', 'atividades do lead', 'notas do lead', etc.",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const limit = input.limit || 20;

    const conditions: any[] = [
      eq(leadActivities.tenantId, context.tenantId),
      eq(leadActivities.leadId, input.leadId)
    ];
    
    if (context.environment) {
      conditions.push(eq(leadActivities.environment, context.environment));
    }
    
    if (input.activityType) {
      conditions.push(eq(leadActivities.activityType, input.activityType));
    }

    const results = await db
      .select({
        id: leadActivities.id,
        activityType: leadActivities.activityType,
        description: leadActivities.description,
        metadata: leadActivities.metadata,
        createdAt: leadActivities.createdAt,
        createdByFirstName: users.firstName,
        createdByLastName: users.lastName
      })
      .from(leadActivities)
      .leftJoin(users, eq(leadActivities.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(leadActivities.createdAt))
      .limit(limit);

    const activities = results.map(row => ({
      id: row.id,
      activityType: row.activityType,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      createdBy: row.createdByFirstName && row.createdByLastName 
        ? `${row.createdByFirstName} ${row.createdByLastName}` 
        : row.createdByFirstName || 'Sistema'
    }));

    return {
      success: true,
      data: {
        activities,
        total: activities.length,
        message: `Encontradas ${activities.length} atividade(s) para o lead`
      }
    };
  },
};
