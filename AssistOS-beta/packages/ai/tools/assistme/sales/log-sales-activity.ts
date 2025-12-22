import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  commercialLeads,
  commercialActivities
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  activityType: z.enum(['call', 'meeting', 'email', 'note', 'task', 'follow_up'], {
    errorMap: () => ({ message: "Tipo deve ser: call, meeting, email, note, task ou follow_up" })
  }),
  subject: z.string().min(1, "Assunto obrigatorio"),
  description: z.string().optional(),
  outcome: z.enum(['completed', 'scheduled', 'cancelled', 'pending']),
  duration: z.number().int().positive().optional(),
  scheduledAt: z.string().optional(),
  assignedToUserId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

type Input = z.infer<typeof inputSchema>;

export const LogSalesActivityTool: ToolDefinition<Input> = {
  name: "log-sales-activity",
  description: "Registra uma atividade comercial (chamada, reuniao, email) num lead",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Registar atividade em transacao atomica
    const result = await db.transaction(async (tx) => {
      // 1. Validar que lead existe com lock
      const lead = await tx.query.commercialLeads.findFirst({
        where: and(
          eq(commercialLeads.tenantId, context.tenantId),
          eq(commercialLeads.id, input.leadId)
        )
      }).for('update');

      if (!lead) {
        throw new Error(`Lead ${input.leadId} nao encontrado`);
      }

      // 2. Inserir atividade
      const [activity] = await tx.insert(commercialActivities).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        activityType: input.activityType,
        subject: input.subject,
        description: input.description,
        outcome: input.outcome,
        duration: input.duration,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        completedAt: input.outcome === 'completed' ? new Date() : null,
        createdBy: context.userId,
        assignedTo: input.assignedToUserId || context.userId,
        metadata: input.metadata,
      }).returning();

      // 3. Atualizar lastActivityAt no lead
      // Nota: commercialLeads nao tem campo lastActivityAt no schema atual
      // Mas podemos atualizar updatedAt para refletir atividade recente
      await tx.update(commercialLeads)
        .set({
          updatedAt: new Date()
        })
        .where(
          and(
            eq(commercialLeads.id, input.leadId),
            eq(commercialLeads.tenantId, context.tenantId)
          )
        );

      return { activity, lead };
    });

    return {
      success: true,
      data: {
        activityId: result.activity.id,
        leadId: input.leadId,
        proposalNumber: result.lead.proposalNumber,
        activityType: result.activity.activityType,
        subject: result.activity.subject,
        outcome: result.activity.outcome,
        completedAt: result.activity.completedAt?.toISOString(),
        scheduledAt: result.activity.scheduledAt?.toISOString(),
        message: `Atividade "${result.activity.subject}" (${result.activity.activityType}) registada no lead ${result.lead.proposalNumber}`
      }
    };
  },
};
