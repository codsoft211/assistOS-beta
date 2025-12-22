import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { fileAttachments, companyInfo, tenants } from 'shared/schema';
import { eq, and } from 'drizzle-orm';
import { AssistDOCSOrchestrator } from '../../../agents/assistdocs/assistdocs-orchestrator';
import { getFileBuffer } from '../../../../../apps/api/services/file-storage.service';

// assistDOCS: Cross-module orchestrator for document analysis
// Uses ProcessorRegistry internally with Google Document AI (primary) + OpenAI Vision (fallback)

export class AnalyzeDocumentTool extends ToolBase {
  constructor() {
    super();
  }

  manifest: ToolManifest = {
    name: 'analyze_document',
    category: 'document_analysis' as const,
    scope: 'tenant' as const,
    description: 'Analisa documentos de negócio (faturas, contratos, recibos, POs) identificando automaticamente o tipo e extraindo dados estruturados',
    parameters: [
      {
        name: 'attachmentId',
        type: 'string',
        description: 'ID do anexo/documento a analisar',
        required: true
      }
    ],
    outputSchema: z.object({
      documentType: z.enum(['invoice', 'contract', 'receipt', 'purchase_order', 'quotation', 'delivery_note', 'other']),
      documentTypeLabel: z.string(),
      extractedData: z.object({
        // Campos comuns - nullable() permite null E undefined
        documentNumber: z.string().nullable().optional(),
        date: z.string().nullable().optional(), // YYYY-MM-DD
        issuer: z.string().nullable().optional(), // Fornecedor/Emissor
        issuerNIF: z.string().nullable().optional(), // NIF do emissor
        recipient: z.string().nullable().optional(), // Cliente/Destinatário
        recipientNIF: z.string().nullable().optional(), // NIF do destinatário
        totalAmount: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
        
        // Campos específicos de fatura
        invoiceNumber: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        taxAmount: z.number().nullable().optional(),
        subtotal: z.number().nullable().optional(),
        taxRate: z.number().nullable().optional(),
        paymentStatus: z.enum(['paid', 'pending', 'partial']).nullable().optional(),
        paymentMethod: z.string().nullable().optional(),
        paymentDate: z.string().nullable().optional(),
        items: z.array(z.object({
          description: z.string(),
          quantity: z.number().nullable().optional(),
          unitPrice: z.number().nullable().optional(),
          amount: z.number().nullable().optional()
        })).nullable().optional(),
        
        // Campos específicos de contrato
        parties: z.array(z.string()).nullable().optional(),
        validFrom: z.string().nullable().optional(),
        validUntil: z.string().nullable().optional(),
        contractValue: z.number().nullable().optional(),
        
        // Campos específicos de recibo
        paidBy: z.string().nullable().optional(),
        
        // Outros dados extraídos
        notes: z.string().nullable().optional(),
      }),
      confidence: z.number().min(0).max(100),
      rawText: z.string(),
      message: z.string(),
      suggestedAction: z.string().nullable().optional(),
      invoiceDirection: z.enum(['issued', 'received', 'unknown']).nullable().optional(),
      invoiceDirectionLabel: z.string().nullable().optional(),
      invoiceDirectionExplanation: z.string().nullable().optional()
    }),
    requiresAuth: true,
    progressSupport: true
  };

  async executeInternal(
    input: { attachmentId: string },
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ) {
    const startTime = Date.now();

    // 1. Buscar anexo na BD
    onProgress?.(0, '📥 A buscar ficheiro anexado...');
    const [attachment] = await db
      .select()
      .from(fileAttachments)
      .where(and(
        eq(fileAttachments.id, input.attachmentId),
        eq(fileAttachments.tenantId, context.tenantId)
      ));

    if (!attachment) {
      throw new Error(`Anexo ${input.attachmentId} não encontrado`);
    }

    // 2. Verificar se é imagem ou PDF
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!supportedTypes.includes(attachment.mimeType)) {
      throw new Error(`Tipo de arquivo não suportado para análise de documentos. Tipo: ${attachment.mimeType}`);
    }

