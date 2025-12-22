// Migrated from AssistOS legacy - Phase 4.6
// Document processing with AI routes

import { Router } from "express";
import { db } from "../db";
import { z } from "zod";
import { uploadRateLimiter } from "../middleware/rate-limit";
import { fileAttachments, documentClassifications } from "shared/schema";
import { eq, and } from "drizzle-orm";
import { AssistDOCSOrchestrator } from "../../../packages/ai/agents/assistdocs/assistdocs-orchestrator";
import { processorRegistry } from "../../../packages/document-processing/registry/ProcessorRegistry";
import type { ProcessedDocument } from "../../../packages/document-processing/types";
import { getFileBuffer } from "../services/file-storage.service";

const router = Router();

const analyzeDocumentSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  analysisType: z.enum(["classify", "extract", "summarize", "ocr", "compare"]).optional(),
  options: z.record(z.any()).optional(),
});

const classifyDocumentSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
});

const extractDocumentSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  documentType: z.string().optional(),
});

const ocrDocumentSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  language: z.string().optional().default("pt"),
});

/**
 * Helper: Store document analysis results in documentClassifications table
 * 
 * NOTE: This function is currently disabled because documentClassifications.documentId
 * references documents.id (from document management module), not fileAttachments.id.
 * To enable storage:
 * 1. Create a document entry in documents table first
 * 2. Then link the classification to that document
 * 
 * For now, we return analysis results directly without persisting to DB.
 */
async function storeClassificationResult(
  documentId: string,
  tenantId: string,
  environment: string,
  userId: string,
  processedDoc: ProcessedDocument
): Promise<string | null> {
  // TODO: Implement proper integration with documents table
  // Currently skipped because documentClassifications requires documents.id (not fileAttachments.id)
  console.log("[Document Analysis] Skipping DB storage (requires documents table integration)");
  return null;
  
  /* Original implementation - requires documents table integration
  try {
    const [classification] = await db.insert(documentClassifications).values({
      documentId,
      tenantId,
      environment,
      status: "completed",
      detectedType: processedDoc.documentType,
      confidence: processedDoc.confidence / 100, // Convert 0-100 to 0-1
      extractedText: processedDoc.rawText,
      extractedData: {
        invoiceNumber: processedDoc.extractedData?.invoiceNumber || processedDoc.extractedData?.documentNumber,
        supplierName: processedDoc.extractedData?.issuer,
        supplierNif: processedDoc.extractedData?.issuerNIF,
        clientName: processedDoc.extractedData?.recipient,
        clientNif: processedDoc.extractedData?.recipientNIF,
        totalAmount: processedDoc.extractedData?.totalAmount,
        currency: processedDoc.extractedData?.currency,
        issueDate: processedDoc.extractedData?.date,
        dueDate: processedDoc.extractedData?.dueDate,
        lineItems: processedDoc.extractedData?.items,
        ...processedDoc.extractedData,
      },
      processingTimeMs: processedDoc.processingTimeMs,
      classifiedBy: userId,
    }).returning({ id: documentClassifications.id });

    return classification.id;
  } catch (error) {
    console.error("[Document Analysis] Failed to store classification result:", error);
    throw error;
  }
  */
}

/**
 * Helper: Get file from fileAttachments table
 */
async function getFileAttachment(fileId: string, tenantId: string, environment: string) {
  const [attachment] = await db
    .select()
    .from(fileAttachments)
    .where(and(
      eq(fileAttachments.id, fileId),
      eq(fileAttachments.tenantId, tenantId),
      eq(fileAttachments.environment, environment)
    ));

  if (!attachment) {
    throw new Error(`File ${fileId} not found`);
  }

  return attachment;
}

/**
 * POST /api/document-analysis/analyze
 * Analyze a document using AI (full analysis: classification + extraction + OCR)
 */
