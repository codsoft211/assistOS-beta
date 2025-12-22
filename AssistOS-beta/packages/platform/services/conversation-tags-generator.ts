/**
 * Conversation Tags Generator Service
 * 
 * Generates AI-powered automatic tags for conversations based on message content
 * Tags are used for filtering and organization
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../../apps/api/db";
import { conversations, messages } from "../../../shared/schema";
import { eq, desc } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface TagsGenerationResult {
  tags: string[];
  confidence: number;
}

/**
 * Generates automatic tags for a conversation by analyzing its messages
 * 
 * @param conversationId - The conversation ID
 * @param maxMessages - Maximum number of recent messages to analyze (default: 10)
 * @returns Generated tags and confidence score
 */
export async function generateConversationTags(
  conversationId: string,
  maxMessages: number = 10
): Promise<TagsGenerationResult> {
  try {
    // 1. Fetch conversation and recent messages
    const [conversation] = await db.select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const messagesList = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(maxMessages);

    if (messagesList.length === 0) {
      return {
        tags: [],
        confidence: 0
      };
    }

    // 2. Prepare context for AI
    const messagesContext = messagesList
      .reverse() // Chronological order
      .map(msg => `${msg.role === 'user' ? 'Utilizador' : 'Assistente'}: ${msg.content}`)
      .join('\n\n');

    // 3. Call AI to generate tags
    const prompt = `Analisa a seguinte conversa e gera tags AUTOMÁTICAS (máximo 3-5 tags) para organização e filtragem.

Regras:
- Tags devem ser CURTAS (1-2 palavras), em português, minúsculas
- Detecta automaticamente: módulo (financeiro, compras, logística, comercial, projetos), prioridade (urgente, importante), tipo (fatura, cliente, encomenda, lead, proposta)
- SEMPRE inclui pelo menos 1 tag relacionada ao módulo/categoria principal
- Exemplos ÓTIMOS:
  * Conversa sobre fatura → tags: ["financeiro", "fatura", "pendente"]
  * Conversa sobre compra urgente → tags: ["compras", "urgente", "material"]
  * Conversa sobre stock baixo → tags: ["logística", "stock", "alerta"]
  * Conversa sobre novo cliente → tags: ["comercial", "cliente", "novo"]
  * Conversa sobre lead → tags: ["angariação", "lead", "seguimento"]
- NÃO uses tags genéricas como "conversa", "geral", "outro"
- Foca em tags ÚTEIS para filtrar e organizar conversas

Conversa:
${messagesContext}

Responde APENAS com uma lista de tags separadas por vírgula, sem explicações. Exemplo: financeiro, fatura, pendente`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 100,
      temperature: 0.3, // Low temperature for consistent tags
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const generatedTagsText = response.content[0].type === 'text' 
      ? response.content[0].text.trim()
      : "";

    // Parse tags (comma-separated)
    const tags = generatedTagsText
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0 && tag.length < 30) // Reasonable tag length
      .slice(0, 5); // Max 5 tags

    // 4. Calculate confidence based on message count
    const confidence = Math.min(
      0.6 + (messagesList.length / 15), // More messages = higher confidence
      0.95
    );

    return {
      tags,
      confidence
    };

  } catch (error: any) {
    console.error("[ConversationTagsGenerator] Error:", error);
    
    // Fallback: return empty tags
    return {
      tags: [],
      confidence: 0.1
    };
  }
}
