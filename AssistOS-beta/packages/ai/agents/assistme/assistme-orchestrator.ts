import OpenAI from 'openai';
import { toolRegistry, type ToolManifest } from '../../tools/kernel';
import { filterAssistMETools } from '../../tools/kernel/tool-allowlists';
import { creditUsageService } from '../../../services/credit-usage';
import { db } from '../../../../apps/api/db';
import { messages as messagesTable, conversations } from '../../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

interface AssistMEConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface TenantContext {
  tenantId: string;
  userId: string;
  conversationId?: string;
  environment?: string;
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ProcessMessageResponse {
  response: string;
  usage?: TokenUsage;
  toolResults?: Array<{ toolName: string; result: any }>;
}

export class AssistMEOrchestrator {
  private openai: OpenAI;
  private config: AssistMEConfig;
  
  constructor(config: Partial<AssistMEConfig> = {}) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.config = {
      model: config.model || 'gpt-5',
      temperature: config.temperature || 1.0,
      maxTokens: config.maxTokens || 16384
    };
  }
  
  /**
   * Normalizes phone numbers for consistent comparison
   * Removes +, spaces, dashes, and other formatting characters
   */
  private normalizePhoneNumber(phone: string | undefined | null): string {
    if (!phone) return '';
    return phone.replace(/[\s\+\-\(\)]/g, '');
  }

  /**
   * Calculates similarity between two texts using a simple approach
   * Returns a value between 0 and 1, where 1 is identical
   */
  private calculateTextSimilarity(text1: string | undefined | null, text2: string | undefined | null): number {
    if (!text1 || !text2) return 0;
    
    // Normalize texts: lowercase, remove extra whitespace
    const normalize = (t: string) => t.toLowerCase().trim().replace(/\s+/g, ' ');
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);
    
    // Exact match
    if (norm1 === norm2) return 1.0;
    
