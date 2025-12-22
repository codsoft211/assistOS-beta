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
  newStatus: z.string().min(1, "Novo status obrigatorio"),
  notes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const UpdateLeadStatusTool: ToolDefinition<Input> = {
  name: "update-lead-status",
  description: "Atualiza o status de um lead comercial e registra a atividade",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Atualizar status em transacao atomica com row-level locking
    const result = await db.transaction(async (tx) => {
      // 1. Ler lead com lock exclusivo (forUpdate) DENTRO do transaction
      const lead = await tx.query.commercialLeads.findFirst({
        where: and(
          eq(commercialLeads.tenantId, context.tenantId),
          eq(commercialLeads.id, input.leadId)
        )
      }).for('update');

      // 2. Validar lead existe
      if (!lead) {
        throw new Error(`Lead ${input.leadId} nao encontrado`);
      }

      const oldStatus = lead.status;

      // 3. Atualizar status do lead
      const [updatedLead] = await tx.update(commercialLeads)
        .set({
          status: input.newStatus,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(commercialLeads.id, input.leadId),
            eq(commercialLeads.tenantId, context.tenantId)
          )
        )
        .returning();

      // 4. Registar atividade de mudanca de status
      await tx.insert(commercialActivities).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        activityType: 'status_change',
        subject: `Status alterado: ${oldStatus} → ${input.newStatus}`,
        description: input.notes || `Status do lead alterado de "${oldStatus}" para "${input.newStatus}"`,
        outcome: 'completed',
        completedAt: new Date(),
        createdBy: context.userId,
        assignedTo: context.userId,
        metadata: {
          oldStatus,
          newStatus: input.newStatus,
          changedBy: context.userId,
          changedAt: new Date().toISOString()
        }
      });

      return { updatedLead, oldStatus };
    });

    return {
      success: true,
      data: {
        leadId: result.updatedLead.id,
        proposalNumber: result.updatedLead.proposalNumber,
        oldStatus: result.oldStatus,
        newStatus: result.updatedLead.status,
        message: `Status do lead ${result.updatedLead.proposalNumber} atualizado de "${result.oldStatus}" para "${result.updatedLead.status}"`
      }
    };
  },
};
