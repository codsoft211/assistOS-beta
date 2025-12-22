import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  angariacaoLeads,
  commercialLeads,
  leadActivities
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  proposalNumber: z.string().optional(),
  description: z.string().optional(),
  budgetTotal: z.number().optional(),
  eventType: z.string().optional(),
  location: z.string().optional(),
  eventDate: z.string().optional(),
  numPax: z.number().optional(),
  notes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const ConvertMarketingLeadTool: ToolDefinition<Input> = {
  name: "convert-marketing-lead",
  description: "Converter lead de marketing em lead comercial para seguimento de vendas",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Converter lead em transacao atomica com row-level locking
    const result = await db.transaction(async (tx: any) => {
      // 1. Ler lead de marketing com lock exclusivo (forUpdate) DENTRO do transaction
      const [marketingLead] = await tx
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
      if (!marketingLead) {
        throw new Error(`Lead de marketing ${input.leadId} nao encontrado`);
      }

      // 3. Verificar se ja foi convertido
      if (marketingLead.status === 'Convertido') {
        throw new Error(`Lead ${marketingLead.email} ja foi convertido anteriormente`);
      }

      const now = new Date();

      // 4. Criar lead comercial com dados do lead de marketing
      const [commercialLead] = await tx.insert(commercialLeads).values({
        tenantId: context.tenantId,
        proposalNumber: input.proposalNumber || `ML-${Date.now()}`,
        description: input.description || marketingLead.notes,
        contactName: `${marketingLead.firstName || ''} ${marketingLead.lastName || ''}`.trim() || marketingLead.email,
        contactPhone: marketingLead.phone,
        contactEmail: marketingLead.email,
        status: 'Proposta Enviada',
        ownerId: marketingLead.assignedToUserId || context.userId,
        leadSource: marketingLead.leadSource,
        eventType: input.eventType,
        location: input.location,
        eventDate: input.eventDate ? new Date(input.eventDate) : null,
        numPax: input.numPax,
        budgetTotal: input.budgetTotal ? input.budgetTotal.toString() : null,
        comments: input.notes,
        createdAt: now,
        updatedAt: now
      }).returning();

      // 5. Atualizar lead de marketing para status Convertido
      const [updatedMarketingLead] = await tx.update(angariacaoLeads)
        .set({
          status: 'Convertido',
          convertedToClientId: commercialLead.id,
          updatedAt: now
        })
        .where(
          and(
            eq(angariacaoLeads.id, input.leadId),
            eq(angariacaoLeads.tenantId, context.tenantId)
          )
        )
        .returning();

      // 6. Registar atividade de conversao
      await tx.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        activityType: 'conversion',
        description: input.notes || `Lead convertido em lead comercial ${commercialLead.proposalNumber}`,
        metadata: {
          commercialLeadId: commercialLead.id,
          proposalNumber: commercialLead.proposalNumber,
          convertedBy: context.userId,
          convertedAt: now.toISOString()
        },
        userId: context.userId
      });

      return { marketingLead: updatedMarketingLead, commercialLead };
    });

    return {
      success: true,
      data: {
        marketingLeadId: result.marketingLead.id,
        marketingLeadEmail: result.marketingLead.email,
        commercialLeadId: result.commercialLead.id,
        proposalNumber: result.commercialLead.proposalNumber,
        status: result.marketingLead.status,
        message: `Lead de marketing convertido com sucesso em lead comercial ${result.commercialLead.proposalNumber}`
      }
    };
  },
};