    // 3. Ler arquivo do storage (Supabase, local, or GCS)
    onProgress?.(10, '📄 A ler ficheiro do storage...');
    const fileBuffer = await getFileBuffer(attachment);

    try {
      // 4. Fetch company info to determine invoice direction (AR vs AP)
      onProgress?.(15, '🏢 A verificar informações da empresa...');
      const [company] = await db
        .select()
        .from(companyInfo)
        .where(eq(companyInfo.tenantId, context.tenantId))
        .limit(1);
      
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);
      
      const companyNIF = company?.nif || null;
      const companyName = company?.name || company?.legalName || tenant?.name || null;
      
      console.log(`[AnalyzeDocumentTool] 🏢 Company NIF: ${companyNIF || 'Not configured'}, Name: ${companyName || 'Unknown'}`);

      // 5. Process using assistDOCS Orchestrator (cross-module agent)
      console.log(`[AnalyzeDocumentTool] 🚀 Delegating to assistDOCS orchestrator: ${attachment.originalName}`);
      
      const assistDOCS = new AssistDOCSOrchestrator();
      const result = await assistDOCS.analyzeDocument({
        fileBuffer,
        fileName: attachment.originalName,
        mimeType: attachment.mimeType,
        tenantId: context.tenantId,
        userId: context.userId
      }, onProgress);

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (!result.success || !result.document) {
        throw new Error(result.error || 'Falha ao processar documento');
      }
      
      const doc = result.document; // AnalyzeDocumentResponse wraps ProcessedDocument

      // Ensure document was returned
      if (!doc) {
        console.error('[AnalyzeDocumentTool] ❌ No document returned from analysis');
        throw new Error('Falha ao processar documento: nenhum resultado foi retornado pela análise');
      }

      console.log(`[AnalyzeDocumentTool] ✅ Document analyzed in ${processingTime}s using ${doc.processorUsed}`);
      console.log(`[AnalyzeDocumentTool] 📋 Type: ${doc.documentType}, SubType: ${doc.documentSubType || 'N/A'}, Status: ${doc.extractedData?.paymentStatus || 'N/A'}`);
      console.log(`[AnalyzeDocumentTool] 💰 Values: Subtotal=${doc.extractedData?.subtotal}, Tax=${doc.extractedData?.taxAmount}, Total=${doc.extractedData?.totalAmount}`);
      console.log(`[AnalyzeDocumentTool] 📦 Items extracted: ${doc.extractedData?.items?.length || 0}`);

      // 6. Determine invoice direction (AR vs AP) based on issuer NIF vs company NIF
      const invoiceDirectionResult = this.determineInvoiceDirection(
        doc.extractedData?.issuerNIF,
        doc.extractedData?.recipientNIF,
        doc.extractedData?.issuer,
        doc.extractedData?.recipient,
        companyNIF,
        companyName
      );
      
      console.log(`[AnalyzeDocumentTool] 📋 Invoice Direction: ${invoiceDirectionResult.direction} - ${invoiceDirectionResult.explanation}`);

      // 7. Build suggested action based on direction with EXPLICIT tool guidance
      let suggestedAction = doc.suggestedAction || null;
      if (doc.documentType === 'invoice' && invoiceDirectionResult.direction !== 'unknown') {
        if (invoiceDirectionResult.direction === 'issued') {
          suggestedAction = `⚠️ ATENÇÃO: Esta é uma fatura EMITIDA pela sua empresa (${companyName || 'Clever Ingredients'}) a um cliente (${doc.extractedData?.recipient || 'destinatário'}).
          
CATEGORIA: CONTAS A RECEBER (AR - Accounts Receivable)
AÇÃO CORRETA: Use a ferramenta "create_invoice" com invoiceType="receivable" e clientId do destinatário.
NÃO USE: "create_expense" ou "receive_invoice" (estas são para faturas de fornecedores/AP).

Esta fatura representa um DIREITO A RECEBER da sua empresa - o cliente ${doc.extractedData?.recipient || ''} deve pagar €${doc.extractedData?.totalAmount || '?'}.`;
        } else if (invoiceDirectionResult.direction === 'received') {
          suggestedAction = `Esta é uma fatura RECEBIDA de um fornecedor (${doc.extractedData?.issuer || 'emissor'}) para a sua empresa (${companyName || 'Clever Ingredients'}).
          
CATEGORIA: CONTAS A PAGAR (AP - Accounts Payable)
AÇÃO CORRETA: Use a ferramenta "create_expense" ou "receive_invoice" com supplierId do fornecedor.

Esta fatura representa uma OBRIGAÇÃO DE PAGAR - a sua empresa deve pagar €${doc.extractedData?.totalAmount || '?'} ao fornecedor ${doc.extractedData?.issuer || ''}.`;
        }
      }

