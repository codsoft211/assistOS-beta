import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  commercialLeads,
  commercialLeadScoring
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  contactName: z.string().min(1, "Nome de contacto obrigatorio"),
  contactEmail: z.string().email("Email invalido").optional(),
  contactPhone: z.string().optional(),
  description: z.string().optional(),
  leadSource: z.string().optional(),
  eventType: z.string().optional(),
  location: z.string().optional(),
  eventDate: z.string().optional(),
  numPax: z.number().int().positive().optional(),
  budgetTotal: z.number().positive().optional(),
  comments: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const CreateSalesLeadTool: ToolDefinition<Input> = {
  name: "create-sales-lead",
  description: "Cria um novo lead comercial com calculo automatico de score inicial",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Criar lead em transacao atomica
    const result = await db.transaction(async (tx) => {
      // Gerar numero de proposta unico
      const timestamp = Date.now();
      const proposalNumber = `LEAD-${timestamp}`;

      // 1. Inserir lead comercial
      const leads = await tx.insert(commercialLeads).values({
        tenantId: context.tenantId,
        proposalNumber,
        description: input.description,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        status: 'new',
        ownerId: context.userId,
        leadSource: input.leadSource,
        eventType: input.eventType,
        location: input.location,
        eventDate: input.eventDate ? new Date(input.eventDate) : null,
        eventYear: input.eventDate ? new Date(input.eventDate).getFullYear() : null,
        numPax: input.numPax,
        budgetTotal: input.budgetTotal ? input.budgetTotal.toString() : null,
        comments: input.comments,
      }).returning();
      const lead = leads[0];

      // 2. Calcular score inicial baseado em dados fornecidos
      let initialScore = 50; // Score base
      
      // Aumentar score se tiver email (contactavel)
      if (input.contactEmail) initialScore += 10;
      
      // Aumentar score se tiver telefone
      if (input.contactPhone) initialScore += 5;
      
      // Aumentar score se tiver budget definido
      if (input.budgetTotal && input.budgetTotal > 0) initialScore += 15;
      
      // Aumentar score se tiver data de evento (urgencia)
      if (input.eventDate) {
        const daysUntilEvent = Math.floor((new Date(input.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilEvent > 0 && daysUntilEvent <= 30) {
          initialScore += 10; // Evento proximo (urgente)
        } else if (daysUntilEvent > 30 && daysUntilEvent <= 90) {
          initialScore += 5; // Evento medio prazo
        }
      }
      
      // Aumentar score se tiver numero de participantes
      if (input.numPax && input.numPax > 0) {
        if (input.numPax >= 100) initialScore += 10;
        else if (input.numPax >= 50) initialScore += 5;
      }

      // Garantir score maximo de 100
      initialScore = Math.min(initialScore, 100);

      // 3. Inserir score inicial
      await tx.insert(commercialLeadScoring).values({
        tenantId: context.tenantId,
        leadId: lead.id,
        score: initialScore,
        scoreBreakdown: {
          baseScore: 50,
          emailBonus: input.contactEmail ? 10 : 0,
          phoneBonus: input.contactPhone ? 5 : 0,
          budgetBonus: input.budgetTotal ? 15 : 0,
          dateBonus: input.eventDate ? 10 : 0,
          paxBonus: input.numPax && input.numPax >= 50 ? (input.numPax >= 100 ? 10 : 5) : 0,
        },
        engagementScore: 0,
        valueScore: input.budgetTotal ? Math.min(Math.floor((input.budgetTotal / 10000) * 50), 50) : 0,
        urgencyScore: input.eventDate ? 70 : 30,
        qualityScore: initialScore,
        aiModelVersion: 'v1.0-initial',
      });

      return { lead, initialScore };
    });

    return {
      success: true,
      data: {
        leadId: result.lead.id,
        proposalNumber: result.lead.proposalNumber,
        contactName: result.lead.contactName,
        status: result.lead.status,
        initialScore: result.initialScore,
        message: `Lead ${result.lead.proposalNumber} criado com sucesso. Score inicial: ${result.initialScore}/100`
      }
    };
  },
};