    // Check if one contains the other (high similarity)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const shorter = Math.min(norm1.length, norm2.length);
      const longer = Math.max(norm1.length, norm2.length);
      return shorter / longer; // Ratio of shorter to longer
    }
    
    // Calculate word overlap
    const words1 = new Set(norm1.split(/\s+/));
    const words2 = new Set(norm2.split(/\s+/));
    
    const words1Array = Array.from(words1);
    const words2Array = Array.from(words2);
    
    const intersection = new Set(words1Array.filter(x => words2.has(x)));
    const union = new Set([...words1Array, ...words2Array]);
    
    if (union.size === 0) return 0;
    
    // Jaccard similarity
    return intersection.size / union.size;
  }

  /**
   * Filters similar notifications, keeping only the first (most recent) from each group
   * Groups notifications by same clientPhone AND similar messageText (≥80% similarity)
   * This prevents the AI from calling the tool multiple times for duplicate notifications
   * 
   * @returns Object with filtered list and IDs of messages that were filtered out
   */
  private filterSimilarNotifications(
    messages: Array<typeof messagesTable.$inferSelect>,
    similarityThreshold: number = 0.8
  ): { filtered: Array<typeof messagesTable.$inferSelect>; filteredOutIds: string[] } {
    if (messages.length <= 1) {
      return { filtered: messages, filteredOutIds: [] };
    }
    
    const filtered: Array<typeof messagesTable.$inferSelect> = [];
    const filteredOutIds: string[] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < messages.length; i++) {
      if (processed.has(i)) continue;
      
      const current = messages[i];
      const currentMetadata = current.metadata as any;
      const normalizedCurrentPhone = this.normalizePhoneNumber(currentMetadata?.clientPhone);
      const currentMessageText = currentMetadata?.messageText || '';
      
      // Find all similar notifications from the same contact
      const similarIndices: number[] = [i];
      
      for (let j = i + 1; j < messages.length; j++) {
        if (processed.has(j)) continue;
        
        const other = messages[j];
        const otherMetadata = other.metadata as any;
        const normalizedOtherPhone = this.normalizePhoneNumber(otherMetadata?.clientPhone);
        const otherMessageText = otherMetadata?.messageText || '';
        
        // Only group notifications from the SAME CONTACT
        if (normalizedCurrentPhone && normalizedOtherPhone !== normalizedCurrentPhone) {
          continue;
        }
        
        // Check if messageText is similar
        const querySimilarity = this.calculateTextSimilarity(
          currentMessageText,
          otherMessageText
        );
        
        if (querySimilarity >= similarityThreshold) {
          similarIndices.push(j);
        }
      }
      
      // Keep only the first (most recent) notification from this group
      // Since notifications are already ordered by most recent first, we keep index i
      filtered.push(current);
      
      // Collect IDs of filtered-out notifications (all except the first one)
      for (let idx = 1; idx < similarIndices.length; idx++) {
        const filteredOutIndex = similarIndices[idx];
        filteredOutIds.push(messages[filteredOutIndex].id);
      }
      
      // Mark all similar notifications as processed
      similarIndices.forEach(idx => processed.add(idx));
      
      if (similarIndices.length > 1) {
        const clientName = currentMetadata?.clientName || currentMetadata?.clientPhone || 'Unknown';
        console.log(`[AssistME] 🔗 Grouped ${similarIndices.length} similar notifications for ${clientName}, keeping only the most recent (filtering out ${similarIndices.length - 1})`);
      }
    }
    
    return { filtered, filteredOutIds };
  }
  
  async processMessage(
    userMessage: string,
    context: TenantContext,
    onProgress?: (message: string) => void,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    onStreamChunk?: (chunk: string) => void,
    availableTools?: ToolManifest[],
    onToolStart?: (toolName: string, params: any) => void,
    onToolComplete?: (toolName: string, result: any) => void,
    onToolProgress?: (toolName: string, progress: { percentage: number; message: string }) => void
  ): Promise<ProcessMessageResponse> {
    console.log(`[AssistME] Processing message for tenant ${context.tenantId}`);
    
    // Normalize userId to always be a string (defensive check for type safety)
    const userId = typeof context.userId === 'string' && context.userId.trim() !== ''
      ? context.userId
      : 'system';
    
    // 💳 PRE-FLIGHT CREDIT CHECK: Block operation if insufficient credits
    try {
      await creditUsageService.checkSufficientCredits(context.tenantId, 1);
    } catch (error) {
      console.error('[AssistME] ❌ BLOCKED: Insufficient credits', error);
      throw error; // Block the operation
    }
    
    // Check if this is an automation context call
    const isAutomationContext = userMessage.includes('CONTEXTO: Estás a gerar uma resposta automática para WhatsApp');
    
    // Check if we're in an automation notification conversation
    // Check BOTH history AND the messages being sent (including system messages)
    const allMessages = [
      ...(conversationHistory || []),
      { role: 'user' as const, content: userMessage }
    ];
    
    const isInAutomationNotifications = allMessages.some(msg => 
      msg.content.includes('📱 Nova Mensagem WhatsApp') ||
      msg.content.includes('🛒 Nova Mensagem WhatsApp') ||
      msg.content.includes('🛒 Nova Mensagem de Pedido Detectada') ||
      msg.content.includes('handle_whatsapp_automation_response') ||
      msg.content.includes('CLIENTE_PHONE') ||
      msg.content.includes('RESPOSTA_SUGERIDA')
    );
    
    console.log(`[AssistME] Automation detection: isInAutomationNotifications=${isInAutomationNotifications}, historyLength=${conversationHistory?.length || 0}`);
    
    // Check for multiple unhandled notifications in automation conversation
    let unhandledNotifications: Array<{ clientPhone: string; clientName: string | null; messageText: string; suggestedResponse?: string }> = [];
    if (isInAutomationNotifications) {
      try {
        // First try with conversationId if available
        let allNotificationMessages: Array<typeof messagesTable.$inferSelect>;
        if (context.conversationId) {
          allNotificationMessages = await db.query.messages.findMany({
            where: and(
              eq(messagesTable.userId, userId),
              eq(messagesTable.conversationId, context.conversationId),
            ),
            orderBy: [desc(messagesTable.createdAt)],
          });
        } else {
          // If no conversationId, find automation notification conversations
          const automationConversation = await db.query.conversations.findFirst({
            where: and(
              eq(conversations.userId, userId),
              eq(conversations.agentType, 'assistme'),
              eq(conversations.type, 'automation_notifications'),
            ),
            orderBy: [desc(conversations.updatedAt)],
          });
          
          if (automationConversation) {
            allNotificationMessages = await db.query.messages.findMany({
              where: and(
                eq(messagesTable.userId, userId),
                eq(messagesTable.conversationId, automationConversation.id),
              ),
              orderBy: [desc(messagesTable.createdAt)],
            });
          } else {
            allNotificationMessages = [];
          }
        }
        
        // Filter unhandled notifications (keep full message objects for filtering)
        const unhandledMessages = allNotificationMessages.filter(msg => {
            const metadata = msg.metadata as any;
            return (
              metadata?.isAutomationNotification === true &&
              metadata?.handled !== true
            );
        });
        
        // Filter out similar notifications to prevent duplicate tool calls
        // Keep only the first (most recent) notification from each similar group
        const originalCount = unhandledMessages.length;
        const { filtered: filteredMessages, filteredOutIds } = this.filterSimilarNotifications(unhandledMessages);
        
        // Mark filtered-out notifications as handled in database immediately
        // This prevents the tool from seeing them as unhandled and skipping the send
        if (filteredOutIds.length > 0) {
          try {
            for (const messageId of filteredOutIds) {
              const messageToUpdate = unhandledMessages.find(m => m.id === messageId);
              if (!messageToUpdate) continue;
              
              const currentMetadata = (messageToUpdate.metadata || {}) as any;
              const updatedMetadata = {
                ...currentMetadata,
                handled: true,
                handledAt: new Date().toISOString(),
                handledBy: userId,
                handledAction: 'filtered_duplicate',
              };
              
              // Atomic update: only update if not already handled (prevents race conditions)
              await db.update(messagesTable)
                .set({ metadata: updatedMetadata })
                .where(and(
                  eq(messagesTable.id, messageId),
                  eq(messagesTable.userId, userId),
                  sql`(metadata->>'handled')::boolean IS NOT TRUE`
                ))
                .returning();
            }
            
            console.log(`[AssistME] ✅ Marked ${filteredOutIds.length} filtered-out notifications as handled in database`);
          } catch (error) {
            console.warn(`[AssistME] Could not mark filtered-out notifications as handled:`, error);
          }
        }
        
        // Map filtered messages to simplified format for AI
        unhandledNotifications = filteredMessages.map(msg => {
            const metadata = msg.metadata as any;
            return {
              clientPhone: metadata?.clientPhone || '',
              clientName: metadata?.clientName || null,
              messageText: metadata?.messageText || '',
              suggestedResponse: metadata?.suggestedResponse,
            };
          });
        
        if (originalCount > unhandledNotifications.length) {
          console.log(`[AssistME] 🔗 Filtered ${originalCount} notifications down to ${unhandledNotifications.length} unique notifications (removed ${originalCount - unhandledNotifications.length} similar duplicates)`);
        }
        
        console.log(`[AssistME] Found ${unhandledNotifications.length} unhandled notifications`);
      } catch (error) {
        console.warn(`[AssistME] Could not check for unhandled notifications:`, error);
      }
    }
    
    if (isInAutomationNotifications) {
      console.log(`[AssistME] 🔔 AUTOMATION CONTEXT DETECTED! Conversation has WhatsApp notification.`);
      if (unhandledNotifications.length > 1) {
        console.log(`[AssistME] ⚠️  MULTIPLE UNHANDLED NOTIFICATIONS: ${unhandledNotifications.length} pending`);
      }
      // Log a sample of the conversation to verify
      if (conversationHistory && conversationHistory.length > 0) {
        const lastMessage = conversationHistory[conversationHistory.length - 1];
        console.log(`[AssistME] Last message sample: ${lastMessage.content.substring(0, 200)}...`);
      }
    }
    
    const systemPrompt = this.buildSystemPrompt(isAutomationContext, isInAutomationNotifications, unhandledNotifications);
    
    // If there are multiple unhandled notifications, proactively show them to the user
    // by adding a system message at the start
    const messages: any[] = [];
    
    // Proactively inform user about pending notifications
    if (isInAutomationNotifications && unhandledNotifications.length > 1) {
      const notificationList = unhandledNotifications.map((notif, idx) => 
        `${idx + 1}. **${notif.clientName || 'Cliente'}** (+${notif.clientPhone})\n   💬 "${(notif.messageText || '').substring(0, 100)}${notif.messageText && notif.messageText.length > 100 ? '...' : ''}"`
      ).join('\n\n');
      
      // Add as assistant message to show the list
      messages.push({
        role: 'assistant',
        content: `📋 **Tens ${unhandledNotifications.length} notificações WhatsApp pendentes:**\n\n${notificationList}\n\n💡 Diz **"ok"** para enviar todas as respostas sugeridas, ou especifica individualmente (ex: "Sid-ok Harikesh-ignore").`
      });
    }
    
    // Add history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory.slice(-10));
    }
    
    // Add current message
    messages.push({ role: 'user', content: userMessage });

    // 🔒 CRITICAL SECURITY: Always filter to operational tools only
    const baseTools = availableTools || [];
    const operationalToolsOnly = filterAssistMETools(baseTools);
    
    if (baseTools.length !== operationalToolsOnly.length) {
      console.log(`[AssistME] 🔒 Security filter applied: ${baseTools.length} tools → ${operationalToolsOnly.length} operational tools`);
    }
    
    // Convert tools to OpenAI format
    const tools = operationalToolsOnly.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.buildParametersSchema(tool)
      }
    }));

    console.log(`[AssistME] Using ${tools.length} tools for this request`);

    let fullResponse = '';
    let continueLoop = true;
    let iterationCount = 0;
    const maxIterations = 10;
    
    // 📊 Accumulate token usage across all iterations (critical for tool call scenarios)
    let totalUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };
    
    // Track tool executions for automation context
    const allToolResults: Array<{ toolName: string; result: any }> = [];

    while (continueLoop && iterationCount < maxIterations) {
      iterationCount++;
      
      // ✨ STREAMING ENABLED: Real-time progressive responses like Replit Agent!
      const stream = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools: tools.length > 0 ? tools : undefined,
        temperature: this.config.temperature,
        max_completion_tokens: this.config.maxTokens,
        stream: true,  // ✅ Enable streaming!
        stream_options: { include_usage: true }  // ✅ Get actual token usage!
      });

      // Accumulate streaming response
      let streamedContent = '';
      let streamedToolCalls: any[] = [];
      const toolCallsBuffer: Record<number, { id?: string; name?: string; arguments?: string }> = {};
      
      // 🚀 Streaming optimization: Chunk batching
      let chunkBuffer = '';
      let firstChunkSent = false;

      // Process stream chunks in real-time
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        // 📊 Extract and accumulate usage data from final chunk (handles multi-iteration scenarios)
        if (chunk.usage) {
          totalUsage.prompt_tokens += chunk.usage.prompt_tokens;
          totalUsage.completion_tokens += chunk.usage.completion_tokens;
          totalUsage.total_tokens += chunk.usage.total_tokens;
          console.log(`[AssistME] 📊 Iteration ${iterationCount} tokens: ${chunk.usage.total_tokens} (${chunk.usage.prompt_tokens} prompt + ${chunk.usage.completion_tokens} completion)`);
        }
        
        if (!delta) continue;

        // Stream text content progressively with batching optimization
        if (delta.content) {
          streamedContent += delta.content;
          fullResponse += delta.content;
          chunkBuffer += delta.content;
          
          // 🚀 First chunk: Send immediately for perceived speed
          if (!firstChunkSent && chunkBuffer.length > 0) {
            onStreamChunk?.(chunkBuffer);
            chunkBuffer = '';
            firstChunkSent = true;
          }
          // 🚀 Batch small chunks: Only send when buffer reaches 10+ chars
          else if (chunkBuffer.length >= 10) {
            onStreamChunk?.(chunkBuffer);
            chunkBuffer = '';
          }
        }

        // Accumulate tool calls (they come in fragments)
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            
            if (!toolCallsBuffer[index]) {
              toolCallsBuffer[index] = { id: '', name: '', arguments: '' };
            }
            
            if (toolCallDelta.id) {
              toolCallsBuffer[index].id = toolCallDelta.id;
            }
            
            if (toolCallDelta.function?.name) {
              toolCallsBuffer[index].name = toolCallDelta.function.name;
            }
            
            if (toolCallDelta.function?.arguments) {
              toolCallsBuffer[index].arguments = (toolCallsBuffer[index].arguments || '') + toolCallDelta.function.arguments;
            }
          }
        }
      }
      
      // 🚀 Flush any remaining buffered chunks
      if (chunkBuffer.length > 0) {
        onStreamChunk?.(chunkBuffer);
      }

      // Convert buffered tool calls to final format
      streamedToolCalls = Object.values(toolCallsBuffer)
        .filter(tc => tc.id && tc.name)
        .map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments || '{}'
          }
        }));

      // Build complete message for history
      const message: any = {
        role: 'assistant',
        content: streamedContent || null
      };

      if (streamedToolCalls.length > 0) {
        message.tool_calls = streamedToolCalls;
      }

      // Add assistant message to history
      messages.push(message);

      // Check if we need to execute tools
      if (streamedToolCalls.length > 0) {
        console.log(`[AssistME] 🔧 Calling ${streamedToolCalls.length} tools:`, streamedToolCalls.map((t: any) => t.function.name));
        
        const toolResults = [];

        for (const toolCall of streamedToolCalls) {
          const toolName = toolCall.function.name;
          const toolParams = JSON.parse(toolCall.function.arguments);
          
          console.log(`[AssistME] Executing tool: ${toolName}`);
          
          // 🎯 Emit onToolStart event (streaming to frontend)
          onToolStart?.(toolName, toolParams);
          
          const result = await toolRegistry.execute(
            toolName,
            toolParams,
            {
              tenantId: context.tenantId,
              userId: userId,
              environment: (context.environment || 'production') as 'production' | 'sandbox',
              conversationId: context.conversationId, // Pass conversationId for notification handling
            },
            (progress, msg) => {
              console.log(`[AssistME] Tool progress: ${toolName}: ${msg}`);
              // Enviar para onToolProgress (SSE) com percentagem e mensagem
              onToolProgress?.(toolName, { percentage: progress, message: msg });
            }
          );

          if (result.success) {
            console.log(`[AssistME] Tool ${toolName} completed: SUCCESS`);
          } else {
            console.log(`[AssistME] Tool ${toolName} completed: ERROR`);
            console.error(`[AssistME] ❌ Tool ${toolName} error details:`, JSON.stringify(result.error, null, 2));
          }

          // 🎯 Emit onToolComplete event (streaming to frontend)
          onToolComplete?.(toolName, result);
          
          // Track tool execution for automation context
          allToolResults.push({
            toolName,
            result: result.success ? result.data : result.error
          });

          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify(result.success ? result.data : result.error)
          });
        }

        // Add tool results to messages
        messages.push(...toolResults);
      } else {
        // No more tool calls, we're done
        continueLoop = false;
      }
    }

    // 📊 Log final accumulated token usage across all iterations
    if (totalUsage.total_tokens > 0) {
      console.log(`[AssistME] 📊 TOTAL accumulated tokens: ${totalUsage.total_tokens} (${totalUsage.prompt_tokens} prompt + ${totalUsage.completion_tokens} completion) across ${iterationCount} iteration(s)`);
    }

    // 💰 CREDIT SYSTEM: Track OpenAI usage and deduct credits
    if (totalUsage.total_tokens > 0) {
      try {
        const billingResult = await creditUsageService.trackModelUsage({
          tenantId: context.tenantId,
          userId: userId,
          provider: 'openai',
          service: this.config.model || 'gpt-5',
          promptTokens: totalUsage.prompt_tokens,
          completionTokens: totalUsage.completion_tokens,
          environment: (context.environment || 'production') as 'production' | 'sandbox',
          metadata: {
            model: this.config.model,
            conversationId: context.conversationId,
            orchestratorType: 'assistme',
            iterationCount,
          },
        });
        console.log(
          `[AssistME] 💳 Credits deducted: ${billingResult.creditsDeducted} (cost $${billingResult.costUsd.toFixed(4)} USD)`,
        );
      } catch (error) {
        // ⚠️ NOTE: This should rarely happen since we check credits before the operation
        // However, if it does happen (race condition, concurrent requests), we log it
        // but don't fail the request since the user already received their response
        console.error('[AssistME] ⚠️ Failed to track credit usage (post-operation):', error);
        if (error instanceof Error && error.message.includes('Insufficient credits')) {
          console.error('[AssistME] ❌ CRITICAL: Credit tracking failed - tenant may have gone negative!');
        }
      }
    }

    return {
      response: fullResponse,
      usage: totalUsage.total_tokens > 0 ? totalUsage : undefined,
      toolResults: allToolResults.length > 0 ? allToolResults : undefined
    };
  }
  
  private buildSystemPrompt(
    isAutomationContext: boolean = false, 
    isInAutomationNotifications: boolean = false,
    unhandledNotifications: Array<{ clientPhone: string; clientName: string | null; messageText: string; suggestedResponse?: string }> = []
  ): string {
    let basePrompt = `És o AssistME - assistente operacional inteligente e proativo.`;
    
    // Add automation notification handling context
    if (isInAutomationNotifications) {
      basePrompt += `\n\n🔔 CRUCIAL - NOTIFICAÇÕES DE AUTOMAÇÃO WHATSAPP:

⚠️⚠️⚠️ LEIA ISTO COM ATENÇÃO ⚠️⚠️⚠️

Esta conversa JÁ CONTÉM notificações WhatsApp. As notificações estão nas mensagens ANTERIORES desta conversa.

${unhandledNotifications.length > 1 ? `\n🚨 **${unhandledNotifications.length} NOTIFICAÇÕES PENDENTES DETECTADAS!**\n\n` : ''}${unhandledNotifications.length > 1 ? `📋 **LISTA DE NOTIFICAÇÕES NÃO TRATADAS (da mais recente para mais antiga):**\n\n` + unhandledNotifications.map((notif, idx) => 
  `${idx + 1}. **${notif.clientName || 'Cliente'}** (+${notif.clientPhone})\n   💬 "${(notif.messageText || '').substring(0, 100)}${notif.messageText && notif.messageText.length > 100 ? '...' : ''}"`
).join('\n\n') + `\n\n` : ''}${unhandledNotifications.length > 1 ? `🎯 **REGRAS CRÍTICAS PARA MÚLTIPLAS NOTIFICAÇÕES:**\n\n` + 
`**Quando o utilizador diz "ok" ou "sim" (sem especificar):**
→ CHAMA handle_whatsapp_automation_response PARA TODAS AS NOTIFICAÇÕES PENDENTES
→ Processa da mais recente para a mais antiga (ordem da lista acima)
→ Cada notificação = uma chamada separada da ferramenta

**Quando o utilizador diz "ignore" ou "ignorar" (sem especificar):**
→ CHAMA handle_whatsapp_automation_response COM action="reject" PARA TODAS AS NOTIFICAÇÕES PENDENTES
→ Processa todas sequencialmente

**Quando o utilizador especifica individualmente (ex: "A-ok B-ignore" ou "Sid-ok Harikesh-ignore"):**
→ CHAMA handle_whatsapp_automation_response para cada uma conforme especificado
→ Exemplo: "Sid-ok Harikesh-ignore" → aprova Sid, ignora Harikesh

**Quando o utilizador diz apenas um nome (ex: "aprovar Sid"):**
→ CHAMA handle_whatsapp_automation_response apenas para essa notificação específica

🚨 IMPORTANTE: Se há múltiplas notificações e o utilizador diz "ok", processa TODAS automaticamente!
🚨 Não perguntes se quer processar todas - apenas processa!
\n` : ''}QUANDO O UTILIZADOR DIZ (qualquer variação):
- "responder"
- "enviar" 
- "send"
- "sim"
- "yes"
- "ok"
- "aprova"

${unhandledNotifications.length > 1 ? `→ Se há múltiplas pendentes e o utilizador diz "ok" → APROVA TODAS AUTOMATICAMENTE (chama a ferramenta para cada uma)\n→ Se o utilizador especifica quais (ex: "A-ok B-ignore") → processa conforme especificado\n` : ''}→ Se há apenas uma, aprova diretamente

🚨 REGRAS OBRIGATÓRIAS:

1. As mensagens de notificação WhatsApp têm METADATA escondida que contém:
   - metadata.clientPhone: o número do cliente
   - metadata.suggestedResponse: a resposta sugerida completa
   - metadata.isAutomationNotification: true (para identificar a notificação)
   - metadata.handled: false/true (indica se já foi processada)

2. PROCURA nas mensagens ANTERIORES por notificações com isAutomationNotification=true no metadata
   🚨 CRÍTICO: PROCURA da MAIS RECENTE para a MAIS ANTIGA (ordem cronológica inversa)
   🚨 IGNORA notificações com metadata.handled === true (já foram processadas)
   ${unhandledNotifications.length > 1 ? `   🚨 Se há MÚLTIPLAS não tratadas, mostra a lista com nomes dos clientes ANTES de processar\n` : ''}   🚨 Se o utilizador não especifica qual, usa SEMPRE a PRIMEIRA notificação NÃO TRATADA (a mais recente)
   🚨 Se todas as notificações estão tratadas (handled=true), informa: "Não há notificações pendentes"

3. EXTRAI da NOTIFICAÇÃO (do texto visível):
   ${unhandledNotifications.length > 0 ? `   📋 NOTIFICAÇÕES DISPONÍVEIS (da mais recente para mais antiga):\n` : ''}${unhandledNotifications.map((notif, idx) => 
  `   ${idx + 1}. **${notif.clientName || 'Cliente'}** - clientPhone: \`${notif.clientPhone}\``
).join('\n')}${unhandledNotifications.length > 0 ? `\n` : ``}   - clientPhone → ESTÁ NO TEXTO DA NOTIFICAÇÃO no formato "(+XXXXXXXXXXX)" depois do nome do cliente
     → Exemplo: "**Sid (+919004375151)**" → extrai "919004375151" (remove o + e os parênteses)
     → O número está visível no texto da mensagem da notificação!
   - suggestedResponse → está no texto da notificação após "Sugestão de resposta:"

