/**
 * Trivial Handler - Instant responses without LLM
 * 
 * Target: 80% of queries, <1s latency
 * 
 * Sources:
 * 1. Cache hits (previously answered questions)
 * 2. FAQ matches (static knowledge base)
 * 3. Simple template responses
 * 
 * NO LLM CALLS = Zero cost, instant response
 */

import type { HybridResponse, HandlerOptions, FAQEntry } from '../types';
import { HybridMode } from '../types';
import { cacheService } from '../../common/cache';
import faqsData from '../data/faqs.json';

export class TrivialHandler {
  private faqs: FAQEntry[];

  constructor() {
    this.faqs = faqsData as FAQEntry[];
  }

  /**
   * Handle trivial query with instant response
   */
  async handle(
    query: string,
    options: HandlerOptions
  ): Promise<HybridResponse> {
    const startTime = Date.now();
    const { context, onProgress, conversationHistory } = options;

    onProgress?.('⚡ Modo Trivial - Resposta instantânea\n');

    // STEP 1: Check cache
    const cacheKey = cacheService.generateKey(context.tenantId, context.userId, query);
    const cachedResponse = await cacheService.get(cacheKey);

    if (cachedResponse) {
      const duration = Date.now() - startTime;
      onProgress?.(`✅ Resposta encontrada em cache!\n`);

      return {
        content: cachedResponse,
        mode: HybridMode.TRIVIAL,
        duration_ms: duration,
        cached: true,
        cost_usd: 0,
        metadata: {
          classification_confidence: 1.0
        }
      };
    }

    // STEP 2: Check FAQ matches
    const faqMatch = this.findBestFAQMatch(query);

    if (faqMatch) {
      const duration = Date.now() - startTime;
      const response = this.formatFAQResponse(faqMatch);

      onProgress?.(`✅ FAQ encontrado: ${faqMatch.id}\n`);

      // Cache the response
      await cacheService.set(cacheKey, response, {
        mode: HybridMode.TRIVIAL,
        ttl: 3600, // 1 hour
        tenantId: context.tenantId
      });

      return {
        content: response,
        mode: HybridMode.TRIVIAL,
        duration_ms: duration,
        cached: false,
        cost_usd: 0,
        metadata: {
          classification_confidence: 0.9
        }
      };
    }

    // STEP 3: Template-based fallback for common patterns
    const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
    const templateResponse = this.tryTemplateResponse(query, isFirstMessage);

    if (templateResponse) {
      const duration = Date.now() - startTime;

      onProgress?.(`✅ Resposta via template\n`);

      // Cache template responses too
      await cacheService.set(cacheKey, templateResponse, {
        mode: HybridMode.TRIVIAL,
        ttl: 1800, // 30 minutes (shorter TTL for templates)
        tenantId: context.tenantId
      });

      return {
        content: templateResponse,
        mode: HybridMode.TRIVIAL,
        duration_ms: duration,
        cached: false,
        cost_usd: 0,
        metadata: {
          classification_confidence: 0.7
        }
      };
    }

    // STEP 4: No match - return helpful error
    const duration = Date.now() - startTime;
    const fallbackResponse = `Desculpe, não encontrei uma resposta rápida para essa pergunta.

Vou processar com mais detalhe usando o assistente completo...`;

    onProgress?.(fallbackResponse + '\n');

    return {
      content: fallbackResponse,
      mode: HybridMode.TRIVIAL,
      duration_ms: duration,
      cached: false,
      cost_usd: 0,
      metadata: {
        classification_confidence: 0,
        error: 'no_trivial_match'
      }
    };
  }

  /**
   * Find best matching FAQ entry
   */
  private findBestFAQMatch(query: string): FAQEntry | null {
    const normalized = query.trim().toLowerCase();
    let bestMatch: { faq: FAQEntry; score: number } | null = null;

    for (const faq of this.faqs) {
      for (const pattern of faq.patterns) {
        const score = this.calculateMatchScore(normalized, pattern.toLowerCase());

        if (score >= (faq.confidence_threshold || 0.7)) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { faq, score };
          }
        }
      }
    }

    return bestMatch?.faq || null;
  }

  /**
   * Calculate match score between query and pattern
   * More conservative matching to avoid false positives
   */
  private calculateMatchScore(query: string, pattern: string): number {
    // Exact match
    if (query === pattern) return 1.0;

    // Query starts with pattern (user is asking directly about this topic)
    if (query.startsWith(pattern)) return 0.95;

    // Full pattern match as a distinct phrase (with word boundaries)
    const patternRegex = new RegExp(`\\b${this.escapeRegex(pattern)}\\b`, 'i');
    if (patternRegex.test(query) && pattern.split(/\s+/).length >= 2) {
      return 0.85;
    }

    // Word overlap - but require higher overlap ratio
    const queryWords = query.split(/\s+/).filter(w => w.length > 2);
    const patternWords = pattern.split(/\s+/).filter(w => w.length > 2);
    const overlap = queryWords.filter(word => patternWords.includes(word)).length;
    
    // Need at least 50% of pattern words to match
    const patternMatchRatio = overlap / patternWords.length;
    if (patternMatchRatio >= 0.5 && overlap >= 2) {
      return 0.5 + (patternMatchRatio * 0.3);
    }

    // Single word matches are too risky - avoid false positives
    return 0;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Format FAQ response with helpful metadata
   */
  private formatFAQResponse(faq: FAQEntry): string {
    let response = faq.answer;

    // Add helpful footer for certain categories
    if (faq.category === 'modules' || faq.category === 'configuration') {
      response += `\n\n💡 **Quer configurar algum módulo agora?** Basta pedir!`;
    }

    if (faq.category === 'integrations') {
      response += `\n\n🔌 **Quer configurar uma integração?** Diga qual precisa!`;
    }

    return response;
  }

  /**
   * Try to generate response using templates
   */
  private tryTemplateResponse(query: string, isFirstMessage: boolean): string | null {
    const lower = query.toLowerCase();

    // Greeting templates
    if (/^(ol[aá]|hi|hello|bom dia|boa tarde|boa noite)/i.test(query)) {
      // Only introduce on first message
      if (isFirstMessage) {
        return `Olá! Como posso ajudar?`;
      }
      // On subsequent greetings, just respond naturally
      return `Olá! Em que posso ajudar?`;
    }

    // Thank you templates
    if (/^(obrigad[oa]|thanks?|thank you)/i.test(query)) {
      return `De nada! 😊 Sempre às ordens!

Precisa de mais alguma coisa?`;
    }

    // Status check templates
    if (/^(tudo bem|how are you|como est[aá]s?)/i.test(query)) {
      return `Estou ótimo, obrigado! 🚀 Pronto para ajudar!

O que posso fazer por si?`;
    }

    return null;
  }
}

export const trivialHandler = new TrivialHandler();
