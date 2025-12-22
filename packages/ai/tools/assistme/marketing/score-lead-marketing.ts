import { db } from "../../../../../apps/api/db";
import { and, eq, desc } from "drizzle-orm";
import { 
  angariacaoLeads,
  leadActivities,
  leadScoringRules
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  activityType: z.string().optional(),
  activityMetadata: z.record(z.any()).optional(),
});

type Input = z.infer<typeof inputSchema>;

export const ScoreLeadMarketingTool: ToolDefinition<Input> = {
  name: "score-lead-marketing",
  description: "Calcular e atualizar score de lead baseado em regras de scoring do tenant",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Calcular score em transacao atomica com row-level locking
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

      const oldScore = lead.score;

      // 3. Ler regras de scoring ativas do tenant
      const scoringRules = await tx.query.leadScoringRules.findMany({
        where: and(
          eq(leadScoringRules.tenantId, context.tenantId),
          eq(leadScoringRules.isActive, true)
        ),
        orderBy: [desc(leadScoringRules.priority)]
      });

      // 4. Aplicar regras relevantes
      let scoreChange = 0;
      const appliedRules: Array<{ ruleName: string; scoreChange: number }> = [];

      for (const rule of scoringRules) {
        let shouldApply = false;

        // Regras baseadas em atividade
        if (input.activityType) {
          if (rule.ruleType === 'email_opened' && input.activityType === 'email_opened') {
            shouldApply = true;
          } else if (rule.ruleType === 'website_visit' && input.activityType === 'website_visit') {
            shouldApply = true;
          } else if (rule.ruleType === 'form_submitted' && input.activityType === 'form_submitted') {
            shouldApply = true;
          } else if (rule.ruleType === 'email_replied' && input.activityType === 'email_replied') {
            shouldApply = true;
          }
        }

        // Regras baseadas em dados do lead
        if (rule.ruleType === 'has_company' && lead.company) {
          shouldApply = true;
        } else if (rule.ruleType === 'has_phone' && lead.phone) {
          shouldApply = true;
        } else if (rule.ruleType === 'lead_source' && rule.conditions?.value === lead.leadSource) {
          shouldApply = true;
        }

        if (shouldApply) {
          scoreChange += rule.scoreChange;
          appliedRules.push({ ruleName: rule.ruleName, scoreChange: rule.scoreChange });
        }
      }

      const newScore = Math.max(0, Math.min(100, oldScore + scoreChange));

      // 5. Atualizar score do lead
      const [updatedLead] = await tx.update(angariacaoLeads)
        .set({
          score: newScore,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(angariacaoLeads.id, input.leadId),
            eq(angariacaoLeads.tenantId, context.tenantId)
          )
        )
        .returning();

      // 6. Registar atividade de mudanca de score
      if (scoreChange !== 0) {
        await tx.insert(leadActivities).values({
          tenantId: context.tenantId,
          leadId: input.leadId,
          activityType: 'score_change',
          description: `Score alterado de ${oldScore} para ${newScore} (${scoreChange >= 0 ? '+' : ''}${scoreChange})`,
          metadata: {
            oldScore,
            newScore,
            scoreDelta: scoreChange,
            appliedRules,
            activityType: input.activityType,
            activityMetadata: input.activityMetadata
          },
          userId: context.userId
        });
      }

      return { updatedLead, oldScore, scoreChange, appliedRules };
    });

    return {
      success: true,
      data: {
        leadId: result.updatedLead.id,
        email: result.updatedLead.email,
        oldScore: result.oldScore,
        newScore: result.updatedLead.score,
        scoreChange: result.scoreChange,
        appliedRules: result.appliedRules,
        message: `Score atualizado de ${result.oldScore} para ${result.updatedLead.score} (${result.scoreChange >= 0 ? '+' : ''}${result.scoreChange})`
      }
    };
  },
};