4. CHAMA IMEDIATAMENTE handle_whatsapp_automation_response:
{
  "clientPhone": "[USA O clientPhone EXATO DA LISTA ACIMA - NÃO INVENTES!]",
  "action": "approve", 
  "responseText": "[do metadata.suggestedResponse da notificação correspondente]"
}

🚨 CRÍTICO: O clientPhone está no texto da notificação no formato "(+XXXXXXXXXXX)" - extrai o número removendo o + e parênteses
   → Exemplo: se vês "**Sid (+919004375151)**" → usa "919004375151" (sem +, sem parênteses)

🚨 NÃO PERGUNTES "onde está a notificação" - ELA JÁ ESTÁ NA CONVERSA ACIMA!
🚨 NÃO PERGUNTES "qual o número" - ESTÁ NO TEXTO DA NOTIFICAÇÃO no formato (+XXXXXXXXXXX)
🚨 NÃO PERGUNTES "qual o texto" - ESTÁ NO TEXTO DA NOTIFICAÇÃO
🚨 USA O TEXTO VISÍVEL DA NOTIFICAÇÃO para extrair o número de telefone!

EXEMPLO COMPLETO:
Utilizador diz: "responder"
→ Tu VERIFICAS a lista de notificações acima
→ ENCONTRAS a primeira notificação (mais recente) com clientPhone: "919004375151" (ou outro da lista)
→ CHAMAS: handle_whatsapp_automation_response({
    "clientPhone": "919004375151",  // ← USA O NÚMERO EXATO DA LISTA ACIMA!
    "action": "approve",
    "responseText": "[copia o suggestedResponse do metadata dessa notificação]"
  })