router.post("/analyze", uploadRateLimiter, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || "production";

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const analysisRequest = analyzeDocumentSchema.parse(req.body);

    // 1. Fetch file from fileAttachments table
    const attachment = await getFileAttachment(analysisRequest.fileId, tenantId, environment);

    // 2. Validate file type
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!supportedTypes.includes(attachment.mimeType)) {
      return res.status(400).json({
        error: "Unsupported file type",
        message: `File type ${attachment.mimeType} is not supported. Supported types: ${supportedTypes.join(', ')}`
      });
    }

    // 3. Read file from storage (Supabase, local, or GCS)
    const fileBuffer = await getFileBuffer(attachment);

    // 4. Process using AssistDOCS Orchestrator (handles Google AI → OpenAI Vision fallback)
    const orchestrator = new AssistDOCSOrchestrator();
    const result = await orchestrator.analyzeDocument({
      fileBuffer,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
      tenantId,
      userId,
    });

    if (!result.success || !result.document) {
      return res.status(500).json({
        error: "Document analysis failed",
        message: result.error || "Unknown error during document processing"
      });
    }

    const processedDoc = result.document;

    // 5. Store results in documentClassifications table
    const classificationId = await storeClassificationResult(
      analysisRequest.fileId,
      tenantId,
      environment,
      userId,
      processedDoc
    );

    // 6. Return full analysis results
    res.json({
      success: true,
      classificationId,
      fileId: analysisRequest.fileId,
      documentType: processedDoc.documentType,
      documentSubType: processedDoc.documentSubType,
      documentTypeLabel: processedDoc.documentTypeLabel,
      confidence: processedDoc.confidence,
      extractedData: processedDoc.extractedData,
      rawText: processedDoc.rawText?.substring(0, 1000), // Limit raw text in response
      processorUsed: processedDoc.processorUsed,
      processingTimeMs: processedDoc.processingTimeMs,
      message: processedDoc.message,
      suggestedAction: processedDoc.suggestedAction,
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error analyzing document:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors
      });
    }
    res.status(500).json({
      error: "Failed to analyze document",
      details: error.message
    });
  }
});

/**
 * POST /api/document-analysis/classify
 * Classify document type only (invoice, contract, receipt, etc.)
 * Faster than full analysis - just returns document type and confidence
 */
router.post("/classify", uploadRateLimiter, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || "production";

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { fileId } = classifyDocumentSchema.parse(req.body);

    // 1. Fetch file
    const attachment = await getFileAttachment(fileId, tenantId, environment);

    // 2. Validate file type
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!supportedTypes.includes(attachment.mimeType)) {
      return res.status(400).json({
        error: "Unsupported file type",
        message: `File type ${attachment.mimeType} is not supported`
      });
    }

    // 3. Read file from storage (Supabase, local, or GCS)
    const fileBuffer = await getFileBuffer(attachment);

    // 4. Process document (classification is part of full analysis)
    const orchestrator = new AssistDOCSOrchestrator();
    const result = await orchestrator.analyzeDocument({
      fileBuffer,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
      tenantId,
      userId,
    });

    if (!result.success || !result.document) {
      return res.status(500).json({
        error: "Document classification failed",
        message: result.error || "Unknown error during classification"
      });
    }

    const processedDoc = result.document;

    // 5. Store minimal classification result
    const classificationId = await storeClassificationResult(
      fileId,
      tenantId,
      environment,
      userId,
      processedDoc
    );

    // 6. Return classification only
    res.json({
      success: true,
      classificationId,
      fileId,
      classification: processedDoc.documentType,
      documentTypeLabel: processedDoc.documentTypeLabel,
      documentSubType: processedDoc.documentSubType,
      confidence: processedDoc.confidence,
      suggestedTags: [
        processedDoc.documentType,
        processedDoc.documentSubType,
        processedDoc.extractedData?.paymentStatus,
      ].filter(Boolean),
      processorUsed: processedDoc.processorUsed,
      message: `Documento classificado como: ${processedDoc.documentTypeLabel}`
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error classifying document:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors
      });
    }
    res.status(500).json({
      error: "Failed to classify document",
      details: error.message
    });
  }
});

