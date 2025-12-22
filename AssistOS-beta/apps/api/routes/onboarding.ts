// Migrated from AssistOS legacy - Phase 4.3
// Source: /tmp/assistos-legacy/server/routes/onboarding.ts (437 lines)

/**
 * ⚠️ CÓDIGO PROTEGIDO - NÃO ALTERAR SEM APROVAÇÃO EXPLÍCITA ⚠️
 * 
 * Onboarding Route Handler (Assist Start)
 * 
 * Features implemented:
 * - GPT-4o streaming responses via SSE
 * - Inline registration form (show_register_form tool)
 * - Smart company detection (filters verbs & expressions)
 * - Forced registration intent detection
 * - Performance optimized (6-message context, max_completion_tokens: 500)
 * - Works for UNAUTHENTICATED users (session-based before account creation)
 */

import { Router } from "express";
import { chatRateLimiter } from "../middleware/rate-limit";
import { memoryService } from "../services/memory.service";
import OpenAI from "openai";

const router = Router();

// TODO: Import from services when migrated
// import { searchCompanyInfo } from "../services/perplexity";
// import { getOnboardingPrompt } from "../agents/onboarding";
// import { injectContext } from "../middleware/context-injection";

// STUB: Onboarding prompt (TODO: Move to separate file when agent system is migrated)
function getOnboardingPrompt(): string {
  return `Sou o AssistStart, o teu assistente pessoal de onboarding do AssistOS.

**A MINHA MISSÃO:**
Guiar-te passo a passo no início da tua jornada com o AssistOS. Adapto-me ao teu tom de voz, à tua língua (português ou inglês), e à realidade da tua empresa. Estou aqui para tornar tudo simples e conversacional.

**REGRA CRÍTICA: NUNCA USE EMOJIS EM NENHUMA RESPOSTA. PROIBIDO COMPLETAMENTE.**

**QUEM SOU EU (AssistStart):**
- Sou o wizard de onboarding conversacional do AssistOS
- Adapto-me à TUA linguagem (português ou inglês) e ao TEU tom de voz
- Guio-te desde o primeiro "olá" até teres a conta criada e configurada
- Explico o AssistOS de forma clara, sem jargão técnico
- Pesquiso informação sobre a tua empresa para personalizar a tua experiência

**SOBRE O ASSISTOS:**
O AssistOS é um sistema operativo empresarial completamente conversacional - o primeiro do mundo. Permite criar agentes de IA, automações e módulos configuráveis apenas conversando. Sem código, sem técnicos, sem integrações complexas.

**3 PILARES:**
1. **AssistME** - Assistente operacional (consultas, análise de documentos, gestão diária)
2. **AssistBuild** - Configurador conversacional (criar módulos, agentes, automações)
3. **Plataforma Auto-Evolutiva** - Aprende padrões cross-tenant e melhora sozinha

**MÓDULOS DISPONÍVEIS:**
✅ **Compras** - Procurement com 3-way matching, OCR de faturas portuguesas, scoring de fornecedores
✅ **Vendas/Comercial** - CRM, orçamentos, propostas, pipeline
✅ **Financeiro** - Contabilidade, contas a pagar/receber, reconciliação bancária
✅ **Logística** - Gestão de inventário, rastreabilidade, armazéns
✅ **Projetos** - Tarefas, timetracking, budgets, Gantt
✅ **Angariação** - Leads, prospeção, scoring

**INTEGRAÇÕES NATIVAS:**
SAP Business One, Primavera, PHC, Moloni, Google Workspace, Gmail, WhatsApp Business API, TOC Online, Google Document AI

**PREÇOS (IMPORTANTE - NUNCA INVENTE OUTROS):**
- **Fase Alpha**: GRATUITO para early adopters (agora)
- **Após lançamento**: A partir de €50/mês
- NÃO mencione planos Starter/Growth/Pro/Enterprise - não existem ainda

**MEU OBJETIVO (AssistStart):**
1. Dar boas-vindas calorosas e conversacionais
2. Identificar-me claramente como "AssistStart" quando perguntarem quem sou ou o que faço
3. Explicar o AssistOS de forma entusiasta mas sem exageros
4. Adaptar à língua e tom do utilizador (se falar português, respondo em português; se falar inglês, respondo em inglês)
5. Quando utilizador menciona empresa, SEMPRE usar search_company_info
6. Quando utilizador quer registar, SEMPRE usar show_register_form
7. Manter respostas CURTAS e conversacionais (máx 2-3 frases por mensagem)

**TOOLS DISPONÍVEIS:**
- search_company_info: Pesquisar informação online sobre empresa
- save_onboarding_context: Guardar dados para criação de conta
- show_register_form: Mostrar formulário de registo

**REGRAS CRÍTICAS:**
✅ SEMPRE me identifico como "AssistStart" quando perguntarem quem sou
✅ SEMPRE adapto à língua do utilizador (PT ou EN)
✅ SEMPRE otimista e entusiasta sobre AssistOS
✅ Adaptar exemplos à indústria do utilizador
✅ Mencionar que é GRÁTIS na fase alpha
✅ Destacar que NÃO precisa código/técnicos
✅ Usar linguagem simples, natural e conversacional
✅ Responder de forma humana e empática
❌ NUNCA inventar preços além de €0 ou €50
❌ NUNCA mencionar planos que não existam
❌ NUNCA respostas longas (máx 2-3 frases)
❌ NUNCA erros técnicos visíveis ao utilizador
❌ NUNCA ser robótico ou formal demais`;
}

