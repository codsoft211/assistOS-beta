import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import {
  DocumentType,
  ProcessedDocument,
  ProcessingContext,
  ProcessorName,
  ExtractedDocumentData,
} from '../types';
import { GoogleDocumentAIConnector } from '../../connectors/google-document-ai';

/**
 * Google Contract Processor
 * 
 * Specialized processor for contracts using Google Document AI Custom Extractor.
 * Extracts key contract fields with high accuracy.
 * 
 * Priority: Highest (most accurate for contracts)
 */
export class GoogleContractProcessor implements IDocumentProcessor {
  name: ProcessorName = 'google-document-ai-contract';
  supportedTypes: DocumentType[] = ['contract'];
  priority: number = 100; // Highest priority

  canProcess(documentType: DocumentType, mimeType: string): boolean {
    const supportedTypes: DocumentType[] = ['contract'];
    const supportedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];

    return supportedTypes.includes(documentType) && supportedMimeTypes.includes(mimeType);
  }

  async isAvailable(): Promise<boolean> {
    const projectId = process.env.GOOGLE_CONTRACT_PARSER_PROJECT_ID;
    const processorId = process.env.GOOGLE_CONTRACT_PARSER_PROCESSOR_ID;
    const serviceAccount = process.env.GOOGLE_CONTRACT_PARSER_SERVICE_ACCOUNT;
    
    return !!(projectId && processorId && serviceAccount);
  }

  async getStatus(): Promise<{
    available: boolean;
    reason?: string;
  }> {
    const projectId = process.env.GOOGLE_CONTRACT_PARSER_PROJECT_ID;
    const processorId = process.env.GOOGLE_CONTRACT_PARSER_PROCESSOR_ID;
    const serviceAccount = process.env.GOOGLE_CONTRACT_PARSER_SERVICE_ACCOUNT;

    if (!projectId || !processorId || !serviceAccount) {
      const missing = [];
      if (!projectId) missing.push('GOOGLE_CONTRACT_PARSER_PROJECT_ID');
      if (!processorId) missing.push('GOOGLE_CONTRACT_PARSER_PROCESSOR_ID');
      if (!serviceAccount) missing.push('GOOGLE_CONTRACT_PARSER_SERVICE_ACCOUNT');
      
      return {
        available: false,
        reason: `Missing environment variables: ${missing.join(', ')}`,
      };
    }

    return {
      available: true,
    };
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

      const projectId = process.env.GOOGLE_CONTRACT_PARSER_PROJECT_ID;
      const processorId = process.env.GOOGLE_CONTRACT_PARSER_PROCESSOR_ID;
      const serviceAccountRaw = process.env.GOOGLE_CONTRACT_PARSER_SERVICE_ACCOUNT;

      if (!projectId || !processorId || !serviceAccountRaw) {
        throw new Error(
          'Google Document AI not configured. Missing environment variables: GOOGLE_CONTRACT_PARSER_PROJECT_ID, GOOGLE_CONTRACT_PARSER_PROCESSOR_ID, GOOGLE_CONTRACT_PARSER_SERVICE_ACCOUNT'
        );
      }

      let serviceAccountKey: any;
      try {
        serviceAccountKey = JSON.parse(serviceAccountRaw);
      } catch (error) {
        throw new Error('GOOGLE_CONTRACT_PARSER_SERVICE_ACCOUNT must be valid JSON');
      }

      const location = 'eu';
      const fullProcessorId = processorId.includes('/')
        ? processorId
        : `projects/${projectId}/locations/${location}/processors/${processorId}`;

      onProgress?.(15, 'Inicializando Google Document AI Contract Processor...');

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
          connectorId: 'platform-google-document-ai-contract',
        }
      );

      onProgress?.(30, 'Processando contrato com Google Document AI...');

      const result = await connector.processDocument(fileBuffer, {
        mimeType,
        processorId: fullProcessorId,
      });

      onProgress?.(70, 'Extraindo dados estruturados do contrato...');

      const extractedData = this.parseContractEntities(result);

      onProgress?.(95, 'Finalizando processamento...');

      const processingTime = Date.now() - startTime;

      onProgress?.(100, 'Contrato processado com sucesso!');

      return {
        documentType: 'contract',
        documentSubType: 'service_contract',
        documentTypeLabel: 'Contrato',
        extractedData,
        processorUsed: this.name,
        processingTimeMs: processingTime,
        confidence: this.calculateConfidence(result.entities),
        rawText: result.text,
        rawResponse: result,
        message: `Contrato processado com sucesso. Encontrados ${result.entities.length} campos.`,
        suggestedAction: 'Revise os dados extraídos e confirme a criação do contrato.',
      };
    } catch (error) {
      console.error('[GoogleContractProcessor] Processing failed:', error);
      throw new Error(
        `Failed to process contract: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private parseContractEntities(result: {
    text: string;
    entities: Array<{ type: string; value: string; confidence: number }>;
    tables?: Array<{ rows: number; columns: number; data: string[][] }>;
  }): ExtractedDocumentData {
    const entities = result.entities;

    const data: ExtractedDocumentData & {
      contractParties?: string[];
      supplierName?: string;
      clientName?: string;
      contractValue?: number;
      startDate?: string;
      endDate?: string;
      renewalDate?: string;
      autoRenewal?: boolean;
      paymentTerms?: string;
      contractType?: string;
      description?: string;
      [key: string]: any;
    } = {};

    for (const entity of entities) {
      const { type, value, confidence } = entity;

      if (confidence < 0.5) continue;

      switch (type.toLowerCase()) {
        case 'contract_parties':
        case 'parties':
          data.contractParties = value.split(',').map(p => p.trim());
          break;

        case 'supplier_name':
        case 'supplier':
        case 'vendor':
          data.supplierName = value;
          data.issuer = value;
          break;

        case 'client_name':
        case 'client':
        case 'customer':
          data.clientName = value;
          data.recipient = value;
          break;

        case 'contract_value':
        case 'total_amount':
        case 'value':
          const numericValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numericValue)) {
            data.contractValue = numericValue;
            data.totalAmount = numericValue;
          }
          break;

        case 'currency':
          data.currency = value.toUpperCase();
          break;

        case 'start_date':
        case 'effective_date':
          data.startDate = this.normalizeDate(value);
          data.date = data.startDate;
          break;

        case 'end_date':
        case 'expiry_date':
        case 'termination_date':
          data.endDate = this.normalizeDate(value);
          break;

        case 'renewal_date':
          data.renewalDate = this.normalizeDate(value);
          break;

        case 'auto_renewal':
        case 'automatic_renewal':
          data.autoRenewal = value.toLowerCase().includes('sim') || 
                             value.toLowerCase().includes('yes') ||
                             value.toLowerCase().includes('automatic');
          break;

        case 'payment_terms':
        case 'payment_conditions':
          data.paymentTerms = value;
          break;

        case 'contract_number':
        case 'document_number':
          data.documentNumber = value;
          break;

        case 'contract_type':
        case 'type':
          data.contractType = value;
          break;

        case 'description':
        case 'scope':
        case 'services':
          data.description = value;
          data.notes = value;
          break;

        case 'supplier_nif':
        case 'supplier_tax_id':
        case 'vendor_nif':
          data.issuerNIF = value;
          break;

        case 'client_nif':
        case 'customer_tax_id':
          data.recipientNIF = value;
          break;

        case 'supplier_address':
        case 'vendor_address':
          data.issuerAddress = value;
          break;

        case 'client_address':
        case 'customer_address':
          data.recipientAddress = value;
          break;
      }
    }

    if (!data.currency) {
      if (result.text.includes('€') || result.text.includes('EUR')) {
        data.currency = 'EUR';
      } else if (result.text.includes('$') || result.text.includes('USD')) {
        data.currency = 'USD';
      }
    }

    return data;
  }

  private normalizeDate(dateStr: string): string {
    try {
      const cleaned = dateStr.replace(/[^\d\/\-\.]/g, '');
      
      const parts = cleaned.split(/[\/\-\.]/);
      
      if (parts.length === 3) {
        let day: string, month: string, year: string;

        if (parts[2].length === 4) {
          [day, month, year] = parts;
        } else if (parts[0].length === 4) {
          [year, month, day] = parts;
        } else {
          [day, month, year] = parts;
          if (year.length === 2) {
            year = '20' + year;
          }
        }

        const paddedMonth = month.padStart(2, '0');
        const paddedDay = day.padStart(2, '0');

        return `${year}-${paddedMonth}-${paddedDay}`;
      }

      return dateStr;
    } catch (error) {
      console.warn('[GoogleContractProcessor] Failed to normalize date:', dateStr, error);
      return dateStr;
    }
  }

  private calculateConfidence(entities: Array<{ type: string; value: string; confidence: number }>): number {
    if (entities.length === 0) return 0;

    const relevantTypes = [
      'contract_parties', 'supplier_name', 'client_name', 'contract_value',
      'start_date', 'end_date', 'payment_terms', 'contract_number'
    ];

    const relevantEntities = entities.filter(e => 
      relevantTypes.some(type => e.type.toLowerCase().includes(type.toLowerCase()))
    );

    if (relevantEntities.length === 0) return 30;

    const avgConfidence = relevantEntities.reduce((sum, e) => sum + e.confidence, 0) / relevantEntities.length;

    return Math.round(avgConfidence * 100);
  }
}
