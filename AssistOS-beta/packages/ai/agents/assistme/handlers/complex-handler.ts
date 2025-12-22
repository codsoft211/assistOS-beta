/**
 * Complex Handler - Full AI orchestration with GPT-5
 * 
 * Target: 1% of queries, 4-8s latency
 * 
 * Approach:
 * 1. Use full AssistME orchestrator (GPT-5) with complete context
 * 2. Allow multi-turn tool execution
 * 3. Provide comprehensive, well-reasoned responses
 * 
 * Highest cost but handles exploratory/vague queries
 */

import type { HybridResponse, HandlerOptions } from '../types';
import { HybridMode } from '../types';
import { assistMEOrchestrator } from '../assistme-orchestrator';
import { SmartToolSelector } from '../utils/smart-tool-selector';

export class ComplexHandler {
  /**
   * Handle complex query with full orchestration
   */
  async handle(
    query: string,
    options: HandlerOptions
  ): Promise<HybridResponse> {
    const startTime = Date.now();
    const { context, onProgress, onStreamChunk, onToolStart, onToolProgress, onToolComplete, conversationHistory, attachments } = options;

    const hasAttachments = attachments && attachments.length > 0;
    const attachmentInfo = hasAttachments ? ` com ${attachments!.length} anexo(s)` : '';
    
    onProgress?.(`🧠 Modo Complex - Análise completa em curso${attachmentInfo}\n`);

    try {
      let fullResponse = '';

      // Log attachment info for debugging
      if (hasAttachments) {
        console.log(`[ComplexHandler] Processing with ${attachments!.length} attachment(s):`, 
          attachments!.map(a => ({ id: a.id, type: a.type, name: a.originalName }))
        );
      }

      // Enhance query with attachment context if present
      let enhancedQuery = query;
      if (hasAttachments) {
        const attachmentDescriptions = attachments!.map(att => 
          `- ${att.originalName || 'Arquivo'} (${att.mimeType || 'tipo desconhecido'}, ${(att.size || 0) / 1024}KB) [ID: ${att.id}, Path: ${att.url}]`
        ).join('\n');
        
        enhancedQuery = `${query}\n\n**ANEXOS DISPONÍVEIS:**\n${attachmentDescriptions}\n\n**INSTRUÇÕES:** Use as ferramentas analyze_document ou analyze_image para processar automaticamente os anexos acima. NÃO peça ao usuário para digitar dados manualmente - leia os documentos usando as ferramentas de análise.`;
      }

      // Select relevant tools AFTER enhancing query (so SmartToolSelector sees attachment context)
      const relevantTools = await SmartToolSelector.selectRelevantTools(enhancedQuery);
      
      // ✅ FORCE-INCLUDE document analysis tools when attachments are present
      if (hasAttachments) {
        const { toolRegistry } = await import('../../../tools/kernel/registry');
        const analyzeDocTool = toolRegistry.get('analyze_document');
        const analyzeImageTool = toolRegistry.get('analyze_image');
        
        // Add document analysis tools if not already selected
        if (analyzeDocTool && !relevantTools.find(t => t.manifest.name === 'analyze_document')) {
          relevantTools.push(analyzeDocTool);
          console.log('[ComplexHandler] Force-included analyze_document tool for attachments');
        }
        if (analyzeImageTool && !relevantTools.find(t => t.manifest.name === 'analyze_image')) {
          relevantTools.push(analyzeImageTool);
          console.log('[ComplexHandler] Force-included analyze_image tool for attachments');
        }
      }
      
      const toolManifests = relevantTools.map(t => t.manifest);

      // Use AssistME orchestrator with GPT-5
      // Attachments are included in the enhanced query with explicit instructions to use analysis tools
      const result = await assistMEOrchestrator.processMessage(
        enhancedQuery,
        {
          tenantId: context.tenantId,
          userId: context.userId,
          ...(context.conversationId && { conversationId: context.conversationId }),
          environment: context.environment || 'production'
        },
        (msg) => {
          onProgress?.(msg);
        },
        conversationHistory || [],
        (chunk) => {
          fullResponse += chunk;
          onStreamChunk?.(chunk);
        },
        toolManifests,
        (toolName, params) => {
          // 🎯 Stream tool start event to frontend
          onToolStart?.(toolName, params);
        },
        (toolName, result) => {
          // 🎯 Stream tool complete event to frontend
          onToolComplete?.(toolName, result);
        }
      );

      const duration = Date.now() - startTime;

      // 📊 Use actual token usage from OpenAI API response
      let cost_usd = 0;
      if (result.usage) {
        // GPT-5 pricing: $0.0075 per 1K input tokens, $0.03 per 1K output tokens
        const inputCost = (result.usage.prompt_tokens / 1000) * 0.0075;
        const outputCost = (result.usage.completion_tokens / 1000) * 0.03;
        cost_usd = inputCost + outputCost;
        
        console.log(`[ComplexHandler] 📊 Actual tokens: ${result.usage.total_tokens} (${result.usage.prompt_tokens} prompt + ${result.usage.completion_tokens} completion)`);
        console.log(`[ComplexHandler] 💰 Cost breakdown: $${inputCost.toFixed(4)} input + $${outputCost.toFixed(4)} output = $${cost_usd.toFixed(4)} total`);
      } else {
        // Fallback to estimation if usage data not available
        const estimatedTokens = result.response.length / 4;
        cost_usd = (estimatedTokens / 1000) * 0.03;
        console.log(`[ComplexHandler] ⚠️  Using estimated cost (no usage data): $${cost_usd.toFixed(4)}`);
      }

      return {
        content: result.response,
        mode: HybridMode.COMPLEX,
        duration_ms: duration,
        tools_used: ['assistme_orchestrator'], // TODO: Track actual tools used
        cost_usd,
        metadata: {
          classification_confidence: 0.75
        }
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[ComplexHandler] Error:`, error);

      return {
        content: `Desculpe, ocorreu um erro ao processar a solicitação complexa: ${error.message}\n\nPor favor, tente reformular a pergunta ou dividi-la em partes menores.`,
        mode: HybridMode.COMPLEX,
        duration_ms: duration,
        cost_usd: 0,
        metadata: {
          classification_confidence: 0,
          error: error.message
        }
      };
    }
  }
}

export const complexHandler = new ComplexHandler();
