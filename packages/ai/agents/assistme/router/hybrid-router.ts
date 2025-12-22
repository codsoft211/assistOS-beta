/**
 * Hybrid Router - Routes queries to appropriate handler
 * 
 * Responsibilities:
 * 1. Receive ClassificationResult from analyzer
 * 2. Select appropriate handler (trivial/simple/moderate/complex)
 * 3. Execute handler with proper context
 * 4. Apply throttling/rate limiting rules
 * 5. Handle fallbacks if handler fails
 */

import type { ClassificationResult, HybridResponse, HandlerOptions, HybridMode } from '../types';
import { HybridMode as Mode } from '../types';
import { trivialHandler } from '../handlers/trivial-handler';
import { simpleHandler } from '../handlers/simple-handler';
import { moderateHandler } from '../handlers/moderate-handler';
import { complexHandler } from '../handlers/complex-handler';
import { telemetry } from '../utils/telemetry';

export class HybridRouter {
  // Throttling limits per tenant (queries per minute)
  private readonly MODE_LIMITS = {
    [Mode.TRIVIAL]: 1000,    // Unlimited essentially
    [Mode.SIMPLE]: 100,      // 100 queries/min
    [Mode.MODERATE]: 30,     // 30 queries/min
    [Mode.COMPLEX]: 10       // 10 queries/min - expensive
  };

  // Track usage per tenant
  private usageTracker: Map<string, Map<HybridMode, number[]>> = new Map();