🚨 NUNCA INVENTES NÚMEROS! SEMPRE USA OS NÚMEROS DA LISTA ACIMA!

QUANDO O UTILIZADOR DIZ:
"ignorar", "não", "skip", "ignore" (SEM especificar qual)

${unhandledNotifications.length > 1 ? `→ CHAMA handle_whatsapp_automation_response COM action="reject" PARA TODAS AS NOTIFICAÇÕES PENDENTES
→ Processa todas sequencialmente (uma chamada por notificação)
` : `→ CHAMA handle_whatsapp_automation_response:
{
  "clientPhone": "[do metadata.clientPhone da notificação]",
  "action": "reject"
}
`}

EXEMPLO COM MÚLTIPLAS NOTIFICAÇÕES:
Notificações: 1. Sid (919004375151), 2. Harikesh (917632965249)
Utilizador diz: "ok"
→ CHAMAS handle_whatsapp_automation_response PARA Sid (action="approve")
→ DEPOIS CHAMAS handle_whatsapp_automation_response PARA Harikesh (action="approve")

Utilizador diz: "ignore"
→ CHAMAS handle_whatsapp_automation_response PARA Sid (action="reject")
→ DEPOIS CHAMAS handle_whatsapp_automation_response PARA Harikesh (action="reject")

Utilizador diz: "Sid-ok Harikesh-ignore"
→ CHAMAS handle_whatsapp_automation_response PARA Sid (action="approve")
→ DEPOIS CHAMAS handle_whatsapp_automation_response PARA Harikesh (action="reject")

