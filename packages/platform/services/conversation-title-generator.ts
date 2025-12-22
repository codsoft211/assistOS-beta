/**
 * Conversation Title Generator Service
 * 
 * Generates AI-powered conversation titles by analyzing message history
 * Part of AssistME UI/UX improvements (WhatsApp-style conversation list)
 */

import OpenAI from "openai";
import { db } from "../../../apps/api/db";
import { conversations, messages } from "../../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { creditUsageService } from "../../services/credit-usage";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TitleGenerationResult {
  title: string;
  confidence: number;
}

/**
 * Generates a concise, descriptive title for a conversation by analyzing its messages
 * 
 * @param conversationId - The conversation ID
 * @param maxMessages - Maximum number of recent messages to analyze (default: 10)
 * @returns Generated title and confidence score
 */
export async function generateConversationTitle(
  conversationId: string,
  maxMessages: number = 10
): Promise<TitleGenerationResult> {
  try {
    // 1. Fetch conversation and recent messages
    const [conversation] = await db.select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // 💳 PRE-FLIGHT CREDIT CHECK: Block operation if insufficient credits
    const tenantId = conversation.tenantId;
    if (tenantId) {
      try {
        await creditUsageService.checkSufficientCredits(tenantId as string, 1);
      } catch (error) {
        console.error('[ConversationTitleGenerator] ❌ BLOCKED: Insufficient credits', error);
        // Return a default title instead of failing completely
        return {
          title: "Nova Conversa",
          confidence: 0.3
        };
      }
    }

    const messagesList = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(maxMessages);

    if (messagesList.length === 0) {
      return {
        title: "Nova Conversa",
        confidence: 0.5
      };
    }

    // 2. Prepare context for AI
    const messagesContext = messagesList
      .reverse() // Chronological order
      .map(msg => `${msg.role === 'user' ? 'Utilizador' : 'Assistente'}: ${msg.content}`)
      .join('\n\n');

    // 3. Call AI to generate title
    const prompt = `Analisa a seguinte conversa e gera um título CONCISO (máximo 5-6 palavras) que resuma o tema principal.

Regras:
- SEMPRE começa com o módulo relacionado se aplicável: "Financeiro -", "Compras -", "Logística -", "Comercial -", "Projetos -", "Angariação -"
- Título deve ser curto e descritivo
- Foca no TEMA PRINCIPAL ou OBJETIVO da conversa
- Se mencionar um cliente/entidade/número específico, inclui essa informação
- Exemplos ÓTIMOS: 
  * "Financeiro - Fatura #1234"
  * "Compras - Pedido Material Escritório"
  * "Logística - Stock Produto XYZ"
  * "Comercial - Proposta Cliente ABC"
  * "Angariação - Lead João Silva"
  * "Projetos - Projeto Alpha Timeline"
- Se não for claro qual módulo, usa apenas: "Descrição breve"
- NÃO uses "Conversa sobre...", apenas o tema direto

Módulos disponíveis: Financeiro, Compras, Logística, Comercial, Projetos, Angariação

Conversa:
${messagesContext}

Responde APENAS com o título, sem explicações adicionais.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 50,
      temperature: 0.3, // Low temperature for consistent titles
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const generatedTitle = response.choices[0]?.message?.content?.trim() || "Nova Conversa";

    if (response.usage) {
      const tenantId = conversation.tenantId;
      if (!tenantId) {
        console.warn(
          "[ConversationTitleGenerator] Skipping credit tracking: missing tenantId for conversation",
          conversationId,
        );
      } else {
        const resolvedTenantId = tenantId as string;
        const environment = (conversation.environment || "production") as
          | "production"
          | "sandbox";
        const userId = (conversation as any).currentAgentId || "system";
        const promptTokens = response.usage.prompt_tokens || 0;
        const completionTokens = response.usage.completion_tokens || 0;

        if (promptTokens > 0 || completionTokens > 0) {
          try {
            await creditUsageService.trackModelUsage({
              tenantId: resolvedTenantId,
              userId,
              provider: "openai",
              service: "gpt-4o-mini",
              promptTokens,
              completionTokens,
              environment,
              metadata: {
                operation: "conversation_title_generation",
                conversationId,
              },
            });
          } catch (error) {
            // ⚠️ NOTE: This should rarely happen since we check credits before the operation
            console.error(
              "[ConversationTitleGenerator] Failed to track credit usage (post-operation):",
              error,
            );
          }
        }
      }
    }

    // 4. Calculate confidence based on message count and title quality
    const confidence = Math.min(
      0.5 + (messagesList.length / 20), // More messages = higher confidence
      0.95
    );

    return {
      title: generatedTitle,
      confidence
    };

  } catch (error: any) {
    console.error("[ConversationTitleGenerator] Error:", error);
    
    // Fallback: use first user message as title
    const firstMessage = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(1);

    if (firstMessage.length > 0) {
      const title = firstMessage[0].content.slice(0, 50) + (firstMessage[0].content.length > 50 ? '...' : '');
      return {
        title,
        confidence: 0.3
      };
    }

    return {
      title: "Nova Conversa",
      confidence: 0.1
    };
  }
}