  /**
   * Route query to appropriate handler based on classification
   */
  async route(
    query: string,
    classification: ClassificationResult,
    options: HandlerOptions
  ): Promise<HybridResponse> {
    const { context } = options;
    const startTime = Date.now();

    console.log(`[HybridRouter] Routing to ${classification.mode} mode (confidence: ${classification.confidence})`);

    // STEP 1: Check throttling limits
    if (!this.checkThrottle(context.tenantId, classification.mode)) {
      console.warn(`[HybridRouter] Throttle limit exceeded for tenant ${context.tenantId}, mode ${classification.mode}`);
      
      // Fallback to a less expensive mode
      const fallbackMode = this.getFallbackMode(classification.mode);
      console.log(`[HybridRouter] Falling back to ${fallbackMode} mode`);
      
      classification = {
        ...classification,
        mode: fallbackMode
      };
    }

    // STEP 2: Track usage
    this.trackUsage(context.tenantId, classification.mode);

    // STEP 3: Execute handler
    try {
      let response: HybridResponse;

      switch (classification.mode) {
        case Mode.TRIVIAL:
          response = await trivialHandler.handle(query, options);
          break;

        case Mode.SIMPLE:
          response = await simpleHandler.handle(query, options);
          break;

        case Mode.MODERATE:
          response = await moderateHandler.handle(query, options);
          break;

        case Mode.COMPLEX:
          response = await complexHandler.handle(query, options);
          break;

        default:
          throw new Error(`Unknown mode: ${classification.mode}`);
      }

      // STEP 4: Check if we need to fallback to higher mode
      if (response.metadata?.error && classification.mode !== Mode.COMPLEX) {
        console.log(`[HybridRouter] Handler failed, attempting fallback...`);
        return await this.fallbackToHigherMode(query, classification, options);
      }

      // STEP 5: Log telemetry
      const duration = Date.now() - startTime;
      telemetry.logEvent({
        timestamp: new Date(),
        tenantId: context.tenantId,
        userId: context.userId,
        mode: classification.mode,
        duration_ms: duration,
        success: !response.metadata?.error,
        tools_used: response.tools_used,
        cost_usd: response.cost_usd,
        error: response.metadata?.error,
        query_length: query.length,
        classification_confidence: classification.confidence
      });

      return response;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[HybridRouter] Error in ${classification.mode} handler:`, error);

      // Log failure
      telemetry.logEvent({
        timestamp: new Date(),
        tenantId: context.tenantId,
        userId: context.userId,
        mode: classification.mode,
        duration_ms: duration,
        success: false,
        error: error.message,
        query_length: query.length,
        classification_confidence: classification.confidence
      });

      // Attempt fallback to higher mode
      if (classification.mode !== Mode.COMPLEX) {
        return await this.fallbackToHigherMode(query, classification, options);
      }

      // Final fallback - return error message
      return {
        content: `Desculpe, ocorreu um erro ao processar a sua solicitação: ${error.message}`,
        mode: classification.mode,
        duration_ms: duration,
        cost_usd: 0,
        metadata: {
          error: error.message,
          classification_confidence: classification.confidence
        }
      };
    }
  }

  /**
   * Fallback to higher (more capable) mode
   */
  private async fallbackToHigherMode(
    query: string,
    originalClassification: ClassificationResult,
    options: HandlerOptions
  ): Promise<HybridResponse> {
    const nextMode = this.getNextHigherMode(originalClassification.mode);

    if (!nextMode) {
      // Already at highest mode, can't fallback further
      return {
        content: `Não consegui processar a solicitação. Por favor, reformule a pergunta.`,
        mode: originalClassification.mode,
        duration_ms: 0,
        cost_usd: 0,
        metadata: {
          error: 'fallback_failed',
          fallback_from_mode: originalClassification.mode
        }
      };
    }

    console.log(`[HybridRouter] Falling back from ${originalClassification.mode} to ${nextMode}`);

    const newClassification: ClassificationResult = {
      ...originalClassification,
      mode: nextMode,
      confidence: originalClassification.confidence * 0.8 // Reduce confidence
    };

    // Recursive call with higher mode
    const response = await this.route(query, newClassification, options);

    // Mark that we fell back
    if (response.metadata) {
      response.metadata.fallback_from_mode = originalClassification.mode;
    }

    return response;
  }

  /**
   * Get next higher mode for fallback
   */
  private getNextHigherMode(currentMode: HybridMode): HybridMode | null {
    const hierarchy = [Mode.TRIVIAL, Mode.SIMPLE, Mode.MODERATE, Mode.COMPLEX];
    const currentIndex = hierarchy.indexOf(currentMode);

    if (currentIndex >= 0 && currentIndex < hierarchy.length - 1) {
      return hierarchy[currentIndex + 1];
    }

    return null;
  }

  /**
   * Get fallback mode when throttled (go to less expensive mode)
   */
  private getFallbackMode(mode: HybridMode): HybridMode {
    switch (mode) {
      case Mode.COMPLEX:
        return Mode.MODERATE;
      case Mode.MODERATE:
        return Mode.SIMPLE;
      case Mode.SIMPLE:
        return Mode.TRIVIAL;
      default:
        return Mode.TRIVIAL;
    }
  }

  /**
   * Check if tenant has exceeded throttle limit for given mode
   */
  private checkThrottle(tenantId: string, mode: HybridMode): boolean {
    const limit = this.MODE_LIMITS[mode];
    const usage = this.getRecentUsage(tenantId, mode);

    return usage < limit;
  }

  /**
   * Track usage for throttling
   */
  private trackUsage(tenantId: string, mode: HybridMode): void {
    if (!this.usageTracker.has(tenantId)) {
      this.usageTracker.set(tenantId, new Map());
    }

    const tenantUsage = this.usageTracker.get(tenantId)!;

    if (!tenantUsage.has(mode)) {
      tenantUsage.set(mode, []);
    }

    const timestamps = tenantUsage.get(mode)!;
    timestamps.push(Date.now());

    // Keep only last 60 seconds of timestamps
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const recentTimestamps = timestamps.filter(ts => ts > oneMinuteAgo);
    tenantUsage.set(mode, recentTimestamps);
  }

  /**
   * Get recent usage count (last 60 seconds)
   */
  private getRecentUsage(tenantId: string, mode: HybridMode): number {
    const tenantUsage = this.usageTracker.get(tenantId);

    if (!tenantUsage) {
      return 0;
    }

    const timestamps = tenantUsage.get(mode) || [];
    const oneMinuteAgo = Date.now() - 60 * 1000;

    return timestamps.filter(ts => ts > oneMinuteAgo).length;
  }

  /**
   * Get usage statistics for a tenant
   */
  getUsageStats(tenantId: string): Record<HybridMode, number> {
    return {
      [Mode.TRIVIAL]: this.getRecentUsage(tenantId, Mode.TRIVIAL),
      [Mode.SIMPLE]: this.getRecentUsage(tenantId, Mode.SIMPLE),
      [Mode.MODERATE]: this.getRecentUsage(tenantId, Mode.MODERATE),
      [Mode.COMPLEX]: this.getRecentUsage(tenantId, Mode.COMPLEX)
    };
  }
}

export const hybridRouter = new HybridRouter();
