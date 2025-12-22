import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import {
  DocumentType,
  ProcessedDocument,
  ProcessingContext,
  ProcessorName,
  ExtractedDocumentData,
  DocumentLineItem,
} from '../types';
import OpenAI from 'openai';
import { creditUsageService } from '../../services/credit-usage';

/**
 * OpenAI Vision Processor
 * 
 * Generic document processor using OpenAI GPT-4o Vision.
 * Supports both PDFs (via Responses API) and images (via Chat Completions).
 * 
 * Priority: Medium (used as fallback when specialized processors fail)
 */
export class OpenAIVisionProcessor implements IDocumentProcessor {
  name: ProcessorName = 'openai-vision-generic';
  supportedTypes: DocumentType[] = [
    'invoice',
    'receipt',
    'credit_note',
    'debit_note',
    'purchase_order',
    'quotation',
    'delivery_note',
    'contract',
    'other',
  ];
  priority: number = 50; // Medium priority (specialized processors have higher)

  private openai: OpenAI | null = null;

  constructor() {
    // Defer OpenAI client initialization to preserve backward compatibility
    // Client will be initialized in getClient() when needed
  }

  private async recordUsage(
    usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
    context: ProcessingContext,
    details: { operation: string; service: string; metadata?: Record<string, any> }
  ): Promise<void> {
    if (!usage || (!usage.prompt_tokens && !usage.completion_tokens)) {
      return;
    }

    const environment = context.environment || 'production';

    try {
      await creditUsageService.trackModelUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        provider: 'openai',
        service: details.service,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        environment,
        metadata: {
          processor: this.name,
          operation: details.operation,
          ...details.metadata,
        },
      });
    } catch (error) {
      // ⚠️ NOTE: This should rarely happen since we check credits before the operation
      console.error('[OpenAIVisionProcessor] Failed to track credit usage (post-operation):', error);
    }
  }

  /**
   * Get or initialize OpenAI client
   */
  private getClient(): OpenAI {
    if (!this.openai) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this.openai;
  }

  canProcess(documentType: DocumentType, mimeType: string): boolean {
    const supportedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    return supportedMimeTypes.includes(mimeType);
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
  }

  async getStatus(): Promise<{
    available: boolean;
    reason?: string;
  }> {
    const hasKey = !!process.env.OPENAI_API_KEY;
    return {
      available: hasKey,
      reason: hasKey ? undefined : 'OPENAI_API_KEY not configured',
    };
  }

  async process(
    fileBuffer: Buffer,
    mimeType: string,
    context: ProcessingContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();

    // 💳 PRE-FLIGHT CREDIT CHECK: Block operation if insufficient credits
    try {
      await creditUsageService.checkSufficientCredits(context.tenantId, 1);
    } catch (error) {
      console.error('[OpenAIVisionProcessor] ❌ BLOCKED: Insufficient credits', error);
      throw error; // Block the operation
    }

    onProgress?.(0, 'Iniciando processamento OpenAI...');

    if (mimeType === 'application/pdf') {
      return this.processPDF(fileBuffer, context, onProgress);
    } else if (mimeType.startsWith('image/')) {
      return this.processImage(fileBuffer, mimeType, context, onProgress);
    }

    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  /**
   * Process PDF using OpenAI Responses API
   */
  private async processPDF(
    fileBuffer: Buffer,
    context: ProcessingContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();

    onProgress?.(10, 'A enviar PDF para OpenAI...');

    const file = await this.getClient().files.create({
      file: new File([fileBuffer], 'document.pdf', { type: 'application/pdf' }),
      purpose: 'assistants',
    });

    try {
      onProgress?.(30, 'A analisar documento com GPT-4o...');

      const extraction = await this.withTimeout(
        (this.getClient() as any).responses.create({
          model: 'gpt-4o',
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: this.getSystemPrompt() },
                { type: 'input_file', file_id: file.id },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'extract_document_data',
              strict: true,
              schema: this.getResponseSchema(),
            },
          },
        }),
        120000,
        'PDF processing timeout (120s)'
      );

      await this.recordUsage((extraction as any)?.usage, context, {
        operation: 'openai_pdf_processing',
        service: 'gpt-4o',
        metadata: { mimeType: 'application/pdf' },
      });

      onProgress?.(90, 'Processando resultados...');

      const extractContent = (extraction as any).output[0].content;
      const extractText = Array.isArray(extractContent)
        ? extractContent[0]?.text
        : typeof extractContent === 'string'
          ? extractContent
          : JSON.stringify(extractContent);

      const result = JSON.parse(extractText);

      const processingTimeMs = Date.now() - startTime;

      console.log(
        `[OpenAIVisionProcessor] PDF processed in ${(processingTimeMs / 1000).toFixed(1)}s`
      );

      return {
        documentType: result.documentType,
        documentSubType: result.documentSubType,
        documentTypeLabel: result.documentTypeLabel,
        extractedData: result.extractedData,
        processorUsed: this.name,
        processingTimeMs,
        confidence: result.confidence,
        rawText: result.rawText,
        message: result.suggestedAction || `Documento processado: ${result.documentTypeLabel}`,
        suggestedAction: result.suggestedAction,
        rawResponse: result,
      };
    } finally {
      try {
        await this.getClient().files.delete(file.id);
      } catch (error) {
        console.warn('[OpenAIVisionProcessor] Failed to delete file', error);
      }
    }
  }

  /**
   * Process image using OpenAI Vision API
   */
  private async processImage(
    fileBuffer: Buffer,
    mimeType: string,
    context: ProcessingContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();

    onProgress?.(10, 'A analisar imagem com GPT-4o Vision...');

    const base64Data = fileBuffer.toString('base64');

    const completion = await this.getClient().chat.completions.create(
      {
        model: 'gpt-4o',
        max_completion_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: 'Analisa este documento de negócio e extrai os dados em formato JSON conforme as instruções.',
              },
            ],
          },
        ],
      },
      { timeout: 120000 }
    );

    await this.recordUsage(completion.usage, context, {
      operation: 'openai_image_processing',
      service: 'gpt-4o',
      metadata: { mimeType },
    });

    onProgress?.(90, 'Processando resultados...');

    const responseText = completion.choices[0]?.message?.content || '';
    let parsedData: any;

    try {
      const jsonMatch =
        responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        responseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : responseText;
      parsedData = JSON.parse(jsonText);
    } catch (error) {
      parsedData = {
        documentType: 'other',
        documentTypeLabel: 'Documento não identificado',
        extractedData: { notes: responseText.substring(0, 500) },
        confidence: 50,
        suggestedAction:
          'Revisar manualmente - não foi possível identificar automaticamente',
      };
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(
      `[OpenAIVisionProcessor] Image processed in ${(processingTimeMs / 1000).toFixed(1)}s`
    );

    return {
      documentType: parsedData.documentType || 'other',
      documentSubType: parsedData.documentSubType,
      documentTypeLabel: parsedData.documentTypeLabel || 'Documento',
      extractedData: parsedData.extractedData || {},
      processorUsed: this.name,
      processingTimeMs,
      confidence: parsedData.confidence || 70,
      rawText: responseText,
      message: parsedData.suggestedAction || `Documento analisado: ${parsedData.documentTypeLabel}`,
      suggestedAction: parsedData.suggestedAction,
      rawResponse: parsedData,
    };
  }

  /**
   * System prompt for document analysis
   */
  private getSystemPrompt(): string {
    return `És um assistente especializado em análise de documentos fiscais portugueses.

⚠️ REGRA CRÍTICA: NUNCA INVENTES DADOS! Só extrai o que REALMENTE está visível no documento.

INSTRUÇÕES CRÍTICAS:
1. Identifica o tipo EXATO de documento (Fatura, Fatura-Recibo, Recibo, Nota de Crédito)
2. Determina se o documento JÁ FOI PAGO (Fatura-Recibo = pago; Fatura = pendente)
3. Identifica a DIREÇÃO: quem EMITE vs quem RECEBE
4. Extrai TODOS os produtos/serviços listados no documento
5. USA APENAS os valores EXATOS que vês - não calcules, não assumes, não inventes

Retorna JSON com esta estrutura EXATA:
{
  "documentType": "invoice|contract|receipt|purchase_order|quotation|delivery_note|credit_note|other",
  "documentSubType": "invoice|invoice_receipt|receipt|credit_note|other",
  "documentTypeLabel": "Nome exato do documento (ex: 'Fatura-Recibo', 'Fatura', 'Recibo')",
  "extractedData": {
    "documentNumber": "número do documento",
    "date": "data de emissão YYYY-MM-DD",
    "issuer": "nome COMPLETO do emissor (empresa que fatura)",
    "issuerNIF": "NIF do emissor (se visível)",
    "issuerAddress": "morada completa do emissor",
    "issuerCity": "cidade do emissor",
    "issuerPostalCode": "código postal do emissor",
    "issuerCountry": "país do emissor (PT, ES, etc)",
    "issuerEmail": "email do emissor",
    "issuerPhone": "telefone do emissor",
    "issuerIban": "IBAN do emissor",
    "issuerWebsite": "website do emissor",
    "recipient": "nome COMPLETO do destinatário (quem paga)",
    "recipientNIF": "NIF do destinatário (se visível)",
    "recipientAddress": "morada do destinatário",
    "recipientCity": "cidade do destinatário",
    "recipientPostalCode": "código postal do destinatário",
    "recipientCountry": "país do destinatário",
    "totalAmount": valor_total_numérico,
    "currency": "EUR",
    "invoiceNumber": "número da fatura",
    "dueDate": "data de vencimento YYYY-MM-DD",
    "taxAmount": valor_iva_numérico,
    "subtotal": subtotal_sem_iva,
    "paymentStatus": "paid|pending|partial",
    "paymentMethod": "Multibanco|Transferência Bancária|Dinheiro|MB WAY|Cartão|outro",
    "paymentDate": "data de pagamento YYYY-MM-DD (se pago)",
    "items": [
      {
        "description": "descrição EXATA do produto/serviço",
        "quantity": quantidade_numérica,
        "unitPrice": preço_unitário_numérico,
        "amount": total_da_linha,
        "discount": desconto_aplicado,
        "productCode": "código do produto (se visível)"
      }
    ],
    "notes": "observações relevantes"
  },
  "confidence": número_0_a_100,
  "suggestedAction": "ex: 'Criar fatura paga de fornecedor', 'Registar fatura pendente'"
}

REGRAS FISCAIS PORTUGAL:
- "Fatura-Recibo" = documento JÁ PAGO (paymentStatus: "paid")
- "Fatura" = documento PENDENTE (paymentStatus: "pending")
- "Recibo" = comprovativo de pagamento separado
- Extrai NIF sempre que visível
- Valores numéricos SEM moeda, só números
- Se há tabela de produtos/serviços, extrai TODAS as linhas

⚠️ VALIDAÇÃO OBRIGATÓRIA:
- Subtotal + IVA DEVE = Total (com margem de ±0.50€ para arredondamentos)
- Soma dos items.amount DEVE ≈ totalAmount
- Se não consegues ver claramente um valor, usa null - NÃO INVENTES!
- Se não há items listados, items = null (não cries items fictícios)`;
  }

  /**
   * JSON Schema for OpenAI Responses API
   */
  private getResponseSchema(): any {
    return {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          enum: [
            'invoice',
            'contract',
            'receipt',
            'purchase_order',
            'quotation',
            'delivery_note',
            'credit_note',
            'other',
          ],
        },
        documentTypeLabel: { type: 'string' },
        documentSubType: {
          type: 'string',
          enum: ['invoice', 'invoice_receipt', 'receipt', 'credit_note', 'other'],
        },
        confidence: { type: 'number' },
        extractedData: {
          type: 'object',
          properties: {
            documentNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuer: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerNIF: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerAddress: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerCity: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerPostalCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerCountry: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerEmail: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerPhone: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerIban: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            issuerWebsite: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            recipient: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            recipientNIF: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            recipientAddress: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            recipientCity: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            recipientPostalCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            recipientCountry: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            totalAmount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            currency: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            invoiceNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            dueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            taxAmount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            subtotal: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            paymentStatus: {
              anyOf: [
                { type: 'string', enum: ['paid', 'pending', 'partial'] },
                { type: 'null' },
              ],
            },
            paymentMethod: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            paymentDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            items: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      quantity: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      unitPrice: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      amount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      discount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      productCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    },
                    required: ['description', 'quantity', 'unitPrice', 'amount', 'discount', 'productCode'],
                    additionalProperties: false,
                  },
                },
                { type: 'null' },
              ],
            },
            notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
          required: [
            'documentNumber',
            'date',
            'issuer',
            'issuerNIF',
            'issuerAddress',
            'issuerCity',
            'issuerPostalCode',
            'issuerCountry',
            'issuerEmail',
            'issuerPhone',
            'issuerIban',
            'issuerWebsite',
            'recipient',
            'recipientNIF',
            'recipientAddress',
            'recipientCity',
            'recipientPostalCode',
            'recipientCountry',
            'totalAmount',
            'currency',
            'invoiceNumber',
            'dueDate',
            'taxAmount',
            'subtotal',
            'paymentStatus',
            'paymentMethod',
            'paymentDate',
            'items',
            'notes',
          ],
          additionalProperties: false,
        },
        rawText: { type: 'string' },
        suggestedAction: { type: 'string' },
      },
      required: [
        'documentType',
        'documentTypeLabel',
        'documentSubType',
        'confidence',
        'extractedData',
        'rawText',
        'suggestedAction',
      ],
      additionalProperties: false,
    };
  }

  /**
   * Helper: Add timeout to promise
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMsg: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
      ),
    ]);
  }
}
