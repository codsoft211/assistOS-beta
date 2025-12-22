import { ToolBase, toolRegistry } from '../../../tools/kernel';
import { toolEmbeddingService } from '../../../services/tool-embedding.service';

/**
 * Smart tool selector - Hybrid AI-powered semantic + keyword-based filtering
 * 
 * Strategy:
 * 1. Quick keyword detection (0ms, synchronous)
 * 2. AI semantic search (50-100ms, async, accurate)
 * 3. Merge + rank by: similarity × log(popularity + 1)
 * 4. Return 5-15 tools max
 * 
 * Performance: Reduces 153 tools → 5-15 tools (97% reduction)
 */
export class SmartToolSelector {
  /**
   * Select only relevant tools based on query context (TRUE HYBRID ALGORITHM)
   * 
   * Merges keyword + semantic signals, ranks by similarity × popularity
   * 
   * @param query User's natural language query
   * @param useSemanticSearch Whether to use AI semantic search (default: auto-detect)
   * @returns Array of relevant tools (5-15 max)
   */
  static async selectRelevantTools(
    query: string,
    useSemanticSearch: boolean | 'auto' = 'auto'
  ): Promise<ToolBase[]> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    
    // ⏱️ PHASE 1: Collect keyword matches (synchronous, ~0ms)
    const keywordStart = Date.now();
    const categories = this.detectCategories(query);
    const keywordCandidates = new Map<string, { tool: ToolBase; score: number }>();
    
    if (categories.length > 0) {
      for (const category of categories) {
        const categoryTools = toolRegistry.getByCategory(category);
        for (const tool of categoryTools) {
          // Keyword match gets base score of 0.80 (good but not perfect)
          keywordCandidates.set(tool.manifest.name, { tool, score: 0.80 });
        }
      }
    }
    timings.keyword_matching = Date.now() - keywordStart;
    
    // ⏱️ PHASE 2: Collect semantic matches (async, ~50-100ms)
    const semanticStart = Date.now();
    const shouldUseSemanticSearch = 
      useSemanticSearch === true ||
      (useSemanticSearch === 'auto' && await toolEmbeddingService.isInitialized());
    
    const semanticCandidates = new Map<string, { tool: ToolBase; score: number }>();
    
    if (shouldUseSemanticSearch) {
      try {
        const semanticMatches = await toolEmbeddingService.findSimilarTools(
          query,
          30, // Get more candidates to merge with keywords
          0.65, // Lower threshold to include more candidates
          true  // Boost by popularity
        );
        
        for (const match of semanticMatches) {
          const tool = toolRegistry.get(match.toolName);
          if (tool) {
            // Use finalScore (already includes popularity boost)
            semanticCandidates.set(match.toolName, { 
              tool, 
              score: match.finalScore 
            });
          }
        }
      } catch (error) {
        console.error('[SmartToolSelector] Semantic search failed:', error);
      }
    }
    timings.semantic_search = Date.now() - semanticStart;
    
    // ⏱️ PHASE 3: Merge candidates (union of both sets)
    const mergeStart = Date.now();
    const mergedCandidates = new Map<string, { tool: ToolBase; score: number }>();
    
    // Add keyword candidates
    for (const [name, data] of Array.from(keywordCandidates.entries())) {
      mergedCandidates.set(name, data);
    }
    
    // Add or boost with semantic candidates
    for (const [name, data] of Array.from(semanticCandidates.entries())) {
      const existing = mergedCandidates.get(name);
      if (existing) {
        // Tool matched BOTH keyword AND semantic - boost score
        mergedCandidates.set(name, {
          tool: data.tool,
          score: Math.max(existing.score, data.score) * 1.2 // 20% bonus for dual match
        });
      } else {
        // Semantic-only match
        mergedCandidates.set(name, data);
      }
    }
    timings.merge_and_rank = Date.now() - mergeStart;
    
    // ⏱️ PHASE 4: Rank and limit to 5-15 tools
    const rankStart = Date.now();
    const rankedTools = Array.from(mergedCandidates.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(item => item.tool);
    timings.ranking = Date.now() - rankStart;
    
    const duration = Date.now() - startTime;
    
    // PHASE 5: Fallback if no matches
    if (rankedTools.length === 0) {
      console.log(`[⏱️ SmartToolSelector] No matches, returning discovery tools (${duration}ms)`);
      return this.getTopTools(10);
    }
    
    console.log(
      `[⏱️ SmartToolSelector] Hybrid: ${rankedTools.length} tools in ${duration}ms ` +
      `(keyword: ${keywordCandidates.size}, semantic: ${semanticCandidates.size}, merged: ${mergedCandidates.size})`
    );
    
    console.log(`[⏱️ SmartToolSelector] TOOL SELECTION TIMINGS:`, {
      keyword_matching: `${timings.keyword_matching}ms`,
      semantic_search: `${timings.semantic_search}ms`,
      merge_and_rank: `${timings.merge_and_rank}ms`,
      ranking: `${timings.ranking}ms`,
      total: `${duration}ms`
    });
    
    return rankedTools;
  }
  
  /**
   * LEGACY: Synchronous version for backward compatibility
   * Use selectRelevantTools() instead for hybrid AI selection
   */
  static selectRelevantToolsSync(query: string): ToolBase[] {
    const categories = this.detectCategories(query);
    
    if (categories.length > 0) {
      const tools: ToolBase[] = [];
      const addedTools = new Set<string>();
      
      for (const category of categories) {
        const categoryTools = toolRegistry.getByCategory(category);
        for (const tool of categoryTools) {
          if (!addedTools.has(tool.manifest.name)) {
            tools.push(tool);
            addedTools.add(tool.manifest.name);
          }
          if (tools.length >= 15) break;
        }
        if (tools.length >= 15) break;
      }
      
      console.log(`[SmartToolSelector] LEGACY sync: ${tools.length} tools from ${categories.join(', ')}`);
      return tools;
    }
    
    return this.getTopTools(10);
  }
  
