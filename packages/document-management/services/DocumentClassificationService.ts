/**
 * Document Classification Service
 * 
 * AI-powered classification and data extraction service using OCR and OpenAI.
 * Reuses the InvoiceOCRService from ComprasModule for invoice processing.
 * 
 * @example
 * ```typescript
 * const service = new DocumentClassificationService();
 * 
 * // Classify a document
 * const classification = await service.classifyDocument('doc-123');
 * 
 * // Search similar documents
 * const similar = await service.searchSimilar('tenant-123', 'invoice from supplier X', 5);
 * ```
 */

import OpenAI from 'openai';
import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../../../apps/api/db';
import {
  documents,
  documentClassifications,
  documentEmbeddings,
  SelectDocument,
  SelectDocumentClassification,
  InsertDocumentClassification,
  InsertDocumentEmbedding,
  DocumentType,
  ClassificationStatus,
} from '../../../shared/schema';
import { extractInvoiceData } from '../../modules/compras/services/invoice-ocr.service';
import { DocumentStorageService } from './DocumentStorageService';
import { creditUsageService } from '../../services/credit-usage';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class ClassificationError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(`Classification failed: ${message}`);
    this.name = 'ClassificationError';
  }
}

export class EmbeddingError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(`Embedding generation failed: ${message}`);
    this.name = 'EmbeddingError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ClassificationResult {
  classificationId: string;
  status: ClassificationStatus;
  detectedType?: DocumentType;
  confidence?: number;
  extractedData?: any;
  insights?: Array<{
    type: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    actionable: boolean;
  }>;
}

