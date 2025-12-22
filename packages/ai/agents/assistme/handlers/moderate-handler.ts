/**
 * Moderate Handler - Multi-tool execution with GPT-5
 * 
 * Target: 4% of queries, 2-4s latency
 * 
 * Approach:
 * 1. Use GPT-5 for orchestration (AssistME orchestrator)
 * 2. Execute 2-3 tools in sequence
 * 3. Synthesize coherent response
 * 
 * Uses AssistME orchestrator with focused tool selection
 */

import type { HybridResponse, HandlerOptions } from '../types';
import { HybridMode } from '../types';
import { assistMEOrchestrator } from '../assistme-orchestrator';
import { SmartToolSelector } from '../utils/smart-tool-selector';

export class ModerateHandler {
  /**
   * Handle moderate complexity query
   */
  async handle(
    query: string,
    options: HandlerOptions
  ): Promise<HybridResponse> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    const { context, onProgress, onStreamChunk, onToolStart, onToolProgress, onToolComplete, conversationHistory, attachments } = options;

    const hasAttachments = attachments && attachments.length > 0;
    const attachmentInfo = hasAttachments ? ` com ${attachments!.length} anexo(s)` : '';
    
    onProgress?.(`🤖 Modo Moderate - Processando com IA${attachmentInfo}\n`);

    try {
      let fullResponse = '';

      // Log attachment info for debugging
      if (hasAttachments) {
        console.log(`[ModerateHandler] Processing with ${attachments!.length} attachment(s):`, 
          attachments!.map(a => ({ id: a.id, type: a.type, name: a.originalName }))
        );
      }

      // ⏱️ Enhance query with attachment context if present
      const queryEnhanceStart = Date.now();
      let enhancedQuery = query;
      if (hasAttachments) {
        const attachmentDescriptions = attachments!.map(att => 
          `- ${att.originalName || 'Arquivo'} (${att.mimeType || 'tipo desconhecido'}, ${(att.size || 0) / 1024}KB) [ID: ${att.id}, Path: ${att.url}]`
        ).join('\n');
        
        enhancedQuery = `${query}\n\n**ANEXOS DISPONÍVEIS:**\n${attachmentDescriptions}\n\n**INSTRUÇÕES:** Use as ferramentas analyze_document ou analyze_image para processar automaticamente os anexos acima. NÃO peça ao usuário para digitar dados manualmente - leia os documentos usando as ferramentas de análise.`;
      }
      timings.query_enhancement = Date.now() - queryEnhanceStart;

      // ⏱️ Select relevant tools AFTER enhancing query (so SmartToolSelector sees attachment context)
      const toolSelectStart = Date.now();
      const relevantTools = await SmartToolSelector.selectRelevantTools(enhancedQuery);
      
      // ✅ FORCE-INCLUDE document analysis tools when attachments are present
      if (hasAttachments) {
        const { toolRegistry } = await import('../../../tools/kernel/registry');
        const analyzeDocTool = toolRegistry.get('analyze_document');
        const analyzeImageTool = toolRegistry.get('analyze_image');
        
        // Add document analysis tools if not already selected
        if (analyzeDocTool && !relevantTools.find(t => t.manifest.name === 'analyze_document')) {
          relevantTools.push(analyzeDocTool);
          console.log('[ModerateHandler] Force-included analyze_document tool for attachments');
        }
        if (analyzeImageTool && !relevantTools.find(t => t.manifest.name === 'analyze_image')) {
          relevantTools.push(analyzeImageTool);
          console.log('[ModerateHandler] Force-included analyze_image tool for attachments');
        }
      }
      
      const toolManifests = relevantTools.map(t => t.manifest);
      timings.tool_selection = Date.now() - toolSelectStart;
      
      console.log(`[⏱️ ModerateHandler] Tool selection: ${timings.tool_selection}ms (${relevantTools.length} tools selected)`);

      // ⏱️ Use AssistME orchestrator with GPT-5
      const modelStart = Date.now();
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
        },
        (toolName, progress) => {
          // 🎯 Stream tool progress event to frontend
          onToolProgress?.(toolName, progress);
        }
      );
      
      timings.model_inference = Date.now() - modelStart;

      const duration = Date.now() - startTime;

      // 📊 Use actual token usage from OpenAI API response
      let cost_usd = 0;
      if (result.usage) {
        // GPT-5 pricing: $0.0075 per 1K input tokens, $0.03 per 1K output tokens
        const inputCost = (result.usage.prompt_tokens / 1000) * 0.0075;
        const outputCost = (result.usage.completion_tokens / 1000) * 0.03;
        cost_usd = inputCost + outputCost;
        
        console.log(`[ModerateHandler] 💰 Cost breakdown: $${inputCost.toFixed(4)} input + $${outputCost.toFixed(4)} output = $${cost_usd.toFixed(4)} total`);
      } else {
        // Fallback to estimation if usage data not available
        const estimatedTokens = result.response.length / 4;
        cost_usd = (estimatedTokens / 1000) * 0.003;
        console.log(`[ModerateHandler] ⚠️  Using estimated cost (no usage data): $${cost_usd.toFixed(4)}`);
      }

      console.log(`[⏱️ ModerateHandler] MODERATE HANDLER TIMINGS:`, {
        query_enhancement: `${timings.query_enhancement}ms`,
        tool_selection: `${timings.tool_selection}ms`,
        model_inference: `${timings.model_inference}ms`,
        total: `${duration}ms`
      });

      return {
        content: result.response,
        mode: HybridMode.MODERATE,
        duration_ms: duration,
        tools_used: ['assistme_orchestrator'], // TODO: Track actual tools used
        cost_usd,
        metadata: {
          classification_confidence: 0.8
        }
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[ModerateHandler] Error:`, error);

      return {
        content: `Desculpe, ocorreu um erro ao processar a solicitação: ${error.message}`,
        mode: HybridMode.MODERATE,
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

export const moderateHandler = new ModerateHandler();
