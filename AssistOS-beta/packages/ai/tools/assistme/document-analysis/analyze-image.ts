import { ToolBase } from "../../kernel/base";
import { ToolManifest, ToolExecutionContext } from "../../kernel/types";
import { z } from "zod";
import { db } from "../../../../../apps/api/db";
import { fileAttachments } from "shared/schema";
import { eq, and } from "drizzle-orm";
import OpenAI from "openai";

import { creditUsageService } from "../../../../services/credit-usage";

import { getFileBuffer } from "../../../../../apps/api/services/file-storage.service";

export class AnalyzeImageTool extends ToolBase {
  private openai: OpenAI;

  constructor() {
    super();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY não está configurada. Por favor, configure a chave de API da OpenAI.",
      );
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  manifest: ToolManifest = {
    name: "analyze_image",
    category: "document_analysis" as const,
    scope: "tenant" as const,
    description:
      "Analisa qualquer imagem usando AI Vision para extrair informação, identificar objetos, ler texto, etc",
    parameters: [
      {
        name: "attachmentId",
        type: "string",
        description: "ID do anexo/imagem a analisar",
        required: true,
      },
      {
        name: "question",
        type: "string",
        description:
          'Pergunta específica sobre a imagem (opcional). Ex: "O que está nesta imagem?", "Que texto consegues ler?"',
        required: false,
      },
    ],
    outputSchema: z.object({
      description: z.string(),
      extractedText: z.string().optional(),
      objects: z.array(z.string()).optional(),
      analysis: z.string(),
      confidence: z.number().min(0).max(100),
      message: z.string(),
    }),
    requiresAuth: true,
    progressSupport: false,
  };

  async executeInternal(
    input: { attachmentId: string; question?: string },
    context: ToolExecutionContext,
  ) {
    // 💳 PRE-FLIGHT CREDIT CHECK: Block operation if insufficient credits
    try {
      await creditUsageService.checkSufficientCredits(context.tenantId, 1);
    } catch (error) {
      console.error('[AnalyzeImageTool] ❌ BLOCKED: Insufficient credits', error);
      throw error; // Block the operation
    }

    // 1. Buscar anexo na BD
    const [attachment] = await db
      .select()
      .from(fileAttachments)
      .where(
        and(
          eq(fileAttachments.id, input.attachmentId),
          eq(fileAttachments.tenantId, context.tenantId),
        ),
      );

    if (!attachment) {
      throw new Error(`Anexo ${input.attachmentId} não encontrado`);
    }

    // 2. Verificar se é imagem
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!imageTypes.includes(attachment.mimeType)) {
      throw new Error(`Arquivo não é uma imagem. Tipo: ${attachment.mimeType}`);
    }

    // 3. Ler arquivo do storage (Supabase, local, or GCS)
    const fileBuffer = await getFileBuffer(attachment);
    const base64Image = fileBuffer.toString("base64");

    // 4. Preparar prompt
    const question =
      input.question ||
      "Descreve detalhadamente o que vês nesta imagem. Extrai todo o texto visível.";

    // 5. Enviar para GPT-5 Vision
    let completion;
    try {
      completion = await this.openai.chat.completions.create({
        model: "gpt-5",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${attachment.mimeType};base64,${base64Image}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: question,
              },
            ],
          },
        ],
      });
    } catch (error: any) {
      throw new Error(
        `Erro ao chamar API do GPT-5: ${error.message || "Erro desconhecido"}`,
      );
    }

    // 6. Extrair resposta
    const responseText = completion.choices[0]?.message?.content || "";

    if (completion.usage) {
      try {
        await creditUsageService.trackModelUsage({
          tenantId: context.tenantId,
          userId: context.userId,
          provider: "openai",
          service: "gpt-5",
          promptTokens: completion.usage.prompt_tokens || 0,
          completionTokens: completion.usage.completion_tokens || 0,
          environment: context.environment,
          metadata: {
            tool: this.manifest.name,
            attachmentId: input.attachmentId,
            questionProvided: Boolean(input.question),
          },
        });
      } catch (error) {
        // ⚠️ NOTE: This should rarely happen since we check credits before the operation
        console.error(
          "[AnalyzeImageTool] Failed to track credit usage (post-operation):",
          error,
        );
      }
    }

    // 7. Parsear resposta para estrutura
    // Tentar detectar se tem texto extraído
    const extractedTextMatch = responseText.match(/texto[:\s]+(.*?)(?:\n|$)/i);
    const extractedText = extractedTextMatch
      ? extractedTextMatch[1].trim()
      : undefined;

    return {
      description: responseText.substring(0, 500), // Primeiros 500 chars
      extractedText,
      analysis: responseText,
      confidence: 85, // Claude Vision é muito confiável
      message: `✅ Imagem analisada com sucesso: ${attachment.originalName}`,
    };
  }
}
