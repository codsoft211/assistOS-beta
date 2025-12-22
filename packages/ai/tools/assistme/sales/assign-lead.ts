import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  commercialLeads,
  commercialActivities,
  users
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  newOwnerId: z.string().min(1, "ID do novo responsavel obrigatorio"),
  notes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const AssignLeadTool: ToolDefinition<Input> = {
  name: "assign-lead",
  description: "Atribui um lead comercial a um utilizador especifico",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Atribuir lead em transacao atomica com row-level locking
    const result = await db.transaction(async (tx) => {
      // 1. Validar que novo responsavel existe
      const newOwner = await tx.query.users.findFirst({
        where: eq(users.id, input.newOwnerId)
      });

      if (!newOwner) {
        throw new Error(`Utilizador ${input.newOwnerId} nao encontrado ou nao pertence ao mesmo tenant`);
      }

      // 2. Ler lead com lock exclusivo (forUpdate) DENTRO do transaction
      const lead = await tx.query.commercialLeads.findFirst({
        where: and(
          eq(commercialLeads.tenantId, context.tenantId),
          eq(commercialLeads.id, input.leadId)
        )
      }).for('update');

      // 3. Validar lead existe
      if (!lead) {
        throw new Error(`Lead ${input.leadId} nao encontrado`);
      }

      const oldOwnerId = lead.ownerId;

      // 4. Atualizar responsavel do lead
      const [updatedLead] = await tx.update(commercialLeads)
        .set({
          ownerId: input.newOwnerId,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(commercialLeads.id, input.leadId),
            eq(commercialLeads.tenantId, context.tenantId)
          )
        )
        .returning();

      // 5. Registar atividade de atribuicao
      await tx.insert(commercialActivities).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        activityType: 'assignment',
        subject: `Lead atribuido a ${newOwner.firstName} ${newOwner.lastName}`,
        description: input.notes || `Lead atribuido de ${oldOwnerId || 'sem responsavel'} para ${input.newOwnerId}`,
        outcome: 'completed',
        completedAt: new Date(),
        createdBy: context.userId,
        assignedTo: input.newOwnerId,
        metadata: {
          oldOwnerId,
          newOwnerId: input.newOwnerId,
          newOwnerName: `${newOwner.firstName} ${newOwner.lastName}`,
          newOwnerEmail: newOwner.email,
          assignedBy: context.userId,
          assignedAt: new Date().toISOString()
        }
      });

      return { updatedLead, oldOwnerId, newOwner };
    });

    return {
      success: true,
      data: {
        leadId: result.updatedLead.id,
        proposalNumber: result.updatedLead.proposalNumber,
        oldOwnerId: result.oldOwnerId,
        newOwnerId: input.newOwnerId,
        newOwnerName: `${result.newOwner.firstName} ${result.newOwner.lastName}`,
        newOwnerEmail: result.newOwner.email,
        message: `Lead ${result.updatedLead.proposalNumber} atribuido a ${result.newOwner.firstName} ${result.newOwner.lastName}`
      }
    };
  },
};
