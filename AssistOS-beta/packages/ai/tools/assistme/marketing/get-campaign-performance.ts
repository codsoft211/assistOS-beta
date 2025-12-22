import { db } from "../../../../../apps/api/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { adCampaigns, adCampaignPerformance, angariacaoLeads } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  campaignId: z.string().min(1, "ID da campanha obrigatório"),
  includeDailyBreakdown: z.boolean().default(false),
});

type Input = z.infer<typeof inputSchema>;

export const GetCampaignPerformanceTool: ToolDefinition<Input> = {
  name: "get-campaign-performance",
  description: "Obtém métricas detalhadas de performance de uma campanha (impressões, cliques, conversões, custo, ROI) e leads atribuídos",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // 1. Buscar dados da campanha
    const [campaign] = await db
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.id, input.campaignId),
          eq(adCampaigns.tenantId, context.tenantId),
          eq(adCampaigns.environment, context.environment)
        )
      )
      .limit(1);

    if (!campaign) {
      return {
        success: false,
        error: "Campanha não encontrada",
      };
    }

    // 2. Buscar dados de performance agregados
    const performanceData = await db
      .select()
      .from(adCampaignPerformance)
      .where(
        and(
          eq(adCampaignPerformance.campaignId, input.campaignId),
          eq(adCampaignPerformance.tenantId, context.tenantId),
          eq(adCampaignPerformance.environment, context.environment)
        )
      )
      .orderBy(desc(adCampaignPerformance.date));

    // 3. Calcular métricas agregadas
    const totals = performanceData.reduce(
      (acc, p) => ({
        impressions: acc.impressions + (p.impressions || 0),
        clicks: acc.clicks + (p.clicks || 0),
        conversions: acc.conversions + (p.conversions || 0),
        cost: acc.cost + (p.cost || 0),
      }),
      { impressions: 0, clicks: 0, conversions: 0, cost: 0 }
    );

    // 4. Calcular métricas derivadas
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const conversionRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;
    const costPerClick = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
    const costPerConversion = totals.conversions > 0 ? totals.cost / totals.conversions : 0;
    
    // ROI simplificado (assumindo valor médio de conversão de €100)
    const estimatedRevenue = totals.conversions * 100;
    const roi = totals.cost > 0 ? ((estimatedRevenue - totals.cost) / totals.cost) * 100 : 0;

    // 5. Buscar leads atribuídos
    const attributedLeads = await db
      .select()
      .from(angariacaoLeads)
      .where(
        and(
          eq(angariacaoLeads.campaign, input.campaignId),
          eq(angariacaoLeads.tenantId, context.tenantId)
        )
      )
      .orderBy(desc(angariacaoLeads.createdAt))
      .limit(50);

    return {
      success: true,
      data: {
        campaign: {
          id: campaign.id,
          name: campaign.campaignName,
          status: campaign.campaignStatus,
          type: campaign.campaignType,
          platform: campaign.adPlatform,
          budget: campaign.budget,
          budgetPeriod: campaign.budgetPeriod,
        },
        performance: {
          impressions: totals.impressions,
          clicks: totals.clicks,
          conversions: totals.conversions,
          cost: totals.cost,
          ctr: Math.round(ctr * 100) / 100,
          conversionRate: Math.round(conversionRate * 100) / 100,
          costPerClick: Math.round(costPerClick * 100) / 100,
          costPerConversion: Math.round(costPerConversion * 100) / 100,
          roi: Math.round(roi * 100) / 100,
        },
        leads: {
          total: attributedLeads.length,
          recent: attributedLeads.slice(0, 5).map(lead => ({
            id: lead.id,
            name: lead.name,
            email: lead.email,
            status: lead.status,
            score: lead.score,
            createdAt: lead.createdAt,
          })),
        },
        ...(input.includeDailyBreakdown && {
          dailyBreakdown: performanceData.slice(0, 30).map(p => ({
            date: p.date,
            impressions: p.impressions,
            clicks: p.clicks,
            conversions: p.conversions,
            cost: p.cost,
          })),
        }),
        message: `Campanha "${campaign.campaignName}": ${totals.impressions} impressões, ${totals.clicks} cliques, ${totals.conversions} conversões, ${attributedLeads.length} leads atribuídos`,
      },
    };
  },
};