      // 8. Map ProcessedDocument to tool output schema (backward compatible)
      return {
        documentType: doc.documentType,
        documentTypeLabel: doc.documentTypeLabel,
        extractedData: {
          documentNumber: doc.extractedData.documentNumber || null,
          date: doc.extractedData.date || null,
          issuer: doc.extractedData.issuer || null,
          issuerNIF: doc.extractedData.issuerNIF || null,
          recipient: doc.extractedData.recipient || null,
          recipientNIF: doc.extractedData.recipientNIF || null,
          totalAmount: doc.extractedData.totalAmount || null,
          currency: doc.extractedData.currency || null,
          
          invoiceNumber: doc.extractedData.invoiceNumber || null,
          dueDate: doc.extractedData.dueDate || null,
          taxAmount: doc.extractedData.taxAmount || null,
          subtotal: doc.extractedData.subtotal || null,
          taxRate: this.calculateTaxRate(
            doc.extractedData.subtotal,
            doc.extractedData.taxAmount
          ),
          paymentStatus: doc.extractedData.paymentStatus || null,
          paymentMethod: doc.extractedData.paymentMethod || null,
          paymentDate: doc.extractedData.paymentDate || null,
          
          items: doc.extractedData.items?.map((item: any) => ({
            description: item.description,
            quantity: item.quantity ?? null,
            unitPrice: item.unitPrice ?? null,
            amount: item.amount ?? null
          })) || null,
          
          parties: null,
          validFrom: null,
          validUntil: null,
          contractValue: null,
          paidBy: null,
          notes: doc.extractedData.notes || null,
        },
        confidence: doc.confidence,
        rawText: doc.rawText || '',
        message: doc.message || `Documento processado: ${doc.documentTypeLabel}`,
        suggestedAction,
        invoiceDirection: invoiceDirectionResult.direction,
        invoiceDirectionLabel: invoiceDirectionResult.label,
        invoiceDirectionExplanation: invoiceDirectionResult.explanation
      };

    } catch (processingError: any) {
      console.error(`[AnalyzeDocumentTool] ❌ Error processing document:`, processingError.message);
      
      // Preserve original error messages for user-facing errors
      if (processingError.message?.includes('timeout') || processingError.code === 'ETIMEDOUT') {
        throw new Error(`O processamento do documento excedeu o tempo limite de 2 minutos. O ficheiro pode ser demasiado grande ou complexo. Tenta com um ficheiro mais pequeno ou com melhor qualidade.`);
      }

      if (processingError.message?.includes('OPENAI_API_KEY')) {
        throw new Error('OPENAI_API_KEY não está configurada. Por favor, configure a chave de API da OpenAI.');
      }

      if (processingError.message?.includes('No processors available')) {
        throw new Error('Nenhum processador de documentos está disponível. Por favor, configure pelo menos um processador (OpenAI ou Google Document AI).');
      }
      
      throw new Error(`Falha ao processar documento: ${processingError.message}`);
    }
  }

  /**
   * Calculate tax rate from subtotal and tax amount
   * Helper to maintain backward compatibility with old schema
   */
  private calculateTaxRate(subtotal?: number | null, taxAmount?: number | null): number | null {
    if (!subtotal || !taxAmount || subtotal === 0) {
      return null;
    }
    return Math.round((taxAmount / subtotal) * 100);
  }

  /**
   * Determine if an invoice is issued (AR) or received (AP) based on NIF comparison
   * 
   * Logic:
   * - If issuerNIF matches companyNIF → Invoice was ISSUED by our company → AR (Accounts Receivable)
   * - If recipientNIF matches companyNIF → Invoice was RECEIVED from supplier → AP (Accounts Payable)
   * - If no NIF match but issuer name matches company → ISSUED
   * - If no NIF match but recipient name matches company → RECEIVED
   */
  private determineInvoiceDirection(
    issuerNIF: string | null | undefined,
    recipientNIF: string | null | undefined,
    issuerName: string | null | undefined,
    recipientName: string | null | undefined,
    companyNIF: string | null,
    companyName: string | null
  ): { direction: 'issued' | 'received' | 'unknown'; label: string; explanation: string } {
    
    // Normalize NIFs for comparison (remove spaces, dots, dashes, and country prefixes like PT)
    const normalizeNIF = (nif: string | null | undefined): string => {
      if (!nif) return '';
      // Remove spaces, dots, dashes
      let normalized = nif.replace(/[\s.\-]/g, '').toUpperCase();
      // Remove common country prefixes (PT for Portugal)
      if (normalized.startsWith('PT')) {
        normalized = normalized.substring(2);
      }
      return normalized;
    };

    // Normalize names for fuzzy comparison
    const normalizeName = (name: string | null | undefined): string => {
      if (!name) return '';
      return name.toLowerCase().trim();
    };

    const normalizedCompanyNIF = normalizeNIF(companyNIF);
    const normalizedIssuerNIF = normalizeNIF(issuerNIF);
    const normalizedRecipientNIF = normalizeNIF(recipientNIF);
    const normalizedCompanyName = normalizeName(companyName);
    const normalizedIssuerName = normalizeName(issuerName);
    const normalizedRecipientName = normalizeName(recipientName);

    // Priority 1: NIF-based matching (most reliable)
    if (normalizedCompanyNIF && normalizedIssuerNIF && normalizedCompanyNIF === normalizedIssuerNIF) {
      return {
        direction: 'issued',
        label: 'Fatura Emitida (AR)',
        explanation: `O NIF do emissor (${issuerNIF}) corresponde ao NIF da sua empresa. Esta é uma fatura que a sua empresa emitiu a um cliente.`
      };
    }

    if (normalizedCompanyNIF && normalizedRecipientNIF && normalizedCompanyNIF === normalizedRecipientNIF) {
      return {
        direction: 'received',
        label: 'Fatura Recebida (AP)',
        explanation: `O NIF do destinatário (${recipientNIF}) corresponde ao NIF da sua empresa. Esta é uma fatura que a sua empresa recebeu de um fornecedor.`
      };
    }

    // Priority 2: Name-based matching (fallback when NIFs don't match)
    if (normalizedCompanyName && normalizedIssuerName) {
      // Check if company name is contained in issuer name or vice versa
      if (normalizedIssuerName.includes(normalizedCompanyName) || normalizedCompanyName.includes(normalizedIssuerName)) {
        return {
          direction: 'issued',
          label: 'Fatura Emitida (AR)',
          explanation: `O nome do emissor ("${issuerName}") parece corresponder à sua empresa. Esta é provavelmente uma fatura que a sua empresa emitiu a um cliente.`
        };
      }
    }

    if (normalizedCompanyName && normalizedRecipientName) {
      // Check if company name is contained in recipient name or vice versa
      if (normalizedRecipientName.includes(normalizedCompanyName) || normalizedCompanyName.includes(normalizedRecipientName)) {
        return {
          direction: 'received',
          label: 'Fatura Recebida (AP)',
          explanation: `O nome do destinatário ("${recipientName}") parece corresponder à sua empresa. Esta é provavelmente uma fatura que a sua empresa recebeu de um fornecedor.`
        };
      }
    }

    // Cannot determine direction
    return {
      direction: 'unknown',
      label: 'Direção Desconhecida',
      explanation: companyNIF 
        ? `Não foi possível determinar automaticamente se esta fatura foi emitida ou recebida. O NIF da empresa (${companyNIF}) não corresponde nem ao emissor (${issuerNIF || 'não extraído'}) nem ao destinatário (${recipientNIF || 'não extraído'}).`
        : `Configure o NIF da sua empresa nas definições para que possamos determinar automaticamente se as faturas são emitidas ou recebidas.`
    };
  }
}