/**
 * POST /api/document-analysis/extract
 * Extract structured data from document (invoices, receipts, forms)
 * Returns detailed extracted fields
 */
router.post("/extract", uploadRateLimiter, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || "production";

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { fileId, documentType } = extractDocumentSchema.parse(req.body);

    // 1. Fetch file
    const attachment = await getFileAttachment(fileId, tenantId, environment);

    // 2. Validate file type
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!supportedTypes.includes(attachment.mimeType)) {
      return res.status(400).json({
        error: "Unsupported file type",
        message: `File type ${attachment.mimeType} is not supported`
      });
    }

    // 3. Read file from storage (Supabase, local, or GCS)
    const fileBuffer = await getFileBuffer(attachment);

    // 4. Process document to extract structured data
    const orchestrator = new AssistDOCSOrchestrator();
    const result = await orchestrator.analyzeDocument({
      fileBuffer,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
      documentTypeHint: documentType as any,
      tenantId,
      userId,
    });

    if (!result.success || !result.document) {
      return res.status(500).json({
        error: "Data extraction failed",
        message: result.error || "Unknown error during extraction"
      });
    }

    const processedDoc = result.document;

    // 5. Store extraction result
    const classificationId = await storeClassificationResult(
      fileId,
      tenantId,
      environment,
      userId,
      processedDoc
    );

    // 6. Return extracted data with detailed field breakdown
    res.json({
      success: true,
      classificationId,
      fileId,
      documentType: processedDoc.documentType,
      extractedData: processedDoc.extractedData,
      confidence: processedDoc.confidence,
      processorUsed: processedDoc.processorUsed,
      fields: {
        // Invoice/Receipt fields
        documentNumber: processedDoc.extractedData?.documentNumber || processedDoc.extractedData?.invoiceNumber,
        issueDate: processedDoc.extractedData?.date,
        dueDate: processedDoc.extractedData?.dueDate,
        
        // Parties
        issuer: processedDoc.extractedData?.issuer,
        issuerNIF: processedDoc.extractedData?.issuerNIF,
        recipient: processedDoc.extractedData?.recipient,
        recipientNIF: processedDoc.extractedData?.recipientNIF,
        
        // Financial
        subtotal: processedDoc.extractedData?.subtotal,
        taxAmount: processedDoc.extractedData?.taxAmount,
        totalAmount: processedDoc.extractedData?.totalAmount,
        currency: processedDoc.extractedData?.currency,
        vatBreakdown: processedDoc.extractedData?.vatBreakdown, // Contains tax rates per bracket
        
        // Payment
        paymentStatus: processedDoc.extractedData?.paymentStatus,
        paymentMethod: processedDoc.extractedData?.paymentMethod,
        paymentDate: processedDoc.extractedData?.paymentDate,
        
        // Line items
        items: processedDoc.extractedData?.items,
        itemCount: processedDoc.extractedData?.items?.length || 0,
        
        // Additional data
        notes: processedDoc.extractedData?.notes,
      },
      message: `Dados extraídos com ${processedDoc.confidence}% de confiança`
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error extracting data:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors
      });
    }
    res.status(500).json({
      error: "Failed to extract data",
      details: error.message
    });
  }
});

/**
 * POST /api/document-analysis/ocr
 * Perform OCR on image or scanned PDF (text extraction only)
 * Returns raw extracted text without structured data parsing
 */
