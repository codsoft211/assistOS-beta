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
  email: z.string().email("Email invalido"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  nif: z.string().optional(),
  leadSource: z.string().min(1, "Origem do lead obrigatoria"),
  leadSourceId: z.string().optional(),
  customFields: z.record(z.any()).optional(),
  notes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const CreateMarketingLeadTool: ToolDefinition<Input> = {
  name: "create-marketing-lead",
  description: "Criar lead de angariacao com score inicial baseado em regras",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Criar lead com score inicial em transacao atomica
    const result = await db.transaction(async (tx: any) => {
      // 1. Ler regras de scoring ativas do tenant
      const scoringRules = await tx.query.leadScoringRules.findMany({
        where: and(
          eq(leadScoringRules.tenantId, context.tenantId),
          eq(leadScoringRules.isActive, true)
        ),
        orderBy: [desc(leadScoringRules.priority)]
      });

      // 2. Calcular score inicial
      let initialScore = 0;
      const appliedRules: Array<{ ruleName: string; scoreChange: number }> = [];

      for (const rule of scoringRules) {
        // Aplicar regras baseadas em tipo
        if (rule.ruleType === 'lead_source' && rule.conditions?.value === input.leadSource) {
          initialScore += rule.scoreChange;
          appliedRules.push({ ruleName: rule.ruleName, scoreChange: rule.scoreChange });
        } else if (rule.ruleType === 'has_company' && input.company) {
          initialScore += rule.scoreChange;
          appliedRules.push({ ruleName: rule.ruleName, scoreChange: rule.scoreChange });
        } else if (rule.ruleType === 'has_phone' && input.phone) {
          initialScore += rule.scoreChange;
          appliedRules.push({ ruleName: rule.ruleName, scoreChange: rule.scoreChange });
        }
      }

      // Garantir score entre 0-100
      initialScore = Math.max(0, Math.min(100, initialScore));

      // 3. Criar lead
      const [newLead] = await tx.insert(angariacaoLeads).values({
        tenantId: context.tenantId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        company: input.company,
        nif: input.nif,
        leadSource: input.leadSource,
        leadSourceId: input.leadSourceId,
        status: 'Novo',
        score: initialScore,
        customFields: input.customFields,
        notes: input.notes,
        lastActivityAt: new Date()
      }).returning();

      // 4. Registar atividade de criacao
      await tx.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId: newLead.id,
        activityType: 'created',
        description: `Lead criado via ${input.leadSource}`,
        metadata: {
          initialScore,
          appliedRules: appliedRules.length > 0 ? appliedRules : undefined,
          leadSource: input.leadSource
        },
        userId: context.userId
      });

      return { newLead, initialScore, appliedRules };
    });

    return {
      success: true,
      data: {
        leadId: result.newLead.id,
        email: result.newLead.email,
        firstName: result.newLead.firstName,
        lastName: result.newLead.lastName,
        company: result.newLead.company,
        leadSource: result.newLead.leadSource,
        status: result.newLead.status,
        score: result.initialScore,
        appliedRules: result.appliedRules,
        message: `Lead criado com sucesso. Score inicial: ${result.initialScore}`
      }
    };
  },
};
