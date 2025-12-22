import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  angariacaoLeads,
  leadActivities
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  activityType: z.enum([
    "website_visit",
    "form_submit",
    "email_open",
    "email_click",
    "page_view",
    "download",
    "video_watch",
    "chat_interaction"
  ]),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

type Input = z.infer<typeof inputSchema>;

export const TrackLeadActivityTool: ToolDefinition<Input> = {
  name: "track-lead-activity",
  description: "Registar atividade de lead de marketing e atualizar timestamp de ultima atividade",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Registar atividade em transacao atomica com row-level locking
    const result = await db.transaction(async (tx: any) => {
      // 1. Ler lead com lock exclusivo (forUpdate) DENTRO do transaction
      const [lead] = await tx
        .select()
        .from(angariacaoLeads)
        .where(
          and(
            eq(angariacaoLeads.id, input.leadId),
            eq(angariacaoLeads.tenantId, context.tenantId)
          )
        )
        .for('update');

      // 2. Validar lead existe
      if (!lead) {
        throw new Error(`Lead ${input.leadId} nao encontrado`);
      }

      const now = new Date();

      // 3. Criar atividade
      const [activity] = await tx.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        activityType: input.activityType,
        description: input.description || `Atividade: ${input.activityType}`,
        metadata: input.metadata,
        userId: context.userId
      }).returning();

      // 4. Atualizar lastActivityAt do lead
      const [updatedLead] = await tx.update(angariacaoLeads)
        .set({
          lastActivityAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(angariacaoLeads.id, input.leadId),
            eq(angariacaoLeads.tenantId, context.tenantId)
          )
        )
        .returning();

      return { activity, updatedLead };
    });

    return {
      success: true,
      data: {
        activityId: result.activity.id,
        leadId: result.updatedLead.id,
        email: result.updatedLead.email,
        activityType: result.activity.activityType,
        lastActivityAt: result.updatedLead.lastActivityAt,
        message: `Atividade "${input.activityType}" registada com sucesso`
      }
    };
  },
};
