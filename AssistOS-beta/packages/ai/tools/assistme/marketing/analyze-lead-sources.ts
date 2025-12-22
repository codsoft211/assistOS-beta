import { db } from "../../../../../apps/api/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { angariacaoLeads } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  topN: z.number().min(1).max(50),
});

type Input = z.infer<typeof inputSchema>;

export const AnalyzeLeadSourcesTool: ToolDefinition<Input> = {
  name: "analyze-lead-sources",
  description: "Analisar performance de fontes de leads com metricas de volume, conversao e qualidade",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // Construir filtros base (sempre incluir tenant)
      const baseConditions = [eq(angariacaoLeads.tenantId, context.tenantId)];

      // Aplicar filtros de data se fornecidos
      if (input.startDate) {
        baseConditions.push(sql`${angariacaoLeads.createdAt} >= ${input.startDate}`);
      }
      if (input.endDate) {
        baseConditions.push(sql`${angariacaoLeads.createdAt} <= ${input.endDate}`);
      }

      const whereClause = baseConditions.length > 1 
        ? sql`${baseConditions[0]} AND ${sql.join(baseConditions.slice(1), sql` AND `)}`
        : baseConditions[0];

      // 1. Metricas por fonte
      const sourceMetrics = await tx
        .select({
          leadSource: angariacaoLeads.leadSource,
          totalLeads: sql<number>`COUNT(*)::int`,
          convertedLeads: sql<number>`COUNT(CASE WHEN ${angariacaoLeads.status} = 'Convertido' THEN 1 END)::int`,
          qualifiedLeads: sql<number>`COUNT(CASE WHEN ${angariacaoLeads.status} = 'Qualificado' THEN 1 END)::int`,
          lostLeads: sql<number>`COUNT(CASE WHEN ${angariacaoLeads.status} = 'Descartado' THEN 1 END)::int`,
          avgScore: sql<number>`ROUND(AVG(${angariacaoLeads.score})::numeric, 2)::float`,
          maxScore: sql<number>`MAX(${angariacaoLeads.score})::int`,
          minScore: sql<number>`MIN(${angariacaoLeads.score})::int`,
        })
        .from(angariacaoLeads)
        .where(whereClause)
        .groupBy(angariacaoLeads.leadSource)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(input.topN);

      // 2. Calcular metricas derivadas
      const sourcesAnalysis = sourceMetrics.map((source: any) => ({
        leadSource: source.leadSource,
        totalLeads: source.totalLeads,
        convertedLeads: source.convertedLeads,
        qualifiedLeads: source.qualifiedLeads,
        lostLeads: source.lostLeads,
        conversionRate: source.totalLeads > 0 
          ? Math.round((source.convertedLeads / source.totalLeads) * 100) 
          : 0,
        qualificationRate: source.totalLeads > 0 
          ? Math.round((source.qualifiedLeads / source.totalLeads) * 100) 
          : 0,
        lostRate: source.totalLeads > 0 
          ? Math.round((source.lostLeads / source.totalLeads) * 100) 
          : 0,
        avgScore: source.avgScore,
        scoreRange: {
          min: source.minScore,
          max: source.maxScore,
          spread: source.maxScore - source.minScore,
        },
      }));

      // 3. Total geral
      const [totals] = await tx
        .select({
          totalLeads: sql<number>`COUNT(*)::int`,
          totalConverted: sql<number>`COUNT(CASE WHEN ${angariacaoLeads.status} = 'Convertido' THEN 1 END)::int`,
          avgScore: sql<number>`ROUND(AVG(${angariacaoLeads.score})::numeric, 2)::float`,
        })
        .from(angariacaoLeads)
        .where(whereClause);

      // 4. Identificar top performers
      const topPerformers = sourcesAnalysis
        .filter((s: any) => s.totalLeads >= 5)
        .sort((a: any, b: any) => {
          const scoreA = (a.conversionRate * 0.5) + (a.avgScore * 0.3) + (a.qualificationRate * 0.2);
          const scoreB = (b.conversionRate * 0.5) + (b.avgScore * 0.3) + (b.qualificationRate * 0.2);
          return scoreB - scoreA;
        })
        .slice(0, 5);

      return {
        sourcesAnalysis,
        topPerformers,
        totals: {
          totalLeads: totals.totalLeads,
          totalConverted: totals.totalConverted,
          overallConversionRate: totals.totalLeads > 0 
            ? Math.round((totals.totalConverted / totals.totalLeads) * 100) 
            : 0,
          avgScore: totals.avgScore,
        },
      };
    });

    return {
      success: true,
      data: {
        sources: result.sourcesAnalysis,
        topPerformers: result.topPerformers.map((s: any, i: any) => ({
          rank: i + 1,
          ...s,
        })),
        totals: result.totals,
        period: {
          startDate: input.startDate,
          endDate: input.endDate,
        },
        message: `Analise de ${result.sourcesAnalysis.length} fontes concluida. Taxa geral de conversao: ${result.totals.overallConversionRate}%`
      }
    };
  },
};