router.post("/ocr", uploadRateLimiter, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || "production";

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { fileId, language } = ocrDocumentSchema.parse(req.body);

    // 1. Fetch file
    const attachment = await getFileAttachment(fileId, tenantId, environment);

    // 2. Validate file type
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!supportedTypes.includes(attachment.mimeType)) {
      return res.status(400).json({
        error: "Unsupported file type",
        message: `File type ${attachment.mimeType} is not supported for OCR`
      });
    }

    // 3. Read file from storage (Supabase, local, or GCS)
    const fileBuffer = await getFileBuffer(attachment);

    // 4. Process document (OCR is part of full analysis)
    const orchestrator = new AssistDOCSOrchestrator();
    const result = await orchestrator.analyzeDocument({
      fileBuffer,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
      tenantId,
      userId,
    });

    if (!result.success || !result.document) {
      return res.status(500).json({
        error: "OCR failed",
        message: result.error || "Unknown error during OCR processing"
      });
    }

    const processedDoc = result.document;

    // 5. Store OCR result
    const classificationId = await storeClassificationResult(
      fileId,
      tenantId,
      environment,
      userId,
      processedDoc
    );

    // 6. Return extracted text with metadata
    res.json({
      success: true,
      classificationId,
      fileId,
      text: processedDoc.rawText,
      textLength: processedDoc.rawText?.length || 0,
      confidence: processedDoc.confidence,
      processorUsed: processedDoc.processorUsed,
      language: language,
      metadata: {
        documentType: processedDoc.documentType,
        hasStructuredData: !!processedDoc.extractedData,
        processingTimeMs: processedDoc.processingTimeMs,
      },
      message: `Texto extraído com sucesso (${processedDoc.rawText?.length || 0} caracteres)`
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error performing OCR:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors
      });
    }
    res.status(500).json({
      error: "Failed to perform OCR",
      details: error.message
    });
  }
});

/**
 * POST /api/document-analysis/summarize
 * Generate AI summary of document
 */
router.post("/summarize", uploadRateLimiter, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { fileId, maxLength } = req.body;

    // TODO: Fetch file from storage
    // TODO: Extract text content
    // TODO: Use AI to generate summary
    // TODO: Support different summary lengths (short, medium, detailed)
    // TODO: Extract key points

    res.json({
      fileId,
      summary: "",
      keyPoints: [],
      message: "Document summarization not yet implemented - AI services pending migration"
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error summarizing document:", error);
    res.status(500).json({
      error: "Failed to summarize document",
      details: error.message
    });
  }
});

/**
 * POST /api/document-analysis/compare
 * Compare two documents and highlight differences
 */
router.post("/compare", uploadRateLimiter, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { fileId1, fileId2 } = req.body;

    // TODO: Fetch both files from storage
    // TODO: Extract text from both
    // TODO: Perform diff comparison
    // TODO: Highlight additions, deletions, modifications
    // TODO: Use AI to identify semantic differences (not just text)

    res.json({
      fileId1,
      fileId2,
      differences: [],
      message: "Document comparison not yet implemented - diff service pending migration"
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error comparing documents:", error);
    res.status(500).json({
      error: "Failed to compare documents",
      details: error.message
    });
  }
});

/**
 * GET /api/document-analysis/history
 * Get document analysis history
 */
router.get("/history", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || "production";

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Query documentClassifications table for history
    const history = await db
      .select()
      .from(documentClassifications)
      .where(and(
        eq(documentClassifications.tenantId, tenantId),
        eq(documentClassifications.environment, environment)
      ))
      .orderBy(documentClassifications.createdAt)
      .limit(100);

    res.json({
      success: true,
      history: history.map(item => ({
        id: item.id,
        documentId: item.documentId,
        documentType: item.detectedType,
        confidence: item.confidence,
        status: item.status,
        processingTimeMs: item.processingTimeMs,
        createdAt: item.createdAt,
        hasExtractedData: !!item.extractedData,
      })),
      total: history.length,
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error fetching history:", error);
    res.status(500).json({
      error: "Failed to fetch history",
      details: error.message
    });
  }
});

/**
 * GET /api/document-analysis/status
 * Get processor status (for diagnostics)
 */
router.get("/status", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const status = await processorRegistry.getProcessorsStatus();

    res.json({
      success: true,
      processors: status,
      availableProcessors: status.filter(p => p.available).length,
      totalProcessors: status.length,
    });
  } catch (error: any) {
    console.error("[Document Analysis API] Error fetching processor status:", error);
    res.status(500).json({
      error: "Failed to fetch processor status",
      details: error.message
    });
  }
});

export default router;