  /**
   * Detect relevant categories from query using keyword matching
   */
  private static detectCategories(query: string): string[] {
    const categories: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Sales keywords
    if (/(^|[\s,.])(leads?|comercial|vendas?|sales|pipeline|orçamentos?|quotes?|propostas?|proposals?|clientes? potenciais?)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('sales');
    }
    
    // Marketing keywords
    if (/(^|[\s,.])(marketing|campanhas?|campaigns?|angariação|angariacao|fontes?|sources?|conversão|conversao|conversões|conversoes|conversion|funil|funnels?|roi|leads? qualificados?)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('marketing');
    }
    
    // Accounting keywords
    if (/(^|[\s,.])(contabilidade|lançamentos?|lancamentos?|reconciliação|reconciliacao|reconciliações|reconciliacoes|diário|diario|journals?|accounting|contas?|accounts?|fiscal|balanço|balanco|balanços|balancos|balance|fecho)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('accounting');
    }
    
    // Logistics keywords
    if (/(^|[\s,.])(stocks?|armazéns?|armazens?|warehouses?|inventário|inventario|inventários|inventarios|inventory|transferências?|transferencias?|transfers?|picking|receção|recepção|rececao|recepcao|recepções|recepcões|rececoes|recepcoes|goods|avaliação|avaliacao|avaliações|avaliacoes|valuation)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('logistics');
    }
    
    // Purchasing keywords
    if (/(^|[\s,.])(compras?|fornecedores?|suppliers?|requisição|requisicao|requisições|requisicoes|requisitions?|po|purchase|orders?|invoices?|faturas?|rfq|cotação|cotacao|cotações|cotacoes|quotes?)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('purchasing');
    }
    
    // CRM (cross-category)
    if (/\b(crm|customers?|clients?|contactos?|contacts?)\b/i.test(lowerQuery)) {
      categories.push('crm');
    }
    
    // Financial (cross-category)
    if (/\b(financial|financeiro|payments?|pagamentos?|invoices?|faturas?)\b/i.test(lowerQuery)) {
      categories.push('financial');
    }
    
    // HR keywords
    if (/(^|[\s,.])(hr|rh|recursos humanos|human resources|empregados?|employees?|colaboradores?|férias|ferias|vacation|vacations|ausências?|ausencias?|absences?|recrutamento|recruitment|candidatos?|candidates?|formação|formacao|formações|formacoes|training|folha de pagamento|payroll|avaliações? desempenho|avaliacoes? desempenho|performance reviews?)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('hr');
    }
    
    // Projects keywords
    if (/(^|[\s,.])(projetos?|projects?|tarefas?|tasks?|milestones?|marcos?|gantt|orçamentos? projeto|orcamentos? projeto|budget variance|recursos?|resources?|entregas?|deliverables?|templates?)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('projects');
    }
    
    // Support keywords
    if (/(^|[\s,.])(suporte|support|tickets?|sla|incidentes?|incidents?|conhecimento|knowledge|ajuda|help)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('support');
    }
    
    // Quality keywords
    if (/(^|[\s,.])(qualidade|quality|auditorias?|audits?|não conformidades?|nao conformidades?|non-conformances?|ações? corretivas?|acoes? corretivas?|corrective actions?)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('quality');
    }
    
    // Document Analysis / OCR keywords (enhanced with invoice-specific terms)
    if (/(^|[\s,.])(documento|documentos?|documentação|documentacao|image|imagens?|foto|fotos?|anexo|anexos?|digitalizar|scan|ocr|ler|analisar|análise|analise|extrair|extraction|fatura|faturas?|invoice|recibo|recibos?|receipt|nota de crédito|credit note|esta fatura|este documento|este anexo)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('document_analysis');
    }
    
    // Communication keywords (WhatsApp, SMS, Email)
    if (/(^|[\s,.])(whatsapp|wpp|zap|sms|email|e-mail|enviar mensagem|send message|mensagem|message|template|conversa|conversation|contactar|contact|notificar|notify|lembrete|reminder)($|[\s,.])/i.test(lowerQuery)) {
      categories.push('communication');
    }
    
    return categories;
  }
  
  /**
   * Get top N most commonly used tools (fallback when no specific category)
   */
  private static getTopTools(limit: number): ToolBase[] {
    // For now, return first N tools from registry
    // TODO: Implement usage telemetry to track most-used tools
    const allManifests = toolRegistry.getAllManifests();
    const tools: ToolBase[] = [];
    
    for (let i = 0; i < Math.min(limit, allManifests.length); i++) {
      const tool = toolRegistry.get(allManifests[i].name);
      if (tool) {
        tools.push(tool);
      }
    }
    
    console.log(`[SmartToolSelector] No specific categories detected, returning top ${tools.length} tools`);
    return tools;
  }
  
  /**
   * Get ALL tools (bypass filtering) - use sparingly
   */
  static getAllTools(): ToolBase[] {
    const allManifests = toolRegistry.getAllManifests();
    const tools: ToolBase[] = [];
    
    for (const manifest of allManifests) {
      const tool = toolRegistry.get(manifest.name);
      if (tool) {
        tools.push(tool);
      }
    }
    
    console.log(`[SmartToolSelector] Returning ALL ${tools.length} tools (unfiltered)`);
    return tools;
  }
}
