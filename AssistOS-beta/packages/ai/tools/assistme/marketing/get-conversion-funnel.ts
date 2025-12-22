import { db } from "../../../../../apps/api/db";
import { eq, sql } from "drizzle-orm";
import { angariacaoLeads } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const GetConversionFunnelTool: ToolDefinition<Input> = {
  name: "get-conversion-funnel",
  description: "Analisar funil de conversao de leads de marketing com metricas por status e taxas de conversao",
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

      // 1. Contar leads por status
      const statusCounts = await tx
        .select({
          status: angariacaoLeads.status,
          count: sql<number>`COUNT(*)::int`,
          avgScore: sql<number>`ROUND(AVG(${angariacaoLeads.score})::numeric, 2)::float`,
        })
        .from(angariacaoLeads)
        .where(whereClause)
        .groupBy(angariacaoLeads.status);

      // 2. Total de leads
      const [totalResult] = await tx
        .select({
          total: sql<number>`COUNT(*)::int`,
          avgScore: sql<number>`ROUND(AVG(${angariacaoLeads.score})::numeric, 2)::float`,
        })
        .from(angariacaoLeads)
        .where(whereClause);

      const total = totalResult.total;

      // 3. Construir metricas do funil
      const statusMap = new Map(statusCounts.map((s: any) => [s.status, s]));

      const novo: any = statusMap.get('Novo') || { count: 0, avgScore: 0 };
      const contactado: any = statusMap.get('Contactado') || { count: 0, avgScore: 0 };
      const qualificado: any = statusMap.get('Qualificado') || { count: 0, avgScore: 0 };
      const convertido: any = statusMap.get('Convertido') || { count: 0, avgScore: 0 };
      const perdido: any = statusMap.get('Descartado') || { count: 0, avgScore: 0 };

      // 4. Calcular taxas de conversao
      const conversionRates = {
        novoToContactado: novo.count > 0 ? Math.round((contactado.count / novo.count) * 100) : 0,
        contactadoToQualificado: contactado.count > 0 ? Math.round((qualificado.count / contactado.count) * 100) : 0,
        qualificadoToConvertido: qualificado.count > 0 ? Math.round((convertido.count / qualificado.count) * 100) : 0,
        overallConversion: total > 0 ? Math.round((convertido.count / total) * 100) : 0,
        lostRate: total > 0 ? Math.round((perdido.count / total) * 100) : 0,
      };

      return {
        total,
        avgScore: totalResult.avgScore,
        funnel: {
          novo: { count: novo.count, avgScore: novo.avgScore, percentage: total > 0 ? Math.round((novo.count / total) * 100) : 0 },
          contactado: { count: contactado.count, avgScore: contactado.avgScore, percentage: total > 0 ? Math.round((contactado.count / total) * 100) : 0 },
          qualificado: { count: qualificado.count, avgScore: qualificado.avgScore, percentage: total > 0 ? Math.round((qualificado.count / total) * 100) : 0 },
          convertido: { count: convertido.count, avgScore: convertido.avgScore, percentage: total > 0 ? Math.round((convertido.count / total) * 100) : 0 },
          perdido: { count: perdido.count, avgScore: perdido.avgScore, percentage: total > 0 ? Math.round((perdido.count / total) * 100) : 0 },
        },
        conversionRates,
      };
    });

    return {
      success: true,
      data: {
        total: result.total,
        avgScore: result.avgScore,
        funnel: result.funnel,
        conversionRates: result.conversionRates,
        period: {
          startDate: input.startDate,
          endDate: input.endDate,
        },
        message: `Funil de conversao: ${result.total} leads, ${result.conversionRates.overallConversion}% taxa de conversao`
      }
    };
  },
};
