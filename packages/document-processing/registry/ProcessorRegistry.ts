import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import { 
  DocumentType, 
  ProcessedDocument, 
  ProcessingContext,
  ProcessorName 
} from '../types';
import { QuickClassifier } from './QuickClassifier';

/**
 * Processor Registry
 * 
 * Central registry for all document processors.
 * Responsibilities:
 * 1. Quick classification to determine document type
 * 2. Select best available processor
 * 3. Automatic fallback if primary processor fails
 * 4. Progress tracking across processors
 */
export class ProcessorRegistry {
  private processors: Map<ProcessorName, IDocumentProcessor> = new Map();
  private classifier: QuickClassifier = new QuickClassifier();

  /**
   * Register a processor
   */
  register(processor: IDocumentProcessor): void {
    this.processors.set(processor.name, processor);
    console.log(`[ProcessorRegistry] Registered processor: ${processor.name}`);
  }

  /**
   * Unregister a processor
   */
  unregister(name: ProcessorName): void {
    this.processors.delete(name);
    console.log(`[ProcessorRegistry] Unregistered processor: ${name}`);
  }

  /**
   * Get all registered processors
   */
  getAll(): IDocumentProcessor[] {
    return Array.from(this.processors.values());
  }

  /**
   * Process document with automatic processor selection and fallback
   * 
   * Flow:
   * 1. Quick classify (1-2s) to determine document type
   * 2. Find available processors for that type (priority order)
   * 3. Try primary processor
   * 4. If fails, try next available processor
   * 5. Return processed document or throw error
   */
  async process(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    context: ProcessingContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();

    try {
      // Step 1: Quick classification
      onProgress?.(5, 'Classificando documento...');
      const classification = await this.classifier.classify(
        fileBuffer,
        fileName,
        mimeType
      );

      console.log(`[ProcessorRegistry] Quick classification result:`, classification);
      onProgress?.(15, `Documento identificado: ${classification.documentType} (${classification.confidence}% confiança)`);

      // Step 2: Get available processors for this document type
      const availableProcessors = await this.getAvailableProcessors(
        classification.documentType,
        mimeType
      );

      if (availableProcessors.length === 0) {
        throw new Error(
          `No processors available for document type: ${classification.documentType}`
        );
      }

      console.log(
        `[ProcessorRegistry] Found ${availableProcessors.length} available processors:`,
        availableProcessors.map(p => p.name)
      );

      // Step 3: Try processors in priority order
      let lastError: Error | null = null;

      for (let i = 0; i < availableProcessors.length; i++) {
        const processor = availableProcessors[i];
        
        try {
          onProgress?.(
            20 + (i * 10),
            `Processando com ${processor.name}...`
          );

          console.log(`[ProcessorRegistry] Trying processor: ${processor.name}`);

          const result = await processor.process(
            fileBuffer,
            mimeType,
            context,
            (progress, message) => {
              // Map processor progress (0-100) to registry progress (20-90)
              const mappedProgress = 20 + Math.round(progress * 0.7);
              onProgress?.(mappedProgress, message);
            }
          );

          onProgress?.(95, 'Processamento concluído');

          console.log(
            `[ProcessorRegistry] Successfully processed with ${processor.name} in ${Date.now() - startTime}ms`
          );

          return result;

        } catch (error) {
          lastError = error as Error;
          console.error(
            `[ProcessorRegistry] Processor ${processor.name} failed:`,
            error
          );

          // If not last processor, try next one
          if (i < availableProcessors.length - 1) {
            onProgress?.(
              20 + ((i + 1) * 10),
              `${processor.name} falhou, tentando alternativa...`
            );
            continue;
          }
        }
      }

      // All processors failed
      throw new Error(
        `All processors failed. Last error: ${lastError?.message || 'Unknown error'}`
      );

    } catch (error) {
      console.error('[ProcessorRegistry] Processing failed:', error);
      throw error;
    }
  }

  /**
   * Get available processors for a document type, sorted by priority
   */
  private async getAvailableProcessors(
    documentType: DocumentType,
    mimeType: string
  ): Promise<IDocumentProcessor[]> {
    const candidates: IDocumentProcessor[] = [];

    for (const processor of Array.from(this.processors.values())) {
      // Check if processor can handle this type
      if (!processor.canProcess(documentType, mimeType)) {
        continue;
      }

      // Check if processor is available (has credentials, etc)
      const isAvailable = await processor.isAvailable();
      if (!isAvailable) {
        console.warn(
          `[ProcessorRegistry] Processor ${processor.name} is not available`
        );
        continue;
      }

      candidates.push(processor);
    }

    // Sort by priority (highest first)
    candidates.sort((a, b) => b.priority - a.priority);

    return candidates;
  }

  /**
   * Get status of all processors
   */
  async getProcessorsStatus(): Promise<
    Array<{
      name: ProcessorName;
      supportedTypes: DocumentType[];
      priority: number;
      available: boolean;
      reason?: string;
    }>
  > {
    const statuses = [];

    for (const processor of Array.from(this.processors.values())) {
      const status = await processor.getStatus();
      statuses.push({
        name: processor.name,
        supportedTypes: processor.supportedTypes,
        priority: processor.priority,
        available: status.available,
        reason: status.reason,
      });
    }

    return statuses;
  }
}

// Global singleton instance
export const processorRegistry = new ProcessorRegistry();