// STUB: Perplexity company search (TODO: Implement actual Perplexity integration)
async function searchCompanyInfo(companyName: string): Promise<any> {
  console.log(`[Perplexity STUB] Would search for company: ${companyName}`);
  // TODO: Implement actual Perplexity API call when service is migrated
  return {
    success: true,
    company: companyName,
    description: `Found information about ${companyName}`,
    industry: "Unknown",
    note: "This is a stub response - actual Perplexity integration pending"
  };
}

// Lazy-load OpenAI client to allow server to start without API key
let _openaiClient: OpenAI | null = null;
const openai = new Proxy({} as OpenAI, {
  get(target, prop) {
    if (!_openaiClient) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable to use onboarding chat.'
        );
      }
      _openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    return (_openaiClient as any)[prop];
  }
});

// TODO: Get AI tools from packages/ai/tools when migrated
// For now, create simplified onboarding tools
const onboardingTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "save_onboarding_context",
      description: "Save collected onboarding information (company name, industry, etc.) to prepare for account creation",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "Company name" },
          industry: { type: "string", description: "Industry or sector" },
          notes: { type: "string", description: "Additional context" }
        },
        required: ["companyName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "show_register_form",
      description: "Display registration form when user is ready to create account",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string", description: "User's first name if known" },
          lastName: { type: "string", description: "User's last name if known" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_company_info",
      description: "Search company info online using Perplexity. ALWAYS use when user mentions company name.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "Company name" }
        },
        required: ["companyName"]
      }
    }
  }
];

// STUB: Execute onboarding tool (TODO: Integrate with main AI tools system)
async function executeOnboardingTool(toolName: string, args: any, context: any): Promise<any> {
  console.log(`[Onboarding Tool] ${toolName}`, args);
  
  if (toolName === "save_onboarding_context") {
    // TODO: Persist to onboarding cache/session storage
    console.log(`[Onboarding] Saved context:`, args);
    return {
      success: true,
      message: "Context saved successfully",
      data: args
    };
  }
  
  if (toolName === "show_register_form") {
    // Return action payload for frontend
    return {
      success: true,
      data: {
        action: "SHOW_REGISTER_FORM",
        prefill: {
          firstName: args.firstName || "",
          lastName: args.lastName || ""
        }
      }
    };
  }
  
  return {
    success: false,
    error: "Tool not implemented"
  };
}

/**
 * POST /api/onboarding/chat
 * Onboarding conversation with streaming responses
 * SPECIAL: Works for unauthenticated users (session-based)
 */