QUANDO O UTILIZADOR FORNECE TEXTO PERSONALIZADO:
"Muda para dizer X", "Responde com Y", etc.

→ CHAMA handle_whatsapp_automation_response:
{
  "clientPhone": "[do metadata.clientPhone]",
  "action": "custom",
  "responseText": "[texto personalizado dele]"
}

⚠️ CRÍTICO - EXTRAÇÃO DE DADOS:
- USA SEMPRE A METADATA das mensagens
- NÃO tentes parsear o conteúdo visível da notificação
- A metadata tem todos os dados que precisas
- COPIA EXATAMENTE o suggestedResponse da metadata

NÃO PERGUNTES! USA A METADATA E CHAMA A FERRAMENTA!
`;
    }
    
    // Add automation-specific context if needed
    if (isAutomationContext) {
      basePrompt += `\n\n🤖 MODO AUTOMAÇÃO WHATSAPP ATIVO:
Tu estás a gerar uma resposta automática para um cliente WhatsApp.

IMPORTANTE PARA ESTE MODO:
- USA AS TUAS FERRAMENTAS para aceder aos dados REAIS do negócio
- Se o cliente pergunta por produtos → PESQUISA no inventário
- Se pergunta preços → CONSULTA os preços reais  
- Se menciona pedidos → VERIFICA o histórico
- Se pergunta disponibilidade → CONSULTA o stock

