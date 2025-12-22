/**
 * Quick Analyzer - Classification Engine for Hybrid Intelligence
 * 
 * Analyzes user queries and classifies them into one of 4 modes:
 * - TRIVIAL: FAQ matches, cache hits (<1s)
 * - SIMPLE: Single-tool operations (1-2s)
 * - MODERATE: Multi-tool operations (2-4s)
 * - COMPLEX: Full orchestration needed (4-8s)
 */

import type { ClassificationResult, HybridMode, FAQEntry } from '../types';
import { HybridMode as Mode } from '../types';
import faqsData from '../data/faqs.json';

export class QuickAnalyzer {
  private faqs: FAQEntry[];

  // Trivial patterns - FAQ-like questions
  private trivialPatterns = [
    /^(o que é|what is|que é|como funciona)/i,
    /^(quanto custa|preço|pricing|how much)/i,
    /^(quais? módulos?|available modules|what modules)/i,
    /^(help|ajuda|suporte|support)/i,
    /^(como (ativo|configuro)|how (do i|to) (activate|configure))/i,
  ];

  // Simple patterns - Single tool operations
  private simplePatterns = [
    // List operations
    /^(mostrar?|listar?|ver|show|list|display)\s+(minhas?|my|as)?\s*(fatura|invoice|cliente|customer|produto|product|encomenda|order)/i,
    
    // Count/Stats operations
    /^(quantas?|how many|count)\s+(fatura|invoice|cliente|customer|produto|product)/i,
    
    // Status checks
    /^(qual (o )?estado|what('s| is) the status|status)\s+(da|of|do)?\s*(fatura|invoice|encomenda|order)/i,
    
    // Simple gets
    /^(obter|get|buscar|fetch|retrieve)\s+/i,
    
    // Create simple entity
    /^(criar|create|adicionar|add|novo|new)\s+(uma?|a|an)?\s*(tarefa|task|nota|note)$/i,
  ];

  // Moderate patterns - Multi-tool operations
  private moderatePatterns = [
    // Complex creates with context
    /^(criar|create|preparar|prepare)\s+(uma?|a|an)?\s*(fatura|invoice|proposta|proposal|orçamento|quote)\s+para/i,
    
    // Analysis operations
    /^(analis[ae]r?|analy[sz]e|verificar|check|calcular|calculate)\s+/i,
    
    // Comparison operations
    /^(comparar|compare|diferença|difference)\s+/i,
    
    // Multi-entity operations  
    /^(sincronizar|synchroni[sz]e|importar|import|exportar|export)/i,
    
    // Workflow-related
    /^(processar|process|aprovar|approve|rejeitar|reject)\s+/i,
  ];

  // Complex patterns - Exploratory/vague queries
  private complexPatterns = [
    /^(como (posso|faço|devo)|how (can|do|should) i)\s+(melhorar|improve|otimi[sz]ar|optimi[sz]e|crescer|grow)/i,
    /^(preciso (de )?|i need|quero|i want)\s+(ajuda|help)\s+/i,
    /^(tens alguma|do you have any|há|is there)\s+(sugestão|suggestion|ideia|idea|recomendação|recommendation)/i,
    /(estratégia|strategy|plano|plan|roadmap)/i,
  ];

  constructor() {
    this.faqs = faqsData as FAQEntry[];
  }

  /**
   * Main classification method
   */
  async classify(query: string, context?: { cacheHit?: boolean }): Promise<ClassificationResult> {
    const normalized = query.trim().toLowerCase();
    const startTime = Date.now();

    // STEP 1: Check for cache hit (instant TRIVIAL)
    if (context?.cacheHit) {
      return {
        mode: Mode.TRIVIAL,
        confidence: 1.0,
        metadata: {
          matchedPattern: 'cache_hit',
          cacheHit: true,
          complexity: 0
        }
      };
    }

    // STEP 2: FIRST check for operational intent (verbs + entities = action request)
    // This MUST be checked before FAQs to avoid false matches
    const operationalIntent = this.detectOperationalIntent(normalized);
    if (operationalIntent) {
      const duration = Date.now() - startTime;
      console.log(`[QuickAnalyzer] Detected operational intent in ${duration}ms: ${operationalIntent.metadata?.detectedIntent}`);
      return operationalIntent;
    }

    // STEP 3: Only check FAQs for informational queries (no action verbs)
    const faqMatch = this.findFAQMatch(normalized);
    if (faqMatch) {
      return {
        mode: Mode.TRIVIAL,
        confidence: faqMatch.confidence,
        metadata: {
          matchedPattern: `faq:${faqMatch.faqId}`,
          detectedIntent: 'faq_answer',
          complexity: 5
        }
      };
    }

    // STEP 4: Pattern-based classification
    const patternResult = this.classifyByPatterns(normalized);
    if (patternResult) {
      return patternResult;
    }

    // STEP 5: Heuristic-based classification
    const heuristicResult = this.classifyByHeuristics(normalized);
    
    const duration = Date.now() - startTime;
    console.log(`[QuickAnalyzer] Classified in ${duration}ms: mode=${heuristicResult.mode}, confidence=${heuristicResult.confidence}`);
    
    return heuristicResult;
  }

  /**
   * Detect operational intent - user wants to DO something, not just ask about something
   * This prevents FAQ matching from intercepting action requests
   */
  private detectOperationalIntent(query: string): ClassificationResult | null {
    // Action verbs that indicate user wants to perform an operation
    const actionVerbs = [
      'adicionar', 'add', 'criar', 'create', 'registar', 'register',
      'atualizar', 'update', 'modificar', 'modify', 'alterar', 'change',
      'eliminar', 'delete', 'remover', 'remove', 'apagar',
      'enviar', 'send', 'emitir', 'emit', 'gerar', 'generate',
      'processar', 'process', 'aprovar', 'approve', 'rejeitar', 'reject',
      'importar', 'import', 'exportar', 'export', 'sincronizar', 'sync',
      'pagar', 'pay', 'receber', 'receive', 'faturar', 'invoice',
      'agendar', 'schedule', 'marcar', 'book', 'reservar', 'reserve'
    ];

    // Business entities
    const businessEntities = [
      'fatura', 'invoice', 'faturas', 'invoices',
      'cliente', 'client', 'clientes', 'clients', 'customer', 'customers',
      'produto', 'product', 'produtos', 'products', 'artigo', 'item',
      'encomenda', 'order', 'pedido', 'encomendas', 'orders',
      'pagamento', 'payment', 'pagamentos', 'payments',
      'fornecedor', 'supplier', 'fornecedores', 'suppliers',
      'proposta', 'proposal', 'orçamento', 'quote', 'cotação',
      'stock', 'inventário', 'inventory', 'material', 'materiais',
      'projeto', 'project', 'tarefa', 'task', 'evento', 'event',
      'lead', 'leads', 'contacto', 'contact', 'campanha', 'campaign'
    ];

    // Check if query contains action verb + business entity
    const hasActionVerb = actionVerbs.some(verb => 
      new RegExp(`\\b${verb}\\b`, 'i').test(query)
    );

    const detectedEntities = businessEntities.filter(entity => 
      new RegExp(`\\b${entity}\\b`, 'i').test(query)
    );

    // If has action verb AND business entity = operational intent, escalate to SIMPLE/MODERATE
    if (hasActionVerb && detectedEntities.length > 0) {
      const tools = this.extractLikelyTools(query);
      
      // Multiple entities or complex verbs = MODERATE
      const isModerate = detectedEntities.length > 1 || 
        /processar|aprovar|sincronizar|importar|exportar|gerar|emitir/i.test(query);
      
      return {
        mode: isModerate ? Mode.MODERATE : Mode.SIMPLE,
        confidence: 0.9,
        metadata: {
          matchedPattern: 'operational_intent',
          requiredTools: tools,
          detectedIntent: `action:${detectedEntities[0]}`,
          complexity: isModerate ? 50 : 30
        }
      };
    }

    // "Posso" + verb = user asking if they CAN do something = still operational
    if (/\bposso\b/i.test(query) && detectedEntities.length > 0) {
      const tools = this.extractLikelyTools(query);
      return {
        mode: Mode.SIMPLE,
        confidence: 0.85,
        metadata: {
          matchedPattern: 'capability_question',
          requiredTools: tools,
          detectedIntent: `can_do:${detectedEntities[0]}`,
          complexity: 35
        }
      };
    }

    // "Como" + entity = how-to question about business process
    if (/\bcomo\b/i.test(query) && detectedEntities.length > 0 && query.length > 20) {
      const tools = this.extractLikelyTools(query);
      return {
        mode: Mode.SIMPLE,
        confidence: 0.8,
        metadata: {
          matchedPattern: 'howto_question',
          requiredTools: tools,
          detectedIntent: `howto:${detectedEntities[0]}`,
          complexity: 40
        }
      };
    }

    return null;
  }

  /**
   * Find matching FAQ entry
   */
  private findFAQMatch(query: string): { faqId: string; confidence: number } | null {
    for (const faq of this.faqs) {
      for (const pattern of faq.patterns) {
        const similarity = this.calculateSimilarity(query, pattern.toLowerCase());
        
        if (similarity >= (faq.confidence_threshold || 0.7)) {
          return {
            faqId: faq.id,
            confidence: similarity
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Pattern-based classification
   */
  private classifyByPatterns(query: string): ClassificationResult | null {
    // Check TRIVIAL patterns
    for (const pattern of this.trivialPatterns) {
      if (pattern.test(query)) {
        return {
          mode: Mode.TRIVIAL,
          confidence: 0.9,
          metadata: {
            matchedPattern: pattern.source,
            detectedIntent: 'trivial_pattern',
            complexity: 10
          }
        };
      }
    }

    // Check SIMPLE patterns
    for (const pattern of this.simplePatterns) {
      if (pattern.test(query)) {
        const tools = this.extractLikelyTools(query);
        return {
          mode: Mode.SIMPLE,
          confidence: 0.85,
          metadata: {
            matchedPattern: pattern.source,
            requiredTools: tools,
            detectedIntent: 'simple_operation',
            complexity: 25
          }
        };
      }
    }

    // Check MODERATE patterns
    for (const pattern of this.moderatePatterns) {
      if (pattern.test(query)) {
        const tools = this.extractLikelyTools(query);
        return {
          mode: Mode.MODERATE,
          confidence: 0.8,
          metadata: {
            matchedPattern: pattern.source,
            requiredTools: tools,
            detectedIntent: 'moderate_operation',
            complexity: 50
          }
        };
      }
    }

    // Check COMPLEX patterns
    for (const pattern of this.complexPatterns) {
      if (pattern.test(query)) {
        return {
          mode: Mode.COMPLEX,
          confidence: 0.75,
          metadata: {
            matchedPattern: pattern.source,
            detectedIntent: 'complex_exploration',
            complexity: 85
          }
        };
      }
    }

    return null;
  }

  /**
   * Heuristic-based classification (fallback)
   */
  private classifyByHeuristics(query: string): ClassificationResult {
    const metrics = {
      length: query.length,
      wordCount: query.split(/\s+/).length,
      hasMultipleEntities: this.countEntities(query) > 1,
      hasMultipleVerbs: this.countVerbs(query) > 1,
      hasUncertainty: /talvez|maybe|não sei|not sure|possivelmente|possibly/i.test(query),
      isQuestion: /\?$/.test(query) || /^(como|what|how|quando|when|porque|why)/i.test(query),
    };

    // Calculate complexity score (0-100)
    let complexity = 0;
    
    complexity += Math.min(metrics.wordCount * 2, 30);  // Max 30 points for length
    complexity += metrics.hasMultipleEntities ? 20 : 0;
    complexity += metrics.hasMultipleVerbs ? 15 : 0;
    complexity += metrics.hasUncertainty ? 25 : 0;
    complexity += metrics.isQuestion && metrics.wordCount < 5 ? -10 : 0; // Short questions are simpler

    // Classify based on complexity
    let mode: HybridMode;
    let confidence: number;

    if (complexity < 20) {
      mode = Mode.TRIVIAL;
      confidence = 0.7;
    } else if (complexity < 40) {
      mode = Mode.SIMPLE;
      confidence = 0.65;
    } else if (complexity < 70) {
      mode = Mode.MODERATE;
      confidence = 0.6;
    } else {
      mode = Mode.COMPLEX;
      confidence = 0.55;
    }

    return {
      mode,
      confidence,
      metadata: {
        matchedPattern: 'heuristic',
        complexity,
        detectedIntent: 'heuristic_classification'
      }
    };
  }

  /**
   * Extract likely tools needed for the query
   */
  private extractLikelyTools(query: string): string[] {
    const tools: string[] = [];
    const lower = query.toLowerCase();

    // Entity-based tool mapping
    if (/(fatura|invoice)/i.test(query)) tools.push('list_invoices', 'get_invoice');
    if (/(cliente|customer)/i.test(query)) tools.push('list_clients', 'get_client');
    if (/(produto|product)/i.test(query)) tools.push('list_products', 'get_product');
    if (/(encomenda|order|pedido)/i.test(query)) tools.push('list_orders', 'get_order');
    if (/(tarefa|task)/i.test(query)) tools.push('list_tasks', 'create_task');
    if (/(pagamento|payment)/i.test(query)) tools.push('list_payments', 'create_payment');
    if (/(fornecedor|supplier)/i.test(query)) tools.push('list_suppliers', 'get_supplier');

    // Action-based tool mapping
    if (/criar|create|adicionar|add/i.test(query)) {
      if (tools.length === 0) tools.push('create_record');
    }
    if (/listar|list|mostrar|show/i.test(query)) {
      if (tools.length === 0) tools.push('list_records');
    }
    if (/analisar|analyze|calcular|calculate/i.test(query)) {
      tools.push('analyze_data', 'calculate_metrics');
    }

    return Array.from(new Set(tools)).slice(0, 3); // Max 3 tool predictions
  }

  /**
   * Count entities mentioned in query (invoices, clients, products, etc.)
   */
  private countEntities(query: string): number {
    const entities = [
      'fatura', 'invoice',
      'cliente', 'customer', 'client',
      'produto', 'product',
      'encomenda', 'order', 'pedido',
      'fornecedor', 'supplier',
      'pagamento', 'payment',
      'tarefa', 'task'
    ];

    return entities.filter(entity => 
      new RegExp(`\\b${entity}s?\\b`, 'i').test(query)
    ).length;
  }

  /**
   * Count action verbs in query
   */
  private countVerbs(query: string): number {
    const verbs = [
      'criar', 'create', 'adicionar', 'add',
      'listar', 'list', 'mostrar', 'show',
      'atualizar', 'update', 'modificar', 'modify',
      'eliminar', 'delete', 'remover', 'remove',
      'analisar', 'analyze', 'calcular', 'calculate',
      'processar', 'process', 'aprovar', 'approve',
      'enviar', 'send', 'exportar', 'export'
    ];

    return verbs.filter(verb => 
      new RegExp(`\\b${verb}`, 'i').test(query)
    ).length;
  }

  /**
   * Calculate similarity between two strings
   * More conservative matching to avoid false positives
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const query = str1;
    const pattern = str2;

    if (query.length === 0 || pattern.length === 0) return 0;

    // Exact match
    if (query === pattern) return 1.0;

    // Query starts with pattern (most likely asking about this topic)
    if (query.startsWith(pattern + ' ') || query.startsWith(pattern + '?')) return 0.95;

    // Multi-word patterns: require full phrase match as distinct words
    const patternWords = pattern.split(/\s+/);
    if (patternWords.length >= 2) {
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const phraseRegex = new RegExp(`\\b${escapedPattern}\\b`, 'i');
      if (phraseRegex.test(query)) return 0.85;
    }

    // Single word patterns: ONLY match if query is short (FAQ-like question)
    // This prevents matching "preço" in long operational queries
    if (patternWords.length === 1 && query.length < 40) {
      const escapedWord = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
      if (wordRegex.test(query)) {
        // Penalize based on how much longer the query is
        const lengthRatio = pattern.length / query.length;
        return Math.max(0.5, lengthRatio * 0.9);
      }
    }

    // Levenshtein distance for very similar strings
    const distance = this.levenshteinDistance(query, pattern);
    const maxLen = Math.max(query.length, pattern.length);
    const similarity = (maxLen - distance) / maxLen;

    // Only return if very similar
    return similarity > 0.8 ? similarity : 0;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

export const quickAnalyzer = new QuickAnalyzer();
