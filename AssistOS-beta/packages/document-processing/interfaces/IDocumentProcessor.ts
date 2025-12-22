import { 
  DocumentType, 
  ProcessedDocument, 
  ProcessingContext,
  ProcessorName 
} from '../types';

/**
 * Base interface for all document processors
 * 
 * Each processor is responsible for:
 * 1. Processing a specific type of document (invoice, receipt, etc)
 * 2. Extracting structured data
 * 3. Returning normalized ProcessedDocument
 */
export interface IDocumentProcessor {
  /**
   * Unique name identifying this processor
   */
  name: ProcessorName;
  
  /**
   * Document types this processor can handle
   */
  supportedTypes: DocumentType[];
  
  /**
   * Priority level (higher = preferred)
   * Used by registry to choose between multiple processors
   */
  priority: number;
  
  /**
   * Check if this processor can handle a specific document type
   */
  canProcess(documentType: DocumentType, mimeType: string): boolean;
  
  /**
   * Process the document and extract structured data
   * 
   * @param fileBuffer - Raw file buffer
   * @param mimeType - MIME type of the file
   * @param context - Processing context (tenant, user)
   * @param onProgress - Optional progress callback (0-100, message)
   * @returns Processed document with extracted data
   */
  process(
    fileBuffer: Buffer,
    mimeType: string,
    context: ProcessingContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ProcessedDocument>;
  
  /**
   * Check if processor is available (has credentials, etc)
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get processor configuration/status
   */
  getStatus(): Promise<{
    available: boolean;
    reason?: string;
    lastError?: string;
  }>;
}
