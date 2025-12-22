import { db } from '../../db';
import { contractSubmissions, crmContracts } from '../../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { processorRegistry } from '../../../../packages/document-processing/registry/ProcessorRegistry';
import type { ProcessedDocument } from '../../../../packages/document-processing/types';

/**
 * Contract Submission Service
 * 
 * Handles the full lifecycle of contract submissions:
 * 1. Upload → Create submission record
 * 2. Processing → Trigger OCR via GoogleContractProcessor
 * 3. Review → Human-in-the-loop validation
 * 4. Approval → Create final CRM contract
 */
export class ContractSubmissionService {
  /**
   * Create a new contract submission record after file upload
   */
  async createSubmission(params: {
    tenantId: string;
    userId: string;
    fileName: string;
    fileUrl: string;
    fileMimeType: string;
    fileSize: number;
    environment: 'development' | 'production';
  }) {
    const [submission] = await db
      .insert(contractSubmissions)
      .values({
        tenantId: params.tenantId,
        environment: params.environment,
        fileName: params.fileName,
        fileUrl: params.fileUrl,
        fileMimeType: params.fileMimeType,
        fileSize: params.fileSize,
        status: 'uploaded',
        uploadedBy: params.userId,
      })
      .returning();

    return submission;
  }

  /**
   * Trigger OCR processing for a submission
   * This should be called by a background worker for heavy processing
   */
  async triggerProcessing(params: {
    submissionId: string;
    tenantId: string;
    userId: string;
    fileBuffer: Buffer;
    mimeType: string;
    onProgress?: (progress: number, message: string) => void;
  }): Promise<ProcessedDocument> {
    const { submissionId, tenantId, userId, fileBuffer, mimeType, onProgress } = params;

    try {
      await db
        .update(contractSubmissions)
        .set({ status: 'processing' })
        .where(
          and(
            eq(contractSubmissions.id, submissionId),
            eq(contractSubmissions.tenantId, tenantId)
          )
        );

      onProgress?.(10, 'Iniciando processamento de contrato...');

      const result = await processorRegistry.process(
        fileBuffer,
        'contract.pdf',
        mimeType,
        {
          tenantId,
          userId,
        },
        onProgress
      );

      onProgress?.(90, 'Salvando dados extraídos...');

      const [updated] = await db
        .update(contractSubmissions)
        .set({
          status: 'processed',
          processorUsed: result.processorUsed,
          processingTimeMs: result.processingTimeMs,
          confidence: result.confidence,
          extractedData: result.extractedData as any,
        })
        .where(
          and(
            eq(contractSubmissions.id, submissionId),
            eq(contractSubmissions.tenantId, tenantId)
          )
        )
        .returning();

      onProgress?.(100, 'Processamento concluído!');

      return result;
    } catch (error) {
      console.error('[ContractSubmissionService] Processing failed:', error);

      await db
        .update(contractSubmissions)
        .set({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error instanceof Error ? { stack: error.stack } : {},
        })
        .where(
          and(
            eq(contractSubmissions.id, submissionId),
            eq(contractSubmissions.tenantId, tenantId)
          )
        );

      throw error;
    }
  }

  /**
   * Submit human review corrections
   */
  async submitReview(params: {
    submissionId: string;
    tenantId: string;
    userId: string;
    reviewedData: any;
    reviewNotes?: string;
  }) {
    const { submissionId, tenantId, userId, reviewedData, reviewNotes } = params;

    const [updated] = await db
      .update(contractSubmissions)
      .set({
        status: 'review',
        reviewedData: reviewedData,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      })
      .where(
        and(
          eq(contractSubmissions.id, submissionId),
          eq(contractSubmissions.tenantId, tenantId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error('Submission not found or access denied');
    }

    return updated;
  }

  /**
   * Approve submission and create final CRM contract
   */
  async approve(params: {
    submissionId: string;
    tenantId: string;
    userId: string;
    environment: 'development' | 'production';
  }) {
    const { submissionId, tenantId, userId, environment } = params;

    const [submission] = await db
      .select()
      .from(contractSubmissions)
      .where(
        and(
          eq(contractSubmissions.id, submissionId),
          eq(contractSubmissions.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!submission) {
      throw new Error('Submission not found or access denied');
    }

    if (submission.status !== 'review' && submission.status !== 'processed') {
      throw new Error(`Cannot approve submission in status: ${submission.status}`);
    }

    const finalData = submission.reviewedData || submission.extractedData;

    if (!finalData) {
      throw new Error('No data available to create contract');
    }

    const contractData = {
      tenantId,
      environment,
      contractNumber: finalData.contractNumber || `AUTO-${Date.now()}`,
      title: finalData.description || finalData.contractType || 'Contrato Importado',
      clientId: null,
      projectId: null,
      status: 'draft' as const,
      type: finalData.contractType || 'service',
      value: finalData.contractValue || finalData.totalAmount || null,
      currency: finalData.currency || 'EUR',
      startDate: finalData.startDate ? new Date(finalData.startDate) : null,
      endDate: finalData.endDate ? new Date(finalData.endDate) : null,
      renewalDate: finalData.renewalDate ? new Date(finalData.renewalDate) : null,
      autoRenewal: finalData.autoRenewal || false,
      paymentTerms: finalData.paymentTerms || null,
      description: finalData.description || null,
      parties: finalData.contractParties || [finalData.supplierName, finalData.clientName].filter(Boolean),
      metadata: {
        imported: true,
        importedFrom: submission.id,
        importedAt: new Date().toISOString(),
        ocrConfidence: submission.confidence,
        processorUsed: submission.processorUsed,
      },
      createdBy: userId,
    };

    const [contract] = await db.insert(crmContracts).values(contractData as any).returning();

    await db
      .update(contractSubmissions)
      .set({
        status: 'approved',
        contractId: contract.id,
      })
      .where(eq(contractSubmissions.id, submissionId));

    return { submission, contract };
  }

  /**
   * Reject submission
   */
  async reject(params: {
    submissionId: string;
    tenantId: string;
    userId: string;
    reviewNotes?: string;
  }) {
    const { submissionId, tenantId, userId, reviewNotes } = params;

    const [updated] = await db
      .update(contractSubmissions)
      .set({
        status: 'rejected',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      })
      .where(
        and(
          eq(contractSubmissions.id, submissionId),
          eq(contractSubmissions.tenantId, tenantId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error('Submission not found or access denied');
    }

    return updated;
  }

  /**
   * Get all submissions for a tenant
   */
  async getSubmissions(params: {
    tenantId: string;
    environment: 'development' | 'production';
    status?: string;
  }) {
    const { tenantId, environment, status } = params;

    const conditions = [
      eq(contractSubmissions.tenantId, tenantId),
      eq(contractSubmissions.environment, environment),
    ];

    if (status) {
      conditions.push(eq(contractSubmissions.status, status));
    }

    const submissions = await db
      .select()
      .from(contractSubmissions)
      .where(and(...conditions))
      .orderBy(desc(contractSubmissions.createdAt));

    return submissions;
  }

  /**
   * Get a specific submission
   */
  async getSubmission(params: {
    submissionId: string;
    tenantId: string;
  }) {
    const { submissionId, tenantId } = params;

    const [submission] = await db
      .select()
      .from(contractSubmissions)
      .where(
        and(
          eq(contractSubmissions.id, submissionId),
          eq(contractSubmissions.tenantId, tenantId)
        )
      )
      .limit(1);

    return submission || null;
  }
}

export const contractSubmissionService = new ContractSubmissionService();