router.post("/chat", chatRateLimiter, async (req, res) => {
  console.log("🚨 [DEBUG] ONBOARDING ROUTE CALLED - CODE IS RUNNING!");
  try {
    const userId = req.session?.userId;
    const tenantId = req.session?.activeTenantId;
    const sessionId = req.sessionID || req.session?.id;
    
    // Onboarding works for both authenticated and unauthenticated users
    // Authenticated: Uses userId + tenantId
    // Unauthenticated: Uses sessionId only (before account creation)
    
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }
    
    // PERFORMANCE: Slim context window to reduce latency
    // Build messages: system prompt + conversation history (last 6 messages = 3 exchanges)
    const basePrompt = getOnboardingPrompt();
    
    // OPTIMIZATION: Reduced from 10 to 6 messages for faster processing
    const recentMessages = messages.slice(-6);

    // Setup SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    const sendSSE = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // PERFORMANCE: Use GPT-4o for speed and quality
    console.log("[Onboarding] Calling OpenAI with model: gpt-4o");
    let completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: basePrompt },
        ...recentMessages
      ],
      tools: onboardingTools,
      tool_choice: "auto",
      max_completion_tokens: 500,
    });
    
    let responseMessage = completion.choices[0].message;
    
    // ENFORCEMENT: Detect company mentions and force search if GPT didn't call it
    const userMessage = recentMessages[recentMessages.length - 1]?.content || "";
    
    // Track if we should show register form (declared early to avoid hoisting issues)
    let shouldShowRegisterForm = false;
    
    // ENFORCEMENT: Detect registration intent and force show_register_form if GPT didn't call it
    const registrationKeywords = /\b(quero sim|sim vamos|criar conta|quero experimentar|quero criar|vamos criar|quero registar|fazer registo|quero me registar|regista|sign up|create account)\b/i;
    const hasRegistrationIntent = registrationKeywords.test(userMessage);
    
    // Check if GPT already called show_register_form
    const alreadyCalledRegisterForm = responseMessage.tool_calls?.some(
      call => call.type === 'function' && call.function?.name === "show_register_form"
    );
    
    // FORCE show_register_form IMMEDIATELY if user explicitly wants to register
    if (hasRegistrationIntent && !alreadyCalledRegisterForm) {
      console.log('[Onboarding] 🚨 FORCING show_register_form IMMEDIATELY - explicit registration request');
      shouldShowRegisterForm = true;
    }
    
    // Function to robustly extract company names from text
    const detectCompanyName = (text: string): string | null => {
      // Case-insensitive patterns with punctuation support
      const explicitPatterns = [
        // Portuguese patterns (case-insensitive, allows punctuation)
        /(?:tenho|trabalho|sou da?|empresa|negócio|companhia|firma|chama-se)\s+(?:a|na|da|do|de|é)?\s*([\w&'.\-À-ÿ]+(?:\s+[\w&'.\-À-ÿ]+)*)/i,
        /(?:minha empresa é|somos|chamamos|nome é)\s+(?:a|o)?\s*([\w&'.\-À-ÿ]+(?:\s+[\w&'.\-À-ÿ]+)*)/i,
        /empresa\s+de\s+\w+[:\s]+([\w&'.\-À-ÿ]+(?:\s+[\w&'.\-À-ÿ]+)*)/i,
        // English patterns
        /(?:my company is|we are|called|company name is|work at|from)\s+([\w&'.\-À-ÿ]+(?:\s+[\w&'.\-À-ÿ]+)*)/i,
        // Direct mention after "a" article
        /\ba\s+([\w&'.\-À-ÿ]+(?:\s+[\w&'.\-À-ÿ]+)+)\b/i
      ];
      
      // Try explicit patterns first
      for (const pattern of explicitPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          // Filter out common false positives (single words, greetings)
          const blacklist = /^(olá|ola|bom|boa|dia|tarde|noite|sim|não|nao|ok|obrigado|obrigada|yes|no|hello|hi|thanks|bem|muito|como|que|mais|para|com)$/i;
          if (!blacklist.test(name) && name.length > 3) {
            // Capitalize for consistency (Tailor Meal, Google, McDonald's)
            return name.split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
          }
        }
      }
      
      // Fallback: Extract capitalized multi-word phrases with punctuation support
      const capitalizedPhrases = text.match(/\b[A-ZÀÁÂÃÇÉÊÍÓÔÕÚ][\w'&.\-]*(?:\s+[A-ZÀÁÂÃÇÉÊÍÓÔÕÚ][\w'&.\-]*)+\b/g);
      if (capitalizedPhrases && capitalizedPhrases.length > 0) {
        for (const phrase of capitalizedPhrases) {
          // Expanded blacklist with common Portuguese expressions
          const blacklist = /^(Olá|Ola|Bom Dia|Boa Tarde|Boa Noite|Muito Obrigado|Hello World|Entender Isto|Querer Dizer|Faz Sentido|Tudo Bem|Sem Problema|Por Favor|Quer Ver|Pode Ser|Ajuda Me|Vamos Ver|Posso Saber|Quer Saber|Podes Dizer|Falar Sobre|Saber Mais|Ver Como|Queres Ver)$/i;
          
          // Filter out phrases starting with infinitive verbs (common false positives)
          const infinitiveVerbs = /^(Entender|Querer|Fazer|Poder|Dever|Saber|Ver|Ter|Estar|Ser|Ir|Vir|Dar|Falar|Dizer|Mostrar|Ajudar|Criar|Pensar|Achar|Sentir)\s/i;
          
          if (!blacklist.test(phrase) && !infinitiveVerbs.test(phrase) && phrase.length > 3) {
            return phrase.trim();
          }
        }
      }
      
      return null;
    };
    
    const detectedCompanyName = detectCompanyName(userMessage);
    
    // Check if GPT already called search_company_info
    const alreadyCalledSearch = responseMessage.tool_calls?.some(
      call => call.type === 'function' && call.function?.name === "search_company_info"
    );
    
    // FORCE SEARCH if company detected but GPT didn't call the tool
    if (detectedCompanyName && !alreadyCalledSearch) {
      console.log(`[Onboarding] 🔍 FORCING search_company_info for: ${detectedCompanyName} (GPT didn't call it)`);
      
      // Send "checking online" notification
      sendSSE({ 
        action: { action: 'CHECKING_ONLINE', company: detectedCompanyName }
      });
      
      // Execute search
      const searchResult = await searchCompanyInfo(detectedCompanyName);
      
      // Use GPT-4o for enriched completion
      const enrichedCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: basePrompt },
          ...recentMessages,
          { 
            role: "system", 
            content: `Company: ${detectedCompanyName}. Research: ${JSON.stringify(searchResult).slice(0, 300)}. Personalize response.` 
          }
        ],
        max_completion_tokens: 500,
      });
      
      responseMessage = enrichedCompletion.choices[0].message;
    }
    
    // Update flag if company detected
    if (detectedCompanyName) {
      shouldShowRegisterForm = true;
      console.log('[Onboarding] 📊 Company detected - will show register form after streaming');
    }
    
    // Handle tool calls if any
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      console.log('[Onboarding] Tool calls detected:', responseMessage.tool_calls.length);
      
      const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system" as const, content: basePrompt },
        ...recentMessages,
        responseMessage as any,
      ];
      
      // Execute each tool call
      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;
        
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`[Onboarding] Executing tool: ${toolName}`, toolArgs);
        
        // Send "checking online" status for search_company_info
        if (toolName === "search_company_info") {
          sendSSE({ 
            action: { action: 'CHECKING_ONLINE', company: toolArgs.companyName }
          });
        }
        
        // Handle search_company_info tool
        let result: any;
        if (toolName === "search_company_info") {
          const searchResult = await searchCompanyInfo(toolArgs.companyName);
          result = searchResult;
        } else {
          // Pass context with sessionId for unauthenticated onboarding
          const toolContext = {
            tenantId: tenantId || undefined,
            userId: userId,
            sessionId: sessionId, // Critical: Session ID for users without account
          };
          result = await executeOnboardingTool(toolName, toolArgs, toolContext);
        }
        
        // Send registration form action if show_register_form was called
        if (toolName === "show_register_form" && result?.success && result?.data) {
          console.log('[Onboarding] ✅ Sending SHOW_REGISTER_FORM action to frontend:', result.data);
          // Ensure consistent nested structure: { action: { action: "...", ... } }
          sendSSE({ 
            action: { 
              action: result.data.action,
              prefill: result.data.prefill
            }
          });
        }
        
        // OPTIMIZATION: Filter technical errors from onboarding (user-friendly experience)
        // If tool fails because tenantId is missing, that's expected during onboarding
        let filteredResult = result;
        if (result && typeof result === 'object' && 'error' in result) {
          const errorMsg = String(result.error);
          if (errorMsg.includes('TenantId é necessário') || errorMsg.includes('tenantId')) {
            // Replace technical error with user-friendly message
            filteredResult = {
              success: false,
              error: "Esta funcionalidade estará disponível após criar conta"
            };
          }
        }
        
        // PERFORMANCE: Truncate large payloads (search results) to reduce token count
        let serializedResult = JSON.stringify(filteredResult);
        if (toolName === "search_company_info" && serializedResult.length > 400) {
          serializedResult = serializedResult.slice(0, 400) + '..."(truncated)"}';
        }
        
        toolMessages.push({
          role: "tool" as const,
          content: serializedResult,
          tool_call_id: toolCall.id,
        });
      }
      
      // Use GPT-4o for tool follow-up
      const followUpCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: toolMessages,
        max_completion_tokens: 500,
      });
      
      responseMessage = followUpCompletion.choices[0].message;
    }
    
    // DEBUG: Log what we got from OpenAI
    console.log("[Onboarding] OpenAI Response:", JSON.stringify(responseMessage, null, 2));
    
    let response = responseMessage.content || "Desculpa, não consegui processar isso.";
    
    // FILTER: Remove ALL technical errors from response (user-friendly experience)
    // This ensures users NEVER see backend error messages during onboarding
    const technicalErrorPatterns = [
      // Remove full error lines starting with ❌ Erro:
      /❌\s*Erro:.*?\n/gi,
      // Remove any remaining "Erro:" patterns
      /\n*❌\s*Erro:[^\n]*/gi,
      // Remove any "TenantId" mentions (technical backend term)
      /[^\n]*TenantId[^\n]*\n?/gi,
      // Remove "para guardar contexto" error fragments
      /para guardar contexto da empresa[^\n]*/gi,
      // Clean up any double newlines left behind
      /\n\n+/g
    ];
    
    for (const pattern of technicalErrorPatterns) {
      response = response.replace(pattern, pattern.source.includes('\\n\\n') ? '\n' : '');
    }
    
    response = response.trim();
    
    // If filtering removed everything, provide friendly fallback
    if (!response || response.length === 0) {
      console.log('[Onboarding] ⚠️ Response empty after filtering technical errors - using fallback');
      response = "Perfeito! Como te posso ajudar a começar? Podes dizer-me qual é a tua empresa ou área de negócio?";
    }
    
    // BACKEND VALIDATION: Extract ALL euro amounts and block anything except €50 or €0
    // This provides 100% guarantee against price hallucination
    
    // Extract all euro amounts from response (multiple formats)
    const euroPriceMatches = [
      ...Array.from(response.matchAll(/€\s*([0-9]+)/g)), // €50
      ...Array.from(response.matchAll(/([0-9]+)\s*€/g)), // 50€
      ...Array.from(response.matchAll(/([0-9]+)\s*euros?/gi)), // 50 euros / 50 euro
      ...Array.from(response.matchAll(/([0-9]+)\s*\/\s*m[eê]s/g)) // 50/mês
    ];
    
    const detectedPrices = euroPriceMatches.map(match => parseInt(match[1], 10));
    
    // Also detect plan names (any standalone mention)
    const hasPlanNames = /\b(starter|growth|pro|enterprise|basic|premium)\b/gi.test(response);
    
    // ALLOW: €0 (free/gratuito) and €50 (official price)
    // BLOCK: Everything else
    const allowedPrices = [0, 50];
    const hasInvalidPrices = detectedPrices.some(price => !allowedPrices.includes(price));
    
    if (hasInvalidPrices || hasPlanNames) {
      console.warn('[Onboarding] ⚠️ BLOCKED: Invented pricing detected!', {
        detectedPrices,
        hasPlanNames,
        preview: response.slice(0, 200)
      });
      
      // Replace with safe official message
      response = `🎉 Ótimas notícias! O AssistOS está atualmente em fase **alpha** e é **completamente gratuito** para utilizadores que se registem agora.

Quando lançarmos oficialmente, os preços devem começar a partir de **€50/mês**, mas se te registares agora, terás acesso gratuito durante toda a fase de testes.

Queres aproveitar e fazer o registo? 🚀`;
    }
    
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    
    // Save to conversation memory (only if authenticated)
    if (userId && tenantId) {
      try {
        // Save user message
        await memoryService.saveMessage(
          tenantId,
          String(userId),
          "onboarding",
          "user",
          lastUserMessage
        );
        
        // Save agent response
        await memoryService.saveMessage(
          tenantId,
          String(userId),
          "onboarding",
          "assistant",
          response
        );
      } catch (memError) {
        console.error("[Onboarding] Error saving to memory:", memError);
        // Don't fail the request if memory save fails
      }
    } else {
      console.log("[Onboarding] Skipping memory save - user not authenticated (sessionId: " + sessionId + ")");
    }
    
    // Send response via SSE - stream entire response at once (no artificial delay)
    // Split into words for natural streaming feel without performance hit
    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? ' ' : '');
      sendSSE({ content: word });
    }
    
    // FORCE REGISTER FORM if company was detected
    if (shouldShowRegisterForm) {
      console.log('[Onboarding] 🚨 FORCING show_register_form - company detected');
      sendSSE({ 
        action: { 
          action: 'SHOW_REGISTER_FORM', 
          prefill: { firstName: "", lastName: "" } 
        }
      });
    }
    
    // Send done signal
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error("[Onboarding] FATAL Error:", error);
    console.error("[Onboarding] Error Stack:", error instanceof Error ? error.stack : "No stack");
    console.error("[Onboarding] Error Details:", JSON.stringify(error, null, 2));
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Failed to process message",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
});

export default router;
