import { db } from "../../../../../apps/api/db";
import { and, eq, gte, lte, isNotNull, sql } from "drizzle-orm";
import { angariacaoLeads } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  segmentBy: z.enum(["source", "status", "score_range", "has_phone", "has_company", "all"]),
  filters: z.object({
    leadSource: z.string().optional(),
    status: z.string().optional(),
    minScore: z.number().min(0).max(100).optional(),
    maxScore: z.number().min(0).max(100).optional(),
    hasPhone: z.boolean().optional(),
    hasCompany: z.boolean().optional(),
  }).optional(),
});

type Input = z.infer<typeof inputSchema>;

export const SegmentLeadsTool: ToolDefinition<Input> = {
  name: "segment-leads",
  description: "Segmentar leads de marketing por criterios diversos e retornar contagens por segmento",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // Construir filtros base (sempre incluir tenant)
      const baseConditions: any[] = [eq(angariacaoLeads.tenantId, context.tenantId)];

      // Aplicar filtros opcionais
      if (input.filters) {
        if (input.filters.leadSource) {
          baseConditions.push(eq(angariacaoLeads.leadSource, input.filters.leadSource));
        }
        if (input.filters.status) {
          baseConditions.push(eq(angariacaoLeads.status, input.filters.status));
        }
        if (input.filters.minScore !== undefined) {
          baseConditions.push(gte(angariacaoLeads.score, input.filters.minScore));
        }
        if (input.filters.maxScore !== undefined) {
          baseConditions.push(lte(angariacaoLeads.score, input.filters.maxScore));
        }
        if (input.filters.hasPhone === true) {
          baseConditions.push(isNotNull(angariacaoLeads.phone));
        }
        if (input.filters.hasPhone === false) {
          baseConditions.push(sql`${angariacaoLeads.phone} IS NULL`);
        }
        if (input.filters.hasCompany === true) {
          baseConditions.push(isNotNull(angariacaoLeads.company));
        }
        if (input.filters.hasCompany === false) {
          baseConditions.push(sql`${angariacaoLeads.company} IS NULL`);
        }
      }

      let segments: any[] = [];

      // Segmentar por diferentes criterios
      if (input.segmentBy === "source" || input.segmentBy === "all") {
        const sourceSegments = await tx
          .select({
            segment: angariacaoLeads.leadSource,
            count: sql<number>`COUNT(*)::int`,
            avgScore: sql<number>`AVG(${angariacaoLeads.score})::int`,
          })
          .from(angariacaoLeads)
          .where(and(...baseConditions))
          .groupBy(angariacaoLeads.leadSource);

        segments.push({
          segmentType: "source",
          data: sourceSegments.map((s: any) => ({
            segment: s.segment,
            count: s.count,
            avgScore: s.avgScore,
          })),
        });
      }

      if (input.segmentBy === "status" || input.segmentBy === "all") {
        const statusSegments = await tx
          .select({
            segment: angariacaoLeads.status,
            count: sql<number>`COUNT(*)::int`,
            avgScore: sql<number>`AVG(${angariacaoLeads.score})::int`,
          })
          .from(angariacaoLeads)
          .where(and(...baseConditions))
          .groupBy(angariacaoLeads.status);

        segments.push({
          segmentType: "status",
          data: statusSegments.map((s: any) => ({
            segment: s.segment,
            count: s.count,
            avgScore: s.avgScore,
          })),
        });
      }

      if (input.segmentBy === "score_range" || input.segmentBy === "all") {
        const scoreRanges = [
          { name: "0-20", min: 0, max: 20 },
          { name: "21-40", min: 21, max: 40 },
          { name: "41-60", min: 41, max: 60 },
          { name: "61-80", min: 61, max: 80 },
          { name: "81-100", min: 81, max: 100 },
        ];

        const scoreSegments = [];
        for (const range of scoreRanges) {
          const [result] = await tx
            .select({
              count: sql<number>`COUNT(*)::int`,
            })
            .from(angariacaoLeads)
            .where(
              and(
                ...baseConditions,
                gte(angariacaoLeads.score, range.min),
                lte(angariacaoLeads.score, range.max)
              )
            );

          scoreSegments.push({
            segment: range.name,
            count: result.count,
            range: { min: range.min, max: range.max },
          });
        }

        segments.push({
          segmentType: "score_range",
          data: scoreSegments,
        });
      }

      if (input.segmentBy === "has_phone" || input.segmentBy === "all") {
        const [withPhone] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(angariacaoLeads)
          .where(and(...baseConditions, isNotNull(angariacaoLeads.phone)));

        const [withoutPhone] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(angariacaoLeads)
          .where(and(...baseConditions, sql`${angariacaoLeads.phone} IS NULL`));

        segments.push({
          segmentType: "has_phone",
          data: [
            { segment: "with_phone", count: withPhone.count },
            { segment: "without_phone", count: withoutPhone.count },
          ],
        });
      }

      if (input.segmentBy === "has_company" || input.segmentBy === "all") {
        const [withCompany] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(angariacaoLeads)
          .where(and(...baseConditions, isNotNull(angariacaoLeads.company)));

        const [withoutCompany] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(angariacaoLeads)
          .where(and(...baseConditions, sql`${angariacaoLeads.company} IS NULL`));

        segments.push({
          segmentType: "has_company",
          data: [
            { segment: "with_company", count: withCompany.count },
            { segment: "without_company", count: withoutCompany.count },
          ],
        });
      }

      // Total geral
      const [total] = await tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(angariacaoLeads)
        .where(and(...baseConditions));

      return { segments, total: total.count };
    });

    return {
      success: true,
      data: {
        totalLeads: result.total,
        segments: result.segments,
        segmentBy: input.segmentBy,
        filtersApplied: input.filters,
        message: `Segmentacao concluida: ${result.total} leads analisados`
      }
    };
  },
};
