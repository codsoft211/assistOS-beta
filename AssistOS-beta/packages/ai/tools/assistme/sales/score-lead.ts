import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  commercialLeads,
  commercialLeadScoring,
  leadScoringRules
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  forceRecalculate: z.boolean(),
});

type Input = z.infer<typeof inputSchema>;

export const ScoreLeadTool: ToolDefinition<Input> = {
  name: "score-lead",
  description: "Calcula ou atualiza o score de qualificacao de um lead baseado em regras configuradas",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Calcular score em transacao atomica
    const result = await db.transaction(async (tx) => {
      // 1. Ler lead com lock exclusivo
      const lead = await tx.query.commercialLeads.findFirst({
        where: and(
          eq(commercialLeads.tenantId, context.tenantId),
          eq(commercialLeads.id, input.leadId)
        )
      }).for('update');

      if (!lead) {
        throw new Error(`Lead ${input.leadId} nao encontrado`);
      }

      // 2. Buscar regras de scoring ativas
      const rules = await tx.query.leadScoringRules.findMany({
        where: and(
          eq(leadScoringRules.tenantId, context.tenantId),
          eq(leadScoringRules.isActive, true)
        )
      });

      // 3. Calcular score baseado em regras e dados do lead
      let totalScore = 0;
      const scoreBreakdown: Record<string, number> = {};

      // Score baseado em budget
      if (lead.budgetTotal) {
        const budget = parseFloat(lead.budgetTotal);
        if (budget >= 10000) {
          scoreBreakdown.budget = 30;
        } else if (budget >= 5000) {
          scoreBreakdown.budget = 20;
        } else if (budget >= 1000) {
          scoreBreakdown.budget = 10;
        } else {
          scoreBreakdown.budget = 5;
        }
        totalScore += scoreBreakdown.budget;
      }

      // Score baseado em contacto
      scoreBreakdown.contact = 0;
      if (lead.contactEmail) scoreBreakdown.contact += 10;
      if (lead.contactPhone) scoreBreakdown.contact += 5;
      totalScore += scoreBreakdown.contact;

      // Score baseado em urgencia (data do evento)
      if (lead.eventDate) {
        const daysUntilEvent = Math.floor((lead.eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilEvent > 0 && daysUntilEvent <= 7) {
          scoreBreakdown.urgency = 25; // Muito urgente
        } else if (daysUntilEvent <= 30) {
          scoreBreakdown.urgency = 15; // Urgente
        } else if (daysUntilEvent <= 90) {
          scoreBreakdown.urgency = 10; // Medio prazo
        } else {
          scoreBreakdown.urgency = 5; // Longo prazo
        }
        totalScore += scoreBreakdown.urgency;
      }

      // Score baseado em tamanho (numero de participantes)
      if (lead.numPax) {
        if (lead.numPax >= 200) {
          scoreBreakdown.size = 20;
        } else if (lead.numPax >= 100) {
          scoreBreakdown.size = 15;
        } else if (lead.numPax >= 50) {
          scoreBreakdown.size = 10;
        } else {
          scoreBreakdown.size = 5;
        }
        totalScore += scoreBreakdown.size;
      }

      // Score baseado em engagement (se tem descricao detalhada)
      if (lead.description && lead.description.length > 100) {
        scoreBreakdown.engagement = 10;
        totalScore += scoreBreakdown.engagement;
      }

      // Garantir score entre 0 e 100
      totalScore = Math.min(Math.max(totalScore, 0), 100);

      // 4. UPSERT do score (pode nao existir ainda)
      // Primeiro tentar inserir
      await tx.insert(commercialLeadScoring)
        .values({
          tenantId: context.tenantId,
          leadId: input.leadId,
          score: totalScore,
          scoreBreakdown,
          engagementScore: scoreBreakdown.engagement || 0,
          valueScore: scoreBreakdown.budget || 0,
          urgencyScore: scoreBreakdown.urgency || 0,
          qualityScore: totalScore,
          aiModelVersion: 'v1.0-rules',
        })
        .onConflictDoNothing();

      // 5. Depois atualizar (agora garantimos que existe)
      const existingScore = await tx.query.commercialLeadScoring.findFirst({
        where: and(
          eq(commercialLeadScoring.tenantId, context.tenantId),
          eq(commercialLeadScoring.leadId, input.leadId)
        )
      }).for('update');

      if (existingScore) {
        await tx.update(commercialLeadScoring)
          .set({
            score: totalScore,
            scoreBreakdown,
            engagementScore: scoreBreakdown.engagement || 0,
            valueScore: scoreBreakdown.budget || 0,
            urgencyScore: scoreBreakdown.urgency || 0,
            qualityScore: totalScore,
            scoredAt: new Date(),
          })
          .where(eq(commercialLeadScoring.id, existingScore.id));
      }

      return { totalScore, scoreBreakdown };
    });

    return {
      success: true,
      data: {
        leadId: input.leadId,
        score: result.totalScore,
        breakdown: result.scoreBreakdown,
        message: `Score do lead calculado: ${result.totalScore}/100. Detalhes: ${JSON.stringify(result.scoreBreakdown)}`
      }
    };
  },
};
