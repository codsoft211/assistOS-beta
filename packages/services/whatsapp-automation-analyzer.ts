/**
 * WhatsApp Automation Analyzer Service
 * 
 * Analyzes incoming WhatsApp messages to determine if they should trigger
 * AssistME automation based on configured client numbers and message content.
 */

import { db } from "../../apps/api/db";
import { whatsappAutomationClients } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { whatsappClassifier, MessageCategory } from "../../apps/api/services/whatsapp-message-classifier.service";
import { withDbRetry } from "../../apps/shared/utils/db-retry";

export interface AutomationAnalysisResult {
  shouldTrigger: boolean;
  isConfiguredClient: boolean;
  isOrderRelated: boolean;
  category: MessageCategory;
  confidence: number;
  reasoning: string;
  clientInfo?: {
    id: string;
    name: string | null;
    phoneNumber: string;
    requiresApproval: boolean;
  };
  suggestedResponse?: string;
  contextUsed?: {
    checkedProducts: boolean;
    checkedInventory: boolean;
    checkedPricing: boolean;
    checkedClientHistory: boolean;
    toolsUsed: string[];
  };
}

export class WhatsAppAutomationAnalyzer {
  constructor() {
    // No initialization needed - we'll use AssistME orchestrator dynamically
  }

  /**
   * Analyzes an incoming WhatsApp message to determine if it should trigger automation
   */
  async analyzeMessage(
    tenantId: string,
    phoneNumber: string,
    messageText: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    contactName?: string,
  ): Promise<AutomationAnalysisResult> {
    try {
      // Step 1: Check if sender is a configured automation client
      const client = await withDbRetry(async () => {
        return await db.query.whatsappAutomationClients.findFirst({
          where: and(
            eq(whatsappAutomationClients.tenantId, tenantId),
            eq(whatsappAutomationClients.phoneNumber, phoneNumber),
            eq(whatsappAutomationClients.isActive, true),
          ),
        });
      });

      // If not a configured client, no automation
      if (!client) {
        return {
          shouldTrigger: false,
          isConfiguredClient: false,
          isOrderRelated: false,
          category: "other",
          confidence: 0,
          reasoning: "Sender is not a configured automation client",
        };
      }

      // Step 2: Classify the message using the existing classifier
      const classification = await whatsappClassifier.classifyMessage(messageText);

      // Step 3: Check if this is a follow-up response to a previous question
      const isFollowUpResponse = this.detectFollowUpResponse(conversationHistory, messageText);

      // Step 4: Determine if it's order-related
      // We consider "order" and "info_request" categories as order-related
      // OR if it's a follow-up response to a question we asked
      const isOrderRelated = 
        classification.category === "order" || 
        (classification.category === "info_request" && classification.confidence > 0.7) ||
        isFollowUpResponse;

      // Step 5: Generate suggested response if order-related
      let suggestedResponse: string | undefined;
      let contextUsed: AutomationAnalysisResult['contextUsed'] | undefined;
      
      if (isOrderRelated && client.requiresApproval) {
        const responseResult = await this.generateSuggestedResponse(
          tenantId,
          phoneNumber,
          messageText,
          classification,
          conversationHistory,
        );
        suggestedResponse = responseResult.response;
        contextUsed = responseResult.contextUsed;
      }

      return {
        shouldTrigger: isOrderRelated && client.requiresApproval,
        isConfiguredClient: true,
        isOrderRelated,
        category: classification.category,
        confidence: classification.confidence,
        reasoning: classification.context.reasoning || "Message analyzed successfully",
        clientInfo: {
          id: client.id,
          // Priority: 1) Automation client name (from CRM), 2) WhatsApp contact name, 3) null
          name: client.name || (contactName && contactName !== phoneNumber ? contactName : null),
          phoneNumber: client.phoneNumber,
          requiresApproval: client.requiresApproval,
        },
        suggestedResponse,
        contextUsed,
      };
    } catch (error) {
      console.error("[WhatsApp Automation] Error analyzing message:", error);
      
      return {
        shouldTrigger: false,
        isConfiguredClient: false,
        isOrderRelated: false,
        category: "other",
        confidence: 0,
        reasoning: `Analysis error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Generates a context-aware suggested response using AssistME's full orchestrator
   */
  private async generateSuggestedResponse(
    tenantId: string,
    clientPhone: string,
    messageText: string,
    classification: any,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ response: string; contextUsed: AutomationAnalysisResult['contextUsed'] }> {
    try {
      console.log(`[WhatsApp Automation] Generating context-aware response using AssistME orchestrator`);
      
      // Get a real user ID from the tenant (use first admin user)
      // user_tenants is now in tenant_{tenantId} schema, not public schema
      const tenantSchema = `tenant_${tenantId.replace(/-/g, '_')}`;
      
      console.log(`[WhatsApp Automation] Querying user_tenants from tenant schema: ${tenantSchema}`);
      
      const tenantUser = await withDbRetry(async () => {
        try {
          // Use raw SQL to query from tenant schema
          const result = await db.execute(sql`
            SELECT user_id, tenant_id, role, environment
            FROM ${sql.raw(`"${tenantSchema}"."user_tenants"`)}
            WHERE tenant_id = ${tenantId}
            LIMIT 1
          `);
          console.log(`[WhatsApp Automation] Query result:`, result.rows.length > 0 ? 'found' : 'not found');
          return result.rows[0] || null;
        } catch (error: any) {
          console.error(`[WhatsApp Automation] Error querying user_tenants from tenant schema:`, error.message);
          // Fallback: try querying from public schema (for backwards compatibility)
          try {
            const { userTenants } = await import('../../shared/schema');
            const { eq: eqOp } = await import('drizzle-orm');
            return await db.query.userTenants.findFirst({
              where: eqOp(userTenants.tenantId, tenantId),
            });
          } catch (fallbackError) {
            console.error(`[WhatsApp Automation] Fallback query also failed:`, fallbackError);
            return null;
          }
        }
      });
      
      console.log(`[WhatsApp Automation] tenantUser query result:`, tenantUser ? 'found' : 'not found');
      console.log(`[WhatsApp Automation] tenantUser?.user_id:`, tenantUser?.userId);
      
      // Ensure userId is always a string (handle both snake_case from SQL and camelCase from ORM)
      const rawUserId = (tenantUser as any)?.user_id || (tenantUser as any)?.userId;
      const systemUserId = typeof rawUserId === 'string' && rawUserId.trim() !== '' 
                          ? rawUserId 
                          : 'system';
      
      // Import AssistME orchestrator and tool registry
      const { assistMEOrchestrator } = await import('../../packages/ai/agents/assistme/assistme-orchestrator');
      const { toolRegistry } = await import('../../packages/ai/tools/kernel');
      
      // Build context-aware prompt for AssistME
      const assistMEPrompt = `CONTEXTO: Estás a gerar uma resposta automática para WhatsApp.

Um cliente WhatsApp (+${clientPhone}) enviou esta mensagem:
"${messageText}"

Categoria detectada: ${classification.category}
Análise: ${classification.context.reasoning}
Confiança: ${(classification.confidence * 100).toFixed(0)}%

🚨 REGRA CRÍTICA - USO INTELIGENTE DE FERRAMENTAS:
ANTES de responder, TENS QUE usar as ferramentas disponíveis para obter dados reais.
❌ NUNCA respondas com "vou verificar" ou "vou consultar" - USA AS FERRAMENTAS AGORA!
❌ NUNCA respondas sem PRIMEIRO consultar o sistema usando as ferramentas
✅ SEMPRE usa ferramentas para obter informação específica e concreta
✅ USA APENAS as ferramentas necessárias para o tipo de pergunta

📊 CLASSIFICAÇÃO DE PERGUNTAS E FERRAMENTAS CORRETAS:

1️⃣ PERGUNTAS DE PREÇO/INFORMAÇÃO (ex: "quanto custa?", "qual o preço?", "informação sobre produto X"):
   → USA: list_products (com search para encontrar o produto)
   → COMPORTAMENTO: Mostra preço SEMPRE, mesmo se stock = 0
   → RESPOSTA: "Produto X custa €25/unidade. Atualmente sem stock, nova remessa em [data]."
   ❌ NÃO USES: check_stock, list_stock_items (desnecessário para perguntas de preço)

2️⃣ PERGUNTAS DE DISPONIBILIDADE (ex: "está disponível?", "tem em stock?", "posso encomendar?"):
   → PRIMEIRO: check_stock (para produto específico) OU list_stock_items (para listar vários)
   → SE stock = 0: DEPOIS usa list_products (para procurar similares COM stock > 0)
   → COMPORTAMENTO: Só oferece produtos disponíveis (stock > 0)
   → RESPOSTA: "Produto X sem stock. Alternativa: Produto Y disponível (€20, 15 unidades)."

3️⃣ PERGUNTAS MISTAS (ex: "preço e disponibilidade?", "quanto custa e têm?"):
   → USA: list_products primeiro (informação completa)
   → DEPOIS: check_stock (se necessário validar stock específico)
   → COMPORTAMENTO: Mostra preço + indica se está disponível
   → RESPOSTA: "Produto X: €25/unidade, 45 unidades em stock. Posso registar pedido?"

4️⃣ PERGUNTAS GERAIS/CATÁLOGO (ex: "que produtos têm?", "lista de artigos"):
   → USA: list_products (sem filtro de stock, a não ser que peçam "disponíveis")
   → COMPORTAMENTO: Mostra catálogo completo
   → SE catálogo vazio (0 produtos): "Atualmente não temos produtos disponíveis no catálogo."
   → SE catálogo tem produtos: "Temos 15 produtos. Principais: [lista]. Qual interessa?"

5️⃣ PERGUNTAS SOBRE PEDIDOS/CLIENTES:
   → USA: list_customers, search_customers, list_invoices
   → COMPORTAMENTO: Lookup de histórico
   ❌ NÃO USES: ferramentas de produtos (desnecessário)

TAREFA OBRIGATÓRIA:
1. 🔍 IDENTIFICA o tipo de pergunta (preço, disponibilidade, misto, catálogo, pedidos)
2. 🛠️ USA APENAS as ferramentas necessárias para esse tipo
3. 📋 ANALISA os resultados e aplica a lógica correta
4. 💬 RESPONDE com informação concreta e útil

🚨 LÓGICA DE RESPOSTA POR TIPO:

TIPO PREÇO/INFO:
✅ Mostra preço SEMPRE (mesmo stock = 0)
✅ Menciona stock apenas como info adicional: "atualmente sem stock" ou "15 unidades disponíveis"
❌ NÃO bloqueies informação por falta de stock

TIPO DISPONIBILIDADE:
✅ PRIMEIRO: Verifica se o catálogo tem produtos (usa list_products sem search para verificar total)
✅ SE catálogo está VAZIO (0 produtos): Responde APENAS "Não temos esse produto disponível." ou "Esse produto não está disponível."
   → NÃO adiciones "se precisar de mais alguma coisa", "se precisar de ajuda", "let me know if you need anything else"
   → NÃO perguntes nada adicional - catálogo vazio = não há nada para oferecer
✅ SE catálogo tem produtos: Verifica stock do produto específico
✅ SE stock = 0 E catálogo tem produtos: Procura similares COM stock > 0
✅ SE existem similares disponíveis COM stock > 0: Mostra-os DIRETAMENTE
✅ SE NÃO existem similares OU todos stock = 0: Diz "esgotado" ou "sem stock disponível"
❌ NÃO ofertas produtos sem stock
❌ NÃO perguntes "quer ver alternativas?" se não há alternativas disponíveis
❌ NÃO sugeras alternativas (espresso, latte, etc.) se o catálogo está vazio (0 produtos)
❌ NÃO ofereças notificações de stock (não existe ferramenta para isso)
❌ NÃO perguntes "se precisar de mais alguma coisa" quando catálogo está vazio (não há nada para oferecer!)

📱 Formato da resposta final:
   - Profissional e cortês
   - Direta ao ponto (2-4 frases)
   - APENAS informação útil baseada em dados REAIS
   - Com dados CONCRETOS (nomes, preços, stock quando relevante)

❌ EXEMPLOS PROIBIDOS:
- "Vou verificar essa informação" (USA A FERRAMENTA AGORA!)
- "Produto X não disponível. Quer ver alternativas?" → quando alternativas também sem stock
- "Não temos café. Quer espresso, latte?" → quando catálogo está vazio (0 produtos)
- Sugerir alternativas quando catálogo tem 0 produtos (ex: "não temos café, mas temos espresso, latte")
- "Coffee isn't available. If you need anything else, let me know." → quando catálogo está vazio (não há nada para oferecer!)
- "Não temos café. Se precisar de mais alguma coisa, avise." → quando catálogo está vazio (não há nada para oferecer!)
- "Posso notificá-lo quando houver stock?" → NÃO existe ferramenta para notificações de stock
- "I can notify you as soon as it's back in stock" → NÃO existe ferramenta para isso
- Usar check_stock para pergunta de preço (ferramenta errada!)
- Usar list_products para cada produto quando cliente pergunta lista (usa 1 chamada!)

✅ EXEMPLOS CORRETOS:

Pergunta: "Quanto custa o produto X?"
→ Usa: list_products(search: "produto X")
→ Resposta: "Produto X custa €25/unidade. Atualmente temos 15 unidades em stock."
→ OU se stock=0: "Produto X custa €25/unidade. Atualmente sem stock, próxima remessa prevista em breve."

Pergunta: "Têm produto X disponível?" ou "Têm café?"
→ PRIMEIRO: list_products (sem search) para verificar se catálogo tem produtos
→ SE catálogo vazio (0 produtos): Resposta: "Não temos esse produto disponível." (FIM - não adicionar mais nada)
→ SE catálogo tem produtos: check_stock(productId: "xxx") OU list_products(search: "X")
→ SE produto não encontrado E catálogo vazio: "Não temos esse produto disponível."
→ SE produto não encontrado MAS catálogo tem produtos: list_products(search: "similar") para procurar similares
→ SE stock=0 E existem similares COM stock>0: "Produto X sem stock. Alternativa: Produto Y disponível (€20, 15 unidades). Interessa?"
→ SE stock=0 E NÃO existem similares OU todos stock=0: "Produto X esgotado no momento."

EXEMPLO ESPECÍFICO - Catálogo vazio:
Pergunta: "Têm café?" ou "Coffee?"
→ Usa: list_products (sem search) → retorna 0 produtos (catálogo vazio)
→ Resposta CORRETA: "Não temos café disponível." ou "Coffee isn't available."
→ Resposta ERRADA: "Não temos café. Quer ver espresso, latte?" (NÃO sugerir se catálogo vazio!)
→ Resposta ERRADA: "Coffee isn't available. If you need anything else, let me know." (NÃO perguntar se precisa de mais nada - catálogo vazio!)
→ Resposta ERRADA: "Não temos café disponível. Se precisar de mais alguma coisa, avise." (NÃO adicionar frases adicionais!)

EXEMPLO ESPECÍFICO - Catálogo tem produtos relacionados:
Pergunta: "Têm café?"
→ Usa: list_products (sem search) → retorna 5 produtos (catálogo tem produtos)
→ Usa: list_products(search: "café") → retorna 0 produtos
→ Usa: list_products(search: "espresso") → retorna 2 produtos COM stock > 0
→ Resposta CORRETA: "Não temos café disponível. Temos espresso disponível (€2.50, 20 unidades). Interessa?"

Pergunta: "Preço e disponibilidade do produto X?"
→ Usa: list_products(search: "produto X")
→ Resposta: "Produto X: €25/unidade, 15 unidades disponíveis. Quer fazer pedido?"

🎯 LEMBRA-TE: 
- IDENTIFICA o tipo de pergunta ANTES de escolher ferramentas
- USA apenas ferramentas necessárias (eficiência!)
- PREÇO ≠ DISPONIBILIDADE (lógicas diferentes!)
- Cliente quer informação JÁ, não promessas de verificar!
- 🚨 CRÍTICO: SEMPRE verifica se catálogo tem produtos ANTES de sugerir alternativas
- 🚨 Se catálogo está vazio (0 produtos), responde APENAS "Não temos esse produto disponível." e PARA AQUI
- 🚨 NÃO adiciones "se precisar de mais alguma coisa", "if you need anything else", etc. quando catálogo está vazio (não há nada para oferecer!)
- 🚨 Só sugere alternativas se catálogo TEM produtos E existem produtos similares COM stock > 0
- 🚨 NUNCA ofereças notificações de stock - não existe ferramenta para isso!
- 🚨 Catálogo vazio = resposta curta e direta, SEM perguntas adicionais!`;

      // Get all available tools for AssistME
      const allTools = toolRegistry.getAllManifests();
      console.log(`[WhatsApp Automation] Total tools available: ${allTools.length}`);

      // 🎯 CRITICAL: OpenAI limits to 128 tools max
      const essentialToolNames = [
        'list_products',
        'check_stock',
        'list_stock_items',
        'stock_alert',
        
        // Customer management (lookup customer info)
        'list_customers',
        'search_customers',
        'create_customer',
        'list_contacts',
        
        // Sales/Leads (for quotes if needed)
        'create_budget_quote',
        'list_leads',
        
        // Pricing/Financial (for invoice queries)
        'list_invoices',
        'create_invoice',
        
        // General search (helpful for any query)
        'universal_search',
        'get_dashboard_summary',
        'get_company_info',
      ];
      
      const relevantTools = allTools.filter(tool => 
        essentialToolNames.includes(tool.name)
      );
      
      console.log(`[WhatsApp Automation] Filtered to ${relevantTools.length} essential tools for automation`);

      // Call AssistME with filtered tools and conversation history
      const result: any = await assistMEOrchestrator.processMessage(
        assistMEPrompt,
        {
          tenantId,
          userId: systemUserId, // Use real tenant user ID
          conversationId: undefined, // One-off analysis, not tied to a conversation
          environment: 'production',
        },
        undefined, // onProgress
        conversationHistory, // Pass conversation history for context
        undefined, // onStreamChunk
        relevantTools // IMPORTANT: Pass only relevant tools (under 128 limit)
      );

      console.log(`[WhatsApp Automation] AssistME response generated:`, {
        length: result.response?.length,
        toolsUsed: result.toolResults?.length || 0,
      });

      // Extract which tools were used for context tracking
      const toolsUsed = result.toolResults?.map((tr: any) => tr.toolName) || [];
      
      // Analyze which business context was checked based on tools used
      const contextUsed = {
        checkedProducts: toolsUsed.some((t: string) => 
          t.includes('product') || t.includes('inventory') || t.includes('item')
        ),
        checkedInventory: toolsUsed.some((t: string) => 
          t.includes('inventory') || t.includes('stock')
        ),
        checkedPricing: toolsUsed.some((t: string) => 
          t.includes('price') || t.includes('pricing') || t.includes('quote')
        ),
        checkedClientHistory: toolsUsed.some((t: string) => 
          t.includes('client') || t.includes('customer') || t.includes('order') || t.includes('history')
        ),
        toolsUsed,
      };

      // Validate and clean the response
      const cleanedResponse = this.validateAndCleanResponse(result.response || '');
      
      console.log(`[WhatsApp Automation] Context used:`, contextUsed);
      
      return {
        response: cleanedResponse,
        contextUsed,
      };
      
    } catch (error) {
      console.error("[WhatsApp Automation] Error generating context-aware response:", error);
      
      // Fallback to simple acknowledgment
      return {
        response: "Obrigado pela sua mensagem. Vou verificar os detalhes e respondo já de seguida.",
        contextUsed: {
          checkedProducts: false,
          checkedInventory: false,
          checkedPricing: false,
          checkedClientHistory: false,
          toolsUsed: [],
        },
      };
    }
  }

  /**
   * Validates and cleans AI response to ensure it's suitable for WhatsApp
   */
  private validateAndCleanResponse(response: string): string {
    let cleaned = response.trim();
    
    // Remove tool call artifacts (e.g., [Tool: xxx])
    cleaned = cleaned.replace(/\[Tool:?[^\]]*\]/gi, '');
    cleaned = cleaned.replace(/\[Calling tool[^\]]*\]/gi, '');
    
    // Remove code blocks
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
    
    // Remove markdown headers that might have been added
    cleaned = cleaned.replace(/^#+\s/gm, '');
    
    // Remove excessive newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // Truncate if too long (WhatsApp has no hard limit, but keep it reasonable)
    if (cleaned.length > 600) {
      cleaned = cleaned.substring(0, 580).trim();
      // Try to end at a sentence
      const lastPeriod = cleaned.lastIndexOf('.');
      const lastExclamation = cleaned.lastIndexOf('!');
      const lastQuestion = cleaned.lastIndexOf('?');
      const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
      
      if (lastSentenceEnd > 400) {
        cleaned = cleaned.substring(0, lastSentenceEnd + 1);
      } else {
        cleaned = cleaned + '...';
      }
    }
    
    // If response is too short or empty, use fallback
    if (cleaned.length < 10) {
      return "Obrigado pela sua mensagem. Vou analisar e respondo já de seguida.";
    }
    
    return cleaned.trim();
  }

  /**
   * Batch analyze multiple messages
   */
  async analyzeMessages(
    tenantId: string,
    messages: Array<{ phoneNumber: string; text: string }>,
  ): Promise<AutomationAnalysisResult[]> {
    const results = await Promise.all(
      messages.map(msg => this.analyzeMessage(tenantId, msg.phoneNumber, msg.text)),
    );
    return results;
  }

  /**
   * Get all active automation clients for a tenant
   */
  async getActiveClients(tenantId: string) {
    return await withDbRetry(async () => {
      return await db.query.whatsappAutomationClients.findMany({
        where: and(
          eq(whatsappAutomationClients.tenantId, tenantId),
          eq(whatsappAutomationClients.isActive, true),
        ),
      });
    });
  }

  /**
   * Detect if the current message is a follow-up response to a question we asked
   */
  private detectFollowUpResponse(
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    currentMessage?: string
  ): boolean {
    if (!conversationHistory || conversationHistory.length === 0) {
      return false;
    }

    // Get the last assistant message (our last response)
    const lastAssistantMessage = conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.role === 'assistant');

    if (!lastAssistantMessage) {
      return false;
    }

    // Check if the last assistant message contains a question
    const hasQuestionMark = lastAssistantMessage.content.includes('?');
    const hasQuestionWords = /\b(quer|deseja|gostaria|pode|precisa|confirma|want|would|can|do you|would you|could you)\b/i.test(lastAssistantMessage.content);

    // Check if current message is a confirmation/affirmation response
    const confirmationWords = /\b(sim|yes|ok|okay|sure|claro|confirmo|concordo|aceito|pode ser|that would be|sounds good|ya|yeah|yep|correct|right|exato|certo)\b/i;
    const isConfirmation = currentMessage && confirmationWords.test(currentMessage.toLowerCase());

    // If we asked a question AND they responded with confirmation, it's a follow-up
    if ((hasQuestionMark || hasQuestionWords) && isConfirmation) {
      console.log(`[WhatsApp Automation] Detected follow-up response to question: "${lastAssistantMessage.content.substring(0, 100)}..."`);
      return true;
    }

    return false;
  }

  /**
   * Check if a phone number is a configured automation client
   */
  async isAutomationClient(tenantId: string, phoneNumber: string): Promise<boolean> {
    const client = await withDbRetry(async () => {
      return await db.query.whatsappAutomationClients.findFirst({
        where: and(
          eq(whatsappAutomationClients.tenantId, tenantId),
          eq(whatsappAutomationClients.phoneNumber, phoneNumber),
          eq(whatsappAutomationClients.isActive, true),
        ),
      });
    });
    return !!client;
  }
}

// Export singleton instance
export const whatsappAutomationAnalyzer = new WhatsAppAutomationAnalyzer();
