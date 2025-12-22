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
  newLeadSource: z.string().min(1, "Nova origem do lead obrigatoria"),
  newLeadSourceId: z.string().optional(),
  notes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const UpdateLeadSourceTool: ToolDefinition<Input> = {
  name: "update-lead-source",
  description: "Atualizar a origem (source) de um lead de angariacao",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Atualizar origem em transacao atomica com row-level locking
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

      const oldLeadSource = lead.leadSource;

      // 3. Atualizar origem do lead
      const [updatedLead] = await tx.update(angariacaoLeads)
        .set({
          leadSource: input.newLeadSource,
          leadSourceId: input.newLeadSourceId,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(angariacaoLeads.id, input.leadId),
            eq(angariacaoLeads.tenantId, context.tenantId)
          )
        )
        .returning();

      // 4. Registar atividade de mudanca de origem
      await tx.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        activityType: 'source_changed',
        description: input.notes || `Origem alterada de "${oldLeadSource}" para "${input.newLeadSource}"`,
        metadata: {
          oldLeadSource,
          newLeadSource: input.newLeadSource,
          newLeadSourceId: input.newLeadSourceId,
          changedBy: context.userId,
          changedAt: new Date().toISOString()
        },
        userId: context.userId
      });

      return { updatedLead, oldLeadSource };
    });

    return {
      success: true,
      data: {
        leadId: result.updatedLead.id,
        email: result.updatedLead.email,
        oldLeadSource: result.oldLeadSource,
        newLeadSource: result.updatedLead.leadSource,
        message: `Origem do lead atualizada de "${result.oldLeadSource}" para "${result.updatedLead.leadSource}"`
      }
    };
  },
};
