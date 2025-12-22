import OpenAI from "openai";

// Classification result type
export type MessageCategory =
  | "order"
  | "info_request"
  | "invoice"
  | "complaint"
  | "other";

export interface ClassificationResult {
  category: MessageCategory;
  confidence: number; // 0-1 score
  context: {
    reasoning?: string;
    keywords?: string[];
    suggestedActions?: string[];
  };
}

// Use OpenAI instead of Anthropic (more widely available)
let _openaiClient: OpenAI | null = null;

export function isClassifierAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function getClassifierStatus(): { available: boolean; error?: string } {
  if (!process.env.OPENAI_API_KEY) {
    return {
      available: false,
      error:
        "OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable to use WhatsApp classification features.",
    };
  }
  return { available: true };
}

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable to use WhatsApp classification features.",
      );
    }
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openaiClient;
}

export class WhatsAppMessageClassifierService {
  private readonly modelName = "gpt-4o-mini";

  /**
   * Classifies a WhatsApp message into categories
   * @param messageText - The message content to classify
   * @returns Classification result with category, confidence, and context
   */
  async classifyMessage(messageText: string): Promise<ClassificationResult> {
    try {
      const openai = getOpenAIClient();

      const systemPrompt = `És um assistente especializado em classificar mensagens de WhatsApp de negócios em português.

Analisa a mensagem e classifica-a numa das seguintes categorias:

1. **order** - Pedidos de compra, encomendas
   - Exemplos: "Quero encomendar 10 unidades", "Precisava de 5kg de...", "Gostaria de fazer um pedido"
   
2. **info_request** - Pedidos de informação, preços, disponibilidade
   - Exemplos: "Quanto custa?", "Têm em stock?", "Qual é o preço de...?", "Informações sobre..."
   
3. **invoice** - Faturas recebidas, pedidos de pagamento, questões financeiras
   - Exemplos: "Envio a fatura", "Quando posso pagar?", "Sobre o pagamento...", "NIB para transferência"
   
4. **complaint** - Reclamações, problemas, insatisfações
   - Exemplos: "O produto veio com defeito", "Ainda não recebi", "Muito insatisfeito com..."
   
5. **other** - Outros tipos de mensagens
   - Saudações, agradecimentos, confirmações gerais, mensagens não relacionadas com negócio

Retorna SEMPRE um objeto JSON com:
- category: uma das 5 categorias acima
- confidence: score entre 0 e 1 (ex: 0.95 para muito confiante, 0.6 para incerto)
- reasoning: explicação curta da classificação (1-2 frases)
- keywords: lista de 2-5 palavras-chave que identificaste na mensagem
- suggestedActions: lista de 1-3 ações sugeridas para responder à mensagem

Exemplos de respostas JSON:

{
  "category": "order",
  "confidence": 0.92,
  "reasoning": "Cliente expressa clara intenção de compra com quantidade específica",
  "keywords": ["encomendar", "10 unidades", "compra"],
  "suggestedActions": ["Confirmar disponibilidade de stock", "Enviar cotação", "Processar pedido"]
}

{
  "category": "info_request",
  "confidence": 0.88,
  "reasoning": "Cliente solicita informação sobre preço de produto",
  "keywords": ["preço", "quanto custa", "informação"],
  "suggestedActions": ["Enviar tabela de preços", "Verificar stock disponível", "Agendar apresentação"]
}`;

      const userPrompt = `Classifica esta mensagem de WhatsApp:

"${messageText}"

Retorna apenas o objeto JSON com a classificação.`;

      const response = await openai.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.3, // Lower temperature for more consistent classifications
        response_format: { type: "json_object" },
      });

      // Extract text content from OpenAI response
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in OpenAI response");
      }

      // Parse JSON response
      const result = JSON.parse(content);

      // Validate and sanitize the response
      const validCategories: MessageCategory[] = [
        "order",
        "info_request",
        "invoice",
        "complaint",
        "other",
      ];
      const category = validCategories.includes(result.category)
        ? result.category
        : "other";

      const confidence =
        typeof result.confidence === "number"
          ? Math.max(0, Math.min(1, result.confidence)) // Clamp between 0-1
          : 0.5;

      return {
        category,
        confidence,
        context: {
          reasoning: result.reasoning || "Classificação automática",
          keywords: Array.isArray(result.keywords) ? result.keywords : [],
          suggestedActions: Array.isArray(result.suggestedActions)
            ? result.suggestedActions
            : [],
        },
      };
    } catch (error) {
      console.error("[WhatsApp Classifier] Error classifying message:", error);

      // Return safe fallback on error
      return {
        category: "other",
        confidence: 0.1,
        context: {
          reasoning: `Erro na classificação: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
          keywords: [],
          suggestedActions: [
            "Revisar manualmente",
            "Contactar suporte técnico",
          ],
        },
      };
    }
  }

  /**
   * Batch classify multiple messages
   * @param messages - Array of message texts to classify
   * @returns Array of classification results
   */
  async classifyMessages(messages: string[]): Promise<ClassificationResult[]> {
    // Process messages in parallel for better performance
    const classifications = await Promise.all(
      messages.map((message) => this.classifyMessage(message)),
    );
    return classifications;
  }

  /**
   * Check if the classifier service is available
   * @returns Service availability status
   */
  isAvailable(): { available: boolean; error?: string } {
    return getClassifierStatus();
  }
}

// Export singleton instance
export const whatsappClassifier = new WhatsAppMessageClassifierService();
