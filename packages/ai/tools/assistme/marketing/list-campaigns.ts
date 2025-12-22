import { db } from "../../../../../apps/api/db";
import { and, eq, or, like, desc } from "drizzle-orm";
import { adCampaigns } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  status: z.enum(['active', 'paused', 'ended', 'draft']).optional(),
  campaignType: z.enum(['search', 'display', 'shopping', 'video', 'other']).optional(),
  searchQuery: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

type Input = z.infer<typeof inputSchema>;

export const ListCampaignsTool: ToolDefinition<Input> = {
  name: "list-campaigns",
  description: "Lista campanhas de marketing com filtros opcionais por status, tipo ou pesquisa por nome",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const filters = [
      eq(adCampaigns.tenantId, context.tenantId),
      eq(adCampaigns.environment, context.environment),
    ];

    if (input.status) {
      filters.push(eq(adCampaigns.campaignStatus, input.status));
    }

    if (input.campaignType) {
      filters.push(eq(adCampaigns.campaignType, input.campaignType));
    }

    if (input.searchQuery) {
      filters.push(like(adCampaigns.campaignName, `%${input.searchQuery}%`));
    }

    const campaigns = await db
      .select()
      .from(adCampaigns)
      .where(and(...filters))
      .orderBy(desc(adCampaigns.createdAt))
      .limit(input.limit);

    return {
      success: true,
      data: {
        campaigns,
        count: campaigns.length,
        filters: {
          status: input.status || 'all',
          type: input.campaignType || 'all',
          search: input.searchQuery || 'none',
        },
        message: `Encontradas ${campaigns.length} campanhas`,
      },
    };
  },
};