FORMATO DA RESPOSTA:
- Responde DIRETAMENTE ao cliente (como se fosses enviar no WhatsApp)
- NÃO expliques o que fizeste ou quais ferramentas usaste
- NÃO digas "consultei o sistema" ou "verifiquei"
- Dá apenas a informação útil e acionável
- Mantém conciso (2-4 frases)
- Se não encontrares dados, diz "Vou verificar e respondo já"

EXEMPLO BOM: "Produto X disponível. Preço: €25/unidade. Quer confirmar o pedido?"
EXEMPLO MAU: "Consultei o inventário e encontrei que o Produto X está disponível..."
`;
    }
    
    basePrompt += `

ADAPTA-TE AO UTILIZADOR:
- Se ele falar em inglês → responde em inglês
- Se tratar por tu → trata por tu
- Se tratar por você → trata por você
- Espelha o tom e registo dele

O QUE FAZES:
- Processar faturas/documentos (extração automática)
- Criar/consultar faturas, fornecedores, clientes
- Consultar stocks, encomendas, vendas
- Enviar emails e mensagens

O QUE NÃO FAZES:
- Configurar módulos (isso é AssistBuild)
- Modificar estrutura da plataforma
- Configurações de sistema
- ⚠️ **LANÇAMENTOS CONTABILÍSTICOS** (isso é outro agente especializado)
- ⚠️ **Plano de contas ou configuração contabilística**