export interface SimilarDocument {
  documentId: string;
  document: SelectDocument;
  similarity: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OpenAI Client
// ═══════════════════════════════════════════════════════════════════════════════

let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openaiClient;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentClassificationService {
  private storageService: DocumentStorageService;

  constructor() {
    this.storageService = new DocumentStorageService();
  }

  /**
   * Classify a document using OCR and AI
   * 
   * @param documentId - Document ID to classify
   * @returns Classification result
   * 
   * @example
   * ```typescript
   * const result = await service.classifyDocument('doc-123');
   * console.log(result.detectedType); // 'invoice'
   * console.log(result.extractedData?.invoiceNumber); // 'INV-12345'
   * ```
   */
  async classifyDocument(documentId: string): Promise<ClassificationResult> {
    const startTime = Date.now();

    try {
      // 1. Get document
      const document = await this.storageService.getDocument(documentId);

      // 2. Create classification record with status 'processing'
      const [classification] = await db.insert(documentClassifications).values({
        documentId,
        versionId: document.currentVersionId,
        tenantId: document.tenantId,
        status: 'processing',
      }).returning();

      try {
        // 3. Download document file
        const fileBuffer = await this.storageService.downloadDocument(documentId, document.uploadedBy!);

        // 4. Extract text and data based on document type
        let extractedText = '';
        let extractedData: any = {};
        let detectedType: DocumentType = document.documentType;
        let confidence = 0.5;
        let insights: any[] = [];

        // For PDFs and images, use OCR
        if (document.mimeType.includes('pdf') || document.mimeType.includes('image')) {
          // Write buffer to temp file for OCR service
          const fs = await import('fs');
          const path = await import('path');
          const tempDir = path.join(process.cwd(), 'uploads', 'temp');
          
          // Ensure temp directory exists
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const tempFilePath = path.join(tempDir, `${documentId}-${document.filename}`);
          fs.writeFileSync(tempFilePath, fileBuffer);

          try {
            // Use InvoiceOCRService
            const ocrResult = await extractInvoiceData({
              filePath: tempFilePath,
              tenantId: document.tenantId,
              userId: document.uploadedBy || 'system',
              environment: (document.environment as 'production' | 'sandbox') || 'production',
            });

            if (ocrResult.success && ocrResult.data) {
              extractedText = JSON.stringify(ocrResult.data);
              extractedData = ocrResult.data;
              detectedType = 'invoice';
              confidence = ocrResult.data.confidence;

              // Generate insights
              insights = this.generateInsights(ocrResult.data);
            }
          } finally {
            // Cleanup temp file
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          }
        }

        // 5. Update classification with results
        const processingTime = Date.now() - startTime;

        const [updatedClassification] = await db
          .update(documentClassifications)
          .set({
            status: 'completed',
            detectedType,
            confidence,
            extractedText,
            extractedData,
            insights,
            processingTimeMs: processingTime,
            updatedAt: new Date(),
          })
          .where(eq(documentClassifications.id, classification.id))
          .returning();

        console.log(`[Classification] Document classified: ${documentId} as ${detectedType} (${Math.round(confidence * 100)}% confidence)`);

        return {
          classificationId: classification.id,
          status: 'completed',
          detectedType,
          confidence,
          extractedData,
          insights,
        };
      } catch (error: any) {
        // Mark classification as failed
        await db
          .update(documentClassifications)
          .set({
            status: 'failed',
            errorMessage: error.message,
            processingTimeMs: Date.now() - startTime,
            updatedAt: new Date(),
          })
          .where(eq(documentClassifications.id, classification.id));

        throw error;
      }
    } catch (error: any) {
      console.error('[Classification] Error:', error);
      throw new ClassificationError(error.message, error);
    }
  }

  /**
   * Extract structured data from a document
   * 
   * @param documentId - Document ID
   * @returns Extracted structured data
   */
  async extractStructuredData(documentId: string): Promise<any> {
    try {
      // Get latest classification
      const [classification] = await db
        .select()
        .from(documentClassifications)
        .where(
          and(
            eq(documentClassifications.documentId, documentId),
            eq(documentClassifications.status, 'completed')
          )
        )
        .orderBy(desc(documentClassifications.createdAt))
        .limit(1);

      if (!classification) {
        // Run classification first
        const result = await this.classifyDocument(documentId);
        return result.extractedData;
      }

      return classification.extractedData;
    } catch (error: any) {
      console.error('[Classification] Extract structured data failed:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for document text
   * 
   * @param documentId - Document ID
   * @param text - Text to embed
   * @returns Embedding vector
   * 
   * @example
   * ```typescript
   * const embedding = await service.generateEmbedding('doc-123', 'Invoice from Supplier X');
   * ```
   */
  async generateEmbedding(documentId: string, text: string): Promise<number[]> {
    try {
      const openai = getOpenAIClient();
      const document = await this.storageService.getDocument(documentId);

      if (!document) {
        throw new EmbeddingError(`Document ${documentId} not found`);
      }

      const tenantId = document.tenantId;
      const environment = (document.environment as 'production' | 'sandbox') || 'production';
      const userId = document.uploadedBy || 'system';

      // Generate embedding using text-embedding-3-small (1536 dimensions)
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000), // Limit to 8000 chars
      });

      const embedding = response.data[0].embedding;

      if (response.usage) {
        const promptTokens =
          response.usage.prompt_tokens ??
          response.usage.total_tokens ??
          0;
        if (promptTokens > 0) {
          try {
            await creditUsageService.trackUsageAndDeductCredits({
              tenantId,
              userId,
              provider: 'openai',
              service: 'text-embedding-3-small',
              unitsConsumed: promptTokens,
              unitType: 'input_tokens_1k',
              environment,
              metadata: {
                operation: 'document_embedding_generation',
                documentId,
              },
            });
          } catch (error) {
            console.error('[DocumentClassification] Failed to track embedding credits:', error);
          }
        }
      }

      // Store embedding in database
      await db.insert(documentEmbeddings).values({
        documentId,
        tenantId: document.tenantId,
        embedding: JSON.stringify(embedding),
        embeddingSource: 'extracted_text',
      });

      console.log(`[Classification] Embedding generated for document ${documentId}`);
      return embedding;
    } catch (error: any) {
      console.error('[Classification] Generate embedding failed:', error);
      throw new EmbeddingError(error.message, error);
    }
  }

  /**
   * Search for similar documents using semantic search
   * 
   * @param tenantId - Tenant ID
   * @param query - Search query
   * @param limit - Maximum number of results
   * @returns Array of similar documents
   * 
   * @example
   * ```typescript
   * const similar = await service.searchSimilar('tenant-123', 'invoice from supplier X', 5);
   * ```
   */
  async searchSimilar(
    tenantId: string,
    query: string,
    limit: number = 10,
    options?: { userId?: string; environment?: 'production' | 'sandbox' }
  ): Promise<SimilarDocument[]> {
    try {
      const openai = getOpenAIClient();
      const userId = options?.userId || 'system';
      const environment = options?.environment || 'production';

      // 1. Generate embedding for query
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });

      const queryEmbedding = response.data[0].embedding;

      if (response.usage) {
        const promptTokens =
          response.usage.prompt_tokens ??
          response.usage.total_tokens ??
          0;
        if (promptTokens > 0) {
          try {
            await creditUsageService.trackUsageAndDeductCredits({
              tenantId,
              userId,
              provider: 'openai',
              service: 'text-embedding-3-small',
              unitsConsumed: promptTokens,
              unitType: 'input_tokens_1k',
              environment,
              metadata: {
                operation: 'document_query_embedding',
              },
            });
          } catch (error) {
            console.error('[DocumentClassification] Failed to track query embedding credits:', error);
          }
        }
      }

      // 2. Get all document embeddings for tenant
      const embeddings = await db
        .select()
        .from(documentEmbeddings)
        .where(eq(documentEmbeddings.tenantId, tenantId));

      // 3. Calculate cosine similarity for each
      const similarities = embeddings.map((emb) => {
        const docEmbedding = JSON.parse(emb.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);

        return {
          documentId: emb.documentId,
          similarity,
        };
      });

      // 4. Sort by similarity and get top results
      const topResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      // 5. Get document details
      const results: SimilarDocument[] = [];
      for (const result of topResults) {
        const document = await this.storageService.getDocument(result.documentId);
        results.push({
          documentId: result.documentId,
          document,
          similarity: result.similarity,
        });
      }

      console.log(`[Classification] Semantic search completed: ${results.length} results`);
      return results;
    } catch (error: any) {
      console.error('[Classification] Search similar failed:', error);
      throw error;
    }
  }

  /**
   * Retry a failed classification
   * 
   * @param classificationId - Classification ID to retry
   * @returns New classification result
   */
  async retryClassification(classificationId: string): Promise<ClassificationResult> {
    try {
      // Get classification
      const [classification] = await db
        .select()
        .from(documentClassifications)
        .where(eq(documentClassifications.id, classificationId));

      if (!classification) {
        throw new Error(`Classification not found: ${classificationId}`);
      }

      // Retry by running classification again
      return await this.classifyDocument(classification.documentId);
    } catch (error: any) {
      console.error('[Classification] Retry failed:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Generate insights from extracted data
   */
  private generateInsights(extractedData: any): Array<{
    type: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    actionable: boolean;
  }> {
    const insights: any[] = [];

    // Check for missing required fields
    if (!extractedData.invoiceNumber) {
      insights.push({
        type: 'missing_data',
        severity: 'warning',
        message: 'Invoice number not detected',
        actionable: true,
      });
    }

    if (!extractedData.supplierName) {
      insights.push({
        type: 'missing_data',
        severity: 'warning',
        message: 'Supplier name not detected',
        actionable: true,
      });
    }

    if (!extractedData.totalAmount) {
      insights.push({
        type: 'missing_data',
        severity: 'error',
        message: 'Total amount not detected',
        actionable: true,
      });
    }

    // Check confidence level
    if (extractedData.confidence < 0.7) {
      insights.push({
        type: 'low_confidence',
        severity: 'warning',
        message: `Low confidence in data extraction (${Math.round(extractedData.confidence * 100)}%)`,
        actionable: true,
      });
    }

    // Add success message if all good
    if (insights.length === 0) {
      insights.push({
        type: 'success',
        severity: 'info',
        message: 'All required fields extracted successfully',
        actionable: false,
      });
    }

    return insights;
  }
}
