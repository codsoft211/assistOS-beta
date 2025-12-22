/**
 * AssistME Hybrid Intelligence Orchestrator
 * 
 * Main entry point for the Hybrid Intelligence Engine.
 * 
 * Flow:
 * 1. User Query → Quick Analyzer (classify mode)
 * 2. Classification → Router (select handler)
 * 3. Handler → Execute and respond
 * 4. Log telemetry
 * 
 * Modes:
 * - TRIVIAL: 80% of queries, <1s, cache+FAQ, no LLM cost
 * - SIMPLE: 15% of queries, 1-2s, single tool, minimal LLM
 * - MODERATE: 4% of queries, 2-4s, multi-tool, lightweight LLM
 * - COMPLEX: 1% of queries, 4-8s, full orchestration
 */

import type { 
  HybridResponse, 
  TenantContext,
  HybridContext, 
  StreamCallbacks,
  HybridMode 
} from './types';
import { quickAnalyzer } from './classifier/quick-analyzer';
import { hybridRouter } from './router/hybrid-router';
import { cacheService } from '../common/cache';
import { telemetry } from './utils/telemetry';

export class HybridIntelligenceOrchestrator {
  /**
   * Process a user message with hybrid intelligence
   */
  async processMessage(
    userMessage: string,
    context: HybridContext,
    callbacks?: StreamCallbacks,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<HybridResponse> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    const { onProgress, onStageProgress, onStreamChunk, onToolStart, onToolProgress, onToolComplete, onToken, onComplete, onError } = callbacks || {};

    try {
      const hasAttachments = context.attachments && context.attachments.length > 0;
      const attachmentInfo = hasAttachments ? ` (${context.attachments!.length} anexo(s))` : '';
      
      console.log(`[HybridIntelligence] Processing message for tenant ${context.tenantId}: "${userMessage.substring(0, 50)}..."${attachmentInfo}`);

      // ⏱️ STEP 1: Check cache first (skip if attachments present, as they change context)
      const cacheStart = Date.now();
      if (!hasAttachments) {
        const cacheKey = cacheService.generateKey(context.tenantId, context.userId, userMessage);
        const cachedResponse = await cacheService.get(cacheKey);

        if (cachedResponse) {
          timings.cache_lookup = Date.now() - cacheStart;
          console.log(`[⏱️ HybridIntelligence] ✅ Cache hit! (${timings.cache_lookup}ms)`);
          onStageProgress?.('analyzing', '⚡ Resposta encontrada em cache!');
          
          const duration = Date.now() - startTime;
          
          onComplete?.();
          
          return {
            content: cachedResponse,
            mode: 'trivial' as HybridMode,
            duration_ms: duration,
            cached: true,
            cost_usd: 0
          };
        }
      }
      timings.cache_lookup = Date.now() - cacheStart;
      console.log(`[⏱️ HybridIntelligence] Cache lookup: ${timings.cache_lookup}ms (miss)`);

      // ⏱️ STEP 2: Classify query
      onStageProgress?.('analyzing', '🔍 A analisar pedido');
      
      const classifyStart = Date.now();
      const classification = await quickAnalyzer.classify(userMessage);
      timings.classification = Date.now() - classifyStart;
      
      console.log(
        `[⏱️ HybridIntelligence] Classification: mode=${classification.mode}, ` +
        `confidence=${classification.confidence.toFixed(2)}, ` +
        `complexity=${classification.metadata?.complexity || 0}${attachmentInfo} ` +
        `(${timings.classification}ms)`
      );

      // ✨ UX: Mostrar mensagem clara para o utilizador (SEM info técnica de confiança)
      if (hasAttachments) {
        onStageProgress?.('routing', '📄 A processar documento');
      } else {
        onStageProgress?.('routing', '🤖 A preparar resposta');
      }

      // ⏱️ STEP 3: Route to appropriate handler
      const routingStart = Date.now();
      const response = await hybridRouter.route(
        userMessage,
        classification,
        {
          context,
          onProgress,
          onStageProgress,
          onStreamChunk,
          onToolStart,
          onToolProgress,
          onToolComplete,
          onToken,
          onComplete,
          onError,
          conversationHistory,
          attachments: context.attachments
        }
      );
      
      timings.handler_execution = Date.now() - routingStart;

      // STEP 4: Add classification metadata to response
      if (!response.metadata) {
        response.metadata = {};
      }
      response.metadata.classification_confidence = classification.confidence;

      const totalDuration = Date.now() - startTime;
      
      console.log(
        `[⏱️ HybridIntelligence] ✅ Completed in ${totalDuration}ms | ` +
        `mode=${response.mode} | ` +
        `cost=$${(response.cost_usd || 0).toFixed(4)} | ` +
        `cached=${response.cached || false}`
      );
      
      console.log(`[⏱️ HybridIntelligence] ORCHESTRATOR TIMINGS:`, {
        cache_lookup: `${timings.cache_lookup}ms`,
        classification: `${timings.classification}ms`,
        handler_execution: `${timings.handler_execution}ms`,
        total: `${totalDuration}ms`
      });

      return response;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[HybridIntelligence] ❌ Error:', error);

      // Propagate error to callbacks
      onError?.(error instanceof Error ? error : new Error(String(error)));

      // Log error to telemetry
      telemetry.logEvent({
        timestamp: new Date(),
        tenantId: context.tenantId,
        userId: context.userId,
        mode: 'complex' as HybridMode, // Assume complex on error
        duration_ms: duration,
        success: false,
        error: error.message,
        query_length: userMessage.length,
        classification_confidence: 0
      });

      return {
        content: `Desculpe, ocorreu um erro ao processar a sua solicitação: ${error.message}\n\nPor favor, tente novamente ou reformule a pergunta.`,
        mode: 'complex' as HybridMode,
        duration_ms: duration,
        cost_usd: 0,
        metadata: {
          error: error.message
        }
      };
    }
  }

  /**
   * Get telemetry stats
   */
  getStats(options?: { tenantId?: string; since?: Date }): any {
    return telemetry.getStats(options);
  }

  /**
   * Generate telemetry report
   */
  generateReport(options?: { tenantId?: string; since?: Date }): string {
    return telemetry.generateReport(options);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return cacheService.getStats();
  }

  /**
   * Clear cache for a tenant
   */
  async clearCache(tenantId: string): Promise<number> {
    return await cacheService.invalidateTenant(tenantId);
  }
}

// Export singleton instance
export const hybridIntelligenceOrchestrator = new HybridIntelligenceOrchestrator();
