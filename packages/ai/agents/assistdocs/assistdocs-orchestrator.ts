import { processorRegistry } from '../../../document-processing/registry/ProcessorRegistry';
import type { ProcessedDocument } from '../../../document-processing/types';

interface AnalyzeDocumentRequest {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  documentTypeHint?: 'invoice' | 'receipt' | 'credit_note' | 'auto';
  tenantId: string;
  userId: string;
}

interface AnalyzeDocumentResponse {
  success: boolean;
  document?: ProcessedDocument;
  error?: string;
  processingTimeMs?: number;
}

/**
 * assistDOCS Orchestrator
 * 
 * Cross-module orchestrator specialized in document analysis and OCR.
 * Handles all fiscal documents (invoices, receipts, credit notes, etc).
 * 
 * Usage:
 * - Sync: Called by assistME tool `analyze_document` for immediate chat responses
 * - Async: Called by event queue for batch processing (emails, SFTP, etc)
 * 
 * Architecture:
 * - Delegates to ProcessorRegistry (Google Document AI primary, OpenAI Vision fallback)
 * - Returns structured data ready for human-in-the-loop validation
 * - Publishes events for async workflows
 */
export class AssistDOCSOrchestrator {
  /**
   * Analyze document and extract structured data
   * 
   * @param request - Document analysis request
   * @param onProgress - Progress callback for real-time updates (optional)
   * @returns Processed document with extracted data
   */
  async analyzeDocument(
    request: AnalyzeDocumentRequest,
    onProgress?: (progress: number, message: string) => void
  ): Promise<AnalyzeDocumentResponse> {
    const startTime = Date.now();

    try {
      console.log(`[assistDOCS] 📄 Starting document analysis for tenant ${request.tenantId}`);
      console.log(`[assistDOCS]   File: ${request.fileName} (${request.mimeType})`);
      console.log(`[assistDOCS]   Type hint: ${request.documentTypeHint || 'auto'}`);

      onProgress?.(0, 'Iniciando análise de documento...');

      // Process document through ProcessorRegistry
      // Registry will:
      // 1. Quick classify document type (1-2s)
      // 2. Select best available processor (Google AI or OpenAI)
      // 3. Extract structured data
      // 4. Automatic fallback if primary processor fails
      const processedDocument = await processorRegistry.process(
        request.fileBuffer,
        request.fileName,
        request.mimeType,
        {
          tenantId: request.tenantId,
          userId: request.userId,
        },
        onProgress
      );

      const processingTimeMs = Date.now() - startTime;

      console.log(`[assistDOCS] ✅ Document analyzed successfully in ${(processingTimeMs / 1000).toFixed(1)}s`);
      console.log(`[assistDOCS]   Type: ${processedDocument.documentType}`);
      console.log(`[assistDOCS]   Processor: ${processedDocument.processorUsed}`);
      console.log(`[assistDOCS]   Confidence: ${processedDocument.confidence}%`);

      onProgress?.(100, 'Análise concluída');

      return {
        success: true,
        document: processedDocument,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      console.error('[assistDOCS] ❌ Document analysis failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during document analysis',
        processingTimeMs,
      };
    }
  }

  /**
   * Get processor status (for diagnostics)
   */
  async getProcessorStatus(): Promise<any> {
    return processorRegistry.getProcessorsStatus();
  }

  /**
   * Batch analyze multiple documents (async workflow)
   * Future implementation for email/SFTP pipelines
   */
  async batchAnalyze(
    requests: AnalyzeDocumentRequest[],
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<AnalyzeDocumentResponse[]> {
    console.log(`[assistDOCS] 🔄 Starting batch analysis of ${requests.length} documents`);

    const results: AnalyzeDocumentResponse[] = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      
      onProgress?.(i + 1, requests.length, `Processando documento ${i + 1}/${requests.length}: ${request.fileName}`);

      const result = await this.analyzeDocument(request);
      results.push(result);
    }

    console.log(`[assistDOCS] ✅ Batch analysis complete: ${results.filter(r => r.success).length}/${requests.length} successful`);

    return results;
  }
}
