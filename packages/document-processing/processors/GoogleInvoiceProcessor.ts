import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import {
  DocumentType,
  ProcessedDocument,
  ProcessingContext,
  ProcessorName,
  ExtractedDocumentData,
  DocumentLineItem,
  VATBreakdownItem,
} from '../types';
import { GoogleDocumentAIConnector } from '../../connectors/google-document-ai';

/**
 * Google Invoice Processor
 * 
 * Specialized processor for invoices using Google Document AI Invoice Parser.
 * Extracts 67 structured fields with high accuracy.
 * 
 * Priority: Highest (most accurate for invoices)
 */
export class GoogleInvoiceProcessor implements IDocumentProcessor {
  name: ProcessorName = 'google-document-ai-invoice';
  supportedTypes: DocumentType[] = ['invoice', 'credit_note', 'receipt'];
  priority: number = 100; // Highest priority

  canProcess(documentType: DocumentType, mimeType: string): boolean {
    const supportedTypes: DocumentType[] = ['invoice', 'credit_note', 'receipt'];
    const supportedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];

    return supportedTypes.includes(documentType) && supportedMimeTypes.includes(mimeType);
  }

  async isAvailable(): Promise<boolean> {
    const configRaw = process.env.Google_Invoice_Parser;
    
    if (!configRaw) {
      return false;
    }

    try {
      let config: any;
      
      try {
        const decoded = Buffer.from(configRaw, 'base64').toString('utf-8');
        config = JSON.parse(decoded);
      } catch {
        config = JSON.parse(configRaw);
      }

      return !!(config.projectId && config.processorId && config.serviceAccountKey);
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<{
    available: boolean;
    reason?: string;
  }> {
    const configRaw = process.env.Google_Invoice_Parser;

    if (!configRaw) {
      return {
        available: false,
        reason: 'Google Document AI platform secret not configured (Google_Invoice_Parser)',
      };
    }

    try {
      let config: any;
      
      try {
        const decoded = Buffer.from(configRaw, 'base64').toString('utf-8');
        config = JSON.parse(decoded);
      } catch {
        config = JSON.parse(configRaw);
      }

      const isValid = !!(config.projectId && config.processorId && config.serviceAccountKey);

      return {
        available: isValid,
        reason: isValid
          ? undefined
          : 'Google_Invoice_Parser secret is missing required fields',
      };
    } catch (error) {
      return {
        available: false,
        reason: `Invalid Google_Invoice_Parser secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async process(
    fileBuffer: Buffer,
    mimeType: string,
    context: ProcessingContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();

    try {
      onProgress?.(5, 'Verificando configuração Google Document AI...');

      const configRaw = process.env.Google_Invoice_Parser;

      if (!configRaw) {
        throw new Error(
          'Google Document AI not configured at platform level. Missing secret: Google_Invoice_Parser'
        );
      }

      let config: any;
      try {
        const decoded = Buffer.from(configRaw, 'base64').toString('utf-8');
        config = JSON.parse(decoded);
      } catch {
        try {
          config = JSON.parse(configRaw);
        } catch (error) {
          throw new Error('Google_Invoice_Parser secret must be valid JSON or base64-encoded JSON');
        }
      }

      const { projectId, processorId, serviceAccountKey, location = 'eu' } = config;

      if (!projectId || !processorId || !serviceAccountKey) {
        throw new Error(
          'Google_Invoice_Parser secret is missing required fields: projectId, processorId, or serviceAccountKey'
        );
      }

      const fullProcessorId = processorId.includes('/')
        ? processorId
        : `projects/${projectId}/locations/${location}/processors/${processorId}`;

      onProgress?.(10, 'Inicializando Google Document AI...');

      const connector = new GoogleDocumentAIConnector();
      await connector.configure(
        {
          projectId,
          location,
          processorId: fullProcessorId,
          serviceAccountKey,
        },
        {
          tenantId: context.tenantId,
          userId: context.userId,
          connectorId: 'platform-google-document-ai',
        }
      );

      onProgress?.(20, 'Processando fatura com Google Invoice Parser...');

      const result = await connector.processDocument(fileBuffer, { mimeType });

      onProgress?.(80, 'Normalizando dados extraídos...');

      const extractedData = this.normalizeGoogleResponse(result);
      const processingTimeMs = Date.now() - startTime;

      onProgress?.(95, 'Processamento concluído');

      console.log(
        `[GoogleInvoiceProcessor] Processed invoice in ${(processingTimeMs / 1000).toFixed(1)}s`
      );
      console.log(
        `[GoogleInvoiceProcessor] Extracted: ${extractedData.issuerNIF} → ${extractedData.totalAmount}€`
      );

      await connector.disconnect();

      return {
        documentType: this.determineDocumentType(extractedData),
        documentSubType: this.determineDocumentSubType(result.entities),
        documentTypeLabel: this.determineDocumentLabel(result.entities),
        extractedData,
        processorUsed: this.name,
        processingTimeMs,
        confidence: this.calculateConfidence(result.entities),
        rawText: result.text,
        message: `Fatura processada com Google Document AI`,
        suggestedAction: this.determineSuggestedAction(extractedData),
        rawResponse: result,
      };
    } catch (error) {
      console.error('[GoogleInvoiceProcessor] Processing failed:', error);
      throw error;
    }
  }

  /**
   * Normalize Google Document AI response to AssistOS format
   */
  private normalizeGoogleResponse(result: any): ExtractedDocumentData {
    const entities = result.entities || [];
    const entityMap = new Map<string, any>();

    entities.forEach((entity: any) => {
      entityMap.set(entity.type, entity);
    });

    const getEntityValue = (type: string): string | null => {
      const entity = entityMap.get(type);
      return entity ? entity.value : null;
    };

    const getEntityNumber = (type: string): number | null => {
      const value = getEntityValue(type);
      if (!value) return null;
      return this.parsePortugueseNumber(value);
    };

    const supplierNIF = getEntityValue('supplier_tax_id');
    const supplierName = getEntityValue('supplier_name');
    const supplierAddress = getEntityValue('supplier_address');
    const supplierCity = getEntityValue('supplier_city');
    const supplierPostalCode = getEntityValue('supplier_postal_code');
    const supplierCountry = getEntityValue('supplier_country');
    const supplierEmail = getEntityValue('supplier_email');
    const supplierPhone = getEntityValue('supplier_phone');
    const supplierIban = getEntityValue('supplier_iban');
    const supplierWebsite = getEntityValue('supplier_website');

    const receiverNIF = getEntityValue('receiver_tax_id');
    const receiverName = getEntityValue('receiver_name');
    const receiverAddress = getEntityValue('receiver_address');
    const receiverCity = getEntityValue('receiver_city');
    const receiverPostalCode = getEntityValue('receiver_postal_code');
    const receiverCountry = getEntityValue('receiver_country');

    const invoiceNumber = getEntityValue('invoice_id');
    const invoiceDate = getEntityValue('invoice_date');
    const dueDate = getEntityValue('due_date');
    const paymentDate = getEntityValue('payment_date');

    const totalAmount = getEntityNumber('total_amount');
    const currency = getEntityValue('currency') || 'EUR';
    const netAmount = getEntityNumber('net_amount');
    const taxAmount = getEntityNumber('total_tax_amount');
    const subtotal = netAmount || (totalAmount && taxAmount ? totalAmount - taxAmount : null);

    const paymentMethod = getEntityValue('payment_method');
    const paymentTerms = getEntityValue('payment_terms');

    const lineItems = this.extractLineItems(result.tables || []);

    return {
      documentNumber: invoiceNumber,
      date: this.normalizeDate(invoiceDate),
      issuer: supplierName,
      issuerNIF: supplierNIF,
      issuerAddress: supplierAddress,
      issuerCity: supplierCity,
      issuerPostalCode: supplierPostalCode,
      issuerCountry: supplierCountry,
      issuerEmail: supplierEmail,
      issuerPhone: supplierPhone,
      issuerIban: supplierIban,
      issuerWebsite: supplierWebsite,
      recipient: receiverName,
      recipientNIF: receiverNIF,
      recipientAddress: receiverAddress,
      recipientCity: receiverCity,
      recipientPostalCode: receiverPostalCode,
      recipientCountry: receiverCountry,
      totalAmount,
      currency,
      taxAmount,
      subtotal,
      netAmount,
      amountDue: totalAmount,
      invoiceNumber,
      invoiceType: 'invoice',
      dueDate: this.normalizeDate(dueDate),
      paymentStatus: paymentDate ? 'paid' : 'pending',
      paymentMethod,
      paymentDate: this.normalizeDate(paymentDate),
      paymentTerms,
      items: lineItems,
      vatBreakdown: null,
      notes: null,
      purchaseOrder: null,
    };
  }

  /**
   * Extract line items from Google Document AI tables
   */
  private extractLineItems(tables: any[]): DocumentLineItem[] | null {
    if (!tables || tables.length === 0) {
      return null;
    }

    const items: DocumentLineItem[] = [];

    for (const table of tables) {
      if (!table.data || table.data.length === 0) {
        continue;
      }

      const headers = table.data[0] || [];
      const headerLower = headers.map((h: string) =>
        h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      );

      const descIndex = headerLower.findIndex((h: string) =>
        h.includes('descri') || h.includes('produto') || h.includes('artigo')
      );
      const qtyIndex = headerLower.findIndex((h: string) =>
        h.includes('qtd') || h.includes('quant')
      );
      const unitPriceIndex = headerLower.findIndex((h: string) =>
        h.includes('preco') || h.includes('unit')
      );
      const amountIndex = headerLower.findIndex((h: string) =>
        h.includes('total') || h.includes('valor')
      );
      const productCodeIndex = headerLower.findIndex((h: string) =>
        h.includes('codigo') || h.includes('ref')
      );

      for (let i = 1; i < table.data.length; i++) {
        const row = table.data[i] || [];

        const description = descIndex >= 0 ? row[descIndex] : row[0] || '';
        if (!description || description.trim() === '') {
          continue;
        }

        const quantity = qtyIndex >= 0 ? this.parseNumber(row[qtyIndex]) : null;
        const unitPrice = unitPriceIndex >= 0 ? this.parseNumber(row[unitPriceIndex]) : null;
        const amount = amountIndex >= 0 ? this.parseNumber(row[amountIndex]) : null;
        const productCode = productCodeIndex >= 0 ? row[productCodeIndex] : null;

        items.push({
          description: description.trim(),
          quantity,
          unit: null,
          unitPrice,
          amount,
          netAmount: null,
          taxRate: null,
          taxAmount: null,
          discount: null,
          productCode,
        });
      }
    }

    return items.length > 0 ? items : null;
  }

  /**
   * Normalize date to YYYY-MM-DD format
   */
  private normalizeDate(dateStr: string | null): string | null {
    if (!dateStr) return null;

    const cleaned = dateStr.replace(/[^\d\/\-\.]/g, '').trim();
    if (!cleaned) return null;

    try {
      const parts = cleaned.split(/[\/\-\.]/);
      if (parts.length !== 3) return null;

      let year: string, month: string, day: string;

      if (parts[0].length === 4) {
        [year, month, day] = parts;
      } else {
        [day, month, year] = parts;
      }

      if (year.length === 2) {
        year = (parseInt(year) > 50 ? '19' : '20') + year;
      }

      const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (isNaN(date.getTime())) return null;

      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch {
      return null;
    }
  }

  /**
   * Parse number from string with Portuguese format support
   * Portuguese format: 1.234,56 (dot as thousands separator, comma as decimal)
   * International format: 1,234.56 (comma as thousands separator, dot as decimal)
   */
  private parseNumber(value: string): number | null {
    if (!value) return null;
    return this.parsePortugueseNumber(value);
  }

  /**
   * Parse Portuguese number format
   * Handles: 1.234,56€ → 1234.56
   *          1,234.56€ → 1234.56
   *          1234.56   → 1234.56
   *          1234,56   → 1234.56
   */
  private parsePortugueseNumber(value: string): number | null {
    if (!value) return null;
    
    // Remove currency symbols and whitespace
    let cleaned = value.replace(/[€$£\s]/g, '').trim();
    if (!cleaned) return null;
    
    // Count dots and commas to determine format
    const dotCount = (cleaned.match(/\./g) || []).length;
    const commaCount = (cleaned.match(/,/g) || []).length;
    
    // Case 1: Portuguese format (1.234,56) - dot as thousands, comma as decimal
    // Indicators: comma after dot, or comma at decimal position, or multiple dots
    if (dotCount > 0 && commaCount === 1) {
      const commaPos = cleaned.lastIndexOf(',');
      const lastDotPos = cleaned.lastIndexOf('.');
      
      // If comma comes after the last dot, it's likely Portuguese format
      if (commaPos > lastDotPos) {
        // Convert Portuguese to international: remove dots, replace comma with dot
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      }
    }
    // Case 2: Only comma present (could be Portuguese decimal separator)
    else if (commaCount === 1 && dotCount === 0) {
      const commaPos = cleaned.indexOf(',');
      const afterComma = cleaned.substring(commaPos + 1);
      // If 1-2 digits after comma, treat as decimal separator
      if (afterComma.length <= 2) {
        cleaned = cleaned.replace(',', '.');
      }
    }
    // Case 3: Multiple dots (thousands separators in Portuguese format without decimal)
    else if (dotCount > 1 && commaCount === 0) {
      // Remove all dots (they are thousands separators)
      cleaned = cleaned.replace(/\./g, '');
    }
    // Case 4: Only dots or international format (1,234.56)
    // Just remove commas (thousands separators)
    else if (commaCount > 0 && dotCount <= 1) {
      const dotPos = cleaned.indexOf('.');
      const lastCommaPos = cleaned.lastIndexOf(',');
      
      // If dot comes after comma, it's international format
      if (dotPos > lastCommaPos) {
        cleaned = cleaned.replace(/,/g, '');
      }
    }
    
    // Remove any remaining non-numeric characters except dot and minus
    cleaned = cleaned.replace(/[^0-9.-]/g, '');
    
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Determine document type from extracted data
   */
  private determineDocumentType(data: ExtractedDocumentData): DocumentType {
    return 'invoice';
  }

  /**
   * Determine document sub-type from entities
   */
  private determineDocumentSubType(entities: any[]): string {
    const typeEntity = entities.find((e: any) => e.type === 'invoice_type');
    if (typeEntity?.value?.toLowerCase().includes('credit')) {
      return 'credit_note';
    }
    if (typeEntity?.value?.toLowerCase().includes('receipt')) {
      return 'invoice_receipt';
    }
    return 'invoice';
  }

  /**
   * Determine document label
   */
  private determineDocumentLabel(entities: any[]): string {
    const subType = this.determineDocumentSubType(entities);
    const labels: Record<string, string> = {
      invoice: 'Fatura',
      invoice_receipt: 'Fatura-Recibo',
      credit_note: 'Nota de Crédito',
      receipt: 'Recibo',
    };
    return labels[subType] || 'Fatura';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(entities: any[]): number {
    if (!entities || entities.length === 0) return 50;

    const criticalFields = [
      'supplier_name',
      'supplier_tax_id',
      'invoice_id',
      'invoice_date',
      'total_amount',
    ];

    const foundFields = criticalFields.filter((field) =>
      entities.some((e: any) => e.type === field && e.value)
    );

    const avgConfidence =
      entities.reduce((sum: number, e: any) => sum + (e.confidence || 0), 0) / entities.length;

    const fieldScore = (foundFields.length / criticalFields.length) * 50;
    const confidenceScore = avgConfidence * 50;

    return Math.round(fieldScore + confidenceScore);
  }

  /**
   * Determine suggested action
   */
  private determineSuggestedAction(data: ExtractedDocumentData): string {
    if (!data.issuerNIF) {
      return 'Revisar manualmente - NIF do fornecedor não encontrado';
    }

    if (data.paymentStatus === 'paid') {
      return 'Criar fatura paga de fornecedor';
    }

    return 'Criar fatura pendente de fornecedor';
  }
}