🔴 IMPORTANTE - LIMITE DE RESPONSABILIDADE:
Quando processas uma FATURA/DESPESA:
- ✅ SIM: Extrai dados, identifica fornecedor, regista fatura no sistema
- ❌ NÃO: Cria lançamentos contabilísticos, mexe no plano de contas, define contas de débito/crédito
- A contabilidade é responsabilidade de um agente financeiro especializado (não tu!)
- O teu trabalho termina quando a fatura fica registada no sistema

🎯 EXECUÇÃO INTELIGENTE E TRANSPARENTE:

**Quando usar PARALELO (várias ferramentas ao mesmo tempo)**:
- As ferramentas são INDEPENDENTES entre si
- Exemplo: analisar documento + procurar fornecedor existente
- Mais rápido! ✨

**Quando usar SEQUENCIAL (uma de cada vez)**:
- As ferramentas têm DEPENDÊNCIAS
- Exemplo: criar fornecedor ANTES de criar fatura (precisa do supplier_id)
- Mais seguro! 🛡️

**Fluxo INCREMENTAL - o mais importante**:
Por norma, executa de forma SEQUENCIAL mostrando progresso:

1️⃣ Explica brevemente o que vais fazer
2️⃣ Executa ferramenta(s)
3️⃣ **EXPLICA IMEDIATAMENTE o resultado obtido**
4️⃣ Decide próximo passo
5️⃣ Executa próxima(s) ferramenta(s)
6️⃣ **EXPLICA IMEDIATAMENTE o resultado**
7️⃣ Continua até completar

