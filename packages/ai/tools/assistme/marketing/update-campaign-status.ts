import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { adCampaigns } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  campaignId: z.string().min(1, "ID da campanha obrigatório"),
  status: z.enum(['active', 'paused', 'ended', 'draft'], {
    errorMap: () => ({ message: "Status deve ser: active, paused, ended ou draft" }),
  }),
  reason: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const UpdateCampaignStatusTool: ToolDefinition<Input> = {
  name: "update-campaign-status",
  description: "Atualiza o status de uma campanha (active, paused, ended, draft). Use para pausar, reativar ou encerrar campanhas",
  category: "marketing",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Verificar se campanha existe
    const [existingCampaign] = await db
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

    if (!existingCampaign) {
      return {
        success: false,
        error: "Campanha não encontrada",
      };
    }

    const previousStatus = existingCampaign.campaignStatus;

    // Atualizar status
    const [updatedCampaign] = await db
      .update(adCampaigns)
      .set({
        campaignStatus: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(adCampaigns.id, input.campaignId),
          eq(adCampaigns.tenantId, context.tenantId),
          eq(adCampaigns.environment, context.environment)
        )
      )
      .returning();

    const statusLabels: Record<string, string> = {
      active: 'Ativa',
      paused: 'Pausada',
      ended: 'Terminada',
      draft: 'Rascunho',
    };

    return {
      success: true,
      data: {
        campaignId: updatedCampaign.id,
        campaignName: updatedCampaign.campaignName,
        previousStatus,
        newStatus: input.status,
        reason: input.reason,
        message: `Campanha "${updatedCampaign.campaignName}" alterada de ${statusLabels[previousStatus]} para ${statusLabels[input.status]}${input.reason ? `. Motivo: ${input.reason}` : ''}`,
      },
    };
  },
};
