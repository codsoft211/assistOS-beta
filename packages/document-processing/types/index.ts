/**
 * Common types for document processing
 */

export type DocumentType = 
  | 'invoice'
  | 'receipt'
  | 'credit_note'
  | 'debit_note'
  | 'purchase_order'
  | 'quotation'
  | 'delivery_note'
  | 'contract'
  | 'other';

export type ProcessorName = 
  | 'google-document-ai-invoice'
  | 'google-document-ai-receipt'
  | 'google-document-ai-po'
  | 'google-document-ai-contract'
  | 'openai-vision-generic'
  | 'tesseract-ocr';

export interface ProcessingContext {
  tenantId: string;
  userId: string;
  sessionId?: string;
  environment?: 'production' | 'sandbox';
}

export interface QuickClassificationResult {
  documentType: DocumentType;
  confidence: number; // 0-100
  indicators: string[]; // What triggered this classification
}

export interface ProcessedDocument {
  // Document metadata
  documentType: DocumentType;
  documentSubType?: string; // 'invoice_receipt', 'credit_note', etc
  documentTypeLabel: string; // 'Fatura-Recibo', 'Invoice', etc
  
  // Extracted data
  extractedData: ExtractedDocumentData;
  
  // Processing metadata
  processorUsed: ProcessorName;
  processingTimeMs: number;
  confidence: number; // 0-100
  rawText?: string;
  rawResponse?: any; // Original processor response (for debugging)
  
  // AI suggestions
  message?: string;
  suggestedAction?: string;
}

export interface ExtractedDocumentData {
  // Common fields
  documentNumber?: string | null;
  date?: string | null; // YYYY-MM-DD
  
  // Supplier (emissor)
  issuer?: string | null;
  issuerNIF?: string | null;
  issuerAddress?: string | null;
  issuerCity?: string | null;
  issuerPostalCode?: string | null;
  issuerCountry?: string | null;
  issuerEmail?: string | null;
  issuerPhone?: string | null;
  issuerIban?: string | null;
  issuerWebsite?: string | null;
  
  // Receiver (destinatário)
  recipient?: string | null;
  recipientNIF?: string | null;
  recipientAddress?: string | null;
  recipientCity?: string | null;
  recipientPostalCode?: string | null;
  recipientCountry?: string | null;
  
  // Amounts
  totalAmount?: number | null;
  currency?: string | null;
  taxAmount?: number | null;
  subtotal?: number | null;
  netAmount?: number | null;
  amountDue?: number | null;
  
  // Invoice specific
  invoiceNumber?: string | null;
  invoiceType?: string | null; // 'invoice', 'credit_note', 'debit_note'
  dueDate?: string | null;
  
  // Payment info
  paymentStatus?: 'paid' | 'pending' | 'partial' | 'overdue' | null;
  paymentMethod?: string | null;
  paymentDate?: string | null;
  paymentTerms?: string | null;
  
  // Line items
  items?: DocumentLineItem[] | null;
  
  // VAT breakdown
  vatBreakdown?: VATBreakdownItem[] | null;
  
  // Other
  notes?: string | null;
  purchaseOrder?: string | null;
}

export interface DocumentLineItem {
  description: string;
  quantity?: number | null;
  unit?: string | null; // 'un', 'kg', 'h', etc
  unitPrice?: number | null;
  amount?: number | null;
  netAmount?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  discount?: number | null;
  productCode?: string | null;
}

export interface VATBreakdownItem {
  taxRate: number;
  taxableAmount: number;
  taxAmount: number;
  categoryCode?: string | null;
}