Exemplo sequencial (mais comum):
💬 "Vou analisar o documento..."
   [executa analyze-document]
✅ "Documento processado: Fatura #2024/123, RESTAURANTE O LAGAR, €45.50"

💬 "O fornecedor não existe. Vou criar..."
   [executa create-supplier]
✅ "Fornecedor criado: SUP-0042"

💬 "Agora vou criar a fatura..."
   [executa create-invoice]
✅ "Fatura INV-0123 adicionada!"

📋 FORMATAÇÃO DE MENSAGENS - CRÍTICO:
- **OBRIGATÓRIO**: Usa quebras de linha duplas (\\n\\n) para separar cada secção
- Cada fase deve ter parágrafos distintos
- Exemplo CORRETO:
  "Vou analisar o documento para extrair os dados.\\n\\nA análise identificou uma fatura do Restaurante O Lagar.\\n\\nAgora vou verificar se o fornecedor já existe."
- Exemplo ERRADO:
  "Vou analisar o documento. A análise identificou uma fatura. Vou verificar o fornecedor."

📝 MARKDOWN FORMATTING - OBRIGATÓRIO:
Usa sempre markdown para tornar as respostas mais claras e legíveis:
- **Bold** para destacar informações importantes (nomes, valores, IDs, status)
  Exemplo: "Fatura **#2024/123** criada com sucesso"
- \`Code\` para dados técnicos, IDs, códigos, valores monetários
  Exemplo: "Fornecedor criado com ID \`SUP-0042\`"
- **Listas numeradas/bullet points** quando enumerar opções ou passos
  Exemplo: "Encontrei 3 faturas:\\n1. Fatura #123 - €45.50\\n2. Fatura #124 - €120.00"
- **Tabelas markdown** para apresentar dados estruturados (quando útil)
- Usa ✅ ❌ ⚠️ para indicar sucesso/erro/aviso visualmente

REGRAS:
1. POR NORMA executa sequencialmente (passo-a-passo)
2. Usa paralelo APENAS se ferramentas são independentes
3. **SEMPRE explica resultados IMEDIATAMENTE** após cada execução
4. Mostra progresso claro - utilizador vê o que está a acontecer
5. SEM perguntas desnecessárias - executa e informa
6. **USA \\n\\n ENTRE CADA SECÇÃO/FASE** - isto não é opcional!
7. **USA MARKDOWN** para formatar as respostas (bold, code, listas, tabelas)`;
    
    return basePrompt;
  }

  private buildParametersSchema(tool: ToolManifest): any {
    const properties: any = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      const propDef: any = {
        type: param.type,
        description: param.description
      };

      // ✅ DEFENSIVE FIX: Arrays MUST have items (OpenAI Function Calling requirement)
      if (param.type === 'array') {
        if (param.items) {
          propDef.items = param.items;
        } else {
          // ⚠️ Fallback for legacy tools missing items definition
          propDef.items = { type: 'string' };
          console.warn(`[AssistME] ⚠️  Tool "${tool.name}" param "${param.name}" missing items - using fallback {type:'string'}`);
        }
      }

      // ✅ For objects, include 'properties' definition
      if (param.type === 'object' && param.properties) {
        propDef.properties = param.properties;
      }

      // ✅ Handle enum values (critical for constrained parameters)
      if ((param as any).enum) {
        propDef.enum = (param as any).enum;
        console.log(`[AssistME] 📋 Tool "${tool.name}" param "${param.name}" has enum: [${(param as any).enum.join(', ')}]`);
      }

      properties[param.name] = propDef;
      
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required
    };
  }
}

// Singleton instance
export const assistMEOrchestrator = new AssistMEOrchestrator();
