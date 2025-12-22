/**
 * Document Processing Package
 * 
 * Provides specialized document processors for different document types:
 * - Google Document AI (invoice, receipt, PO)
 * - OpenAI Vision (generic fallback)
 * - Tesseract OCR (free fallback)
 */

export * from './interfaces/IDocumentProcessor';
export * from './types';
export { ProcessorRegistry, processorRegistry } from './registry/ProcessorRegistry';
export { OpenAIVisionProcessor } from './processors/OpenAIVisionProcessor';
export { GoogleInvoiceProcessor } from './processors/GoogleInvoiceProcessor';
