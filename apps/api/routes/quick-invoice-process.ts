import { Router } from "express";
import { readFileSync } from "fs";
import { db } from "../db";
import { fileAttachments, companyInfo } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { selectOneFromTenantTable } from "../utils/tenant-db-helper";
import { processorRegistry } from "../../../packages/document-processing";
import { OpenAIVisionProcessor } from "../../../packages/document-processing/processors/OpenAIVisionProcessor";
import { GoogleInvoiceProcessor } from "../../../packages/document-processing/processors/GoogleInvoiceProcessor";
import { SupplierSyncService } from "../../../packages/modules/compras/services/supplier-sync.service";

const router = Router();

// Initialize processors once
let processorsInitialized = false;
function initializeProcessors() {
  if (!processorsInitialized) {
    console.log('[QuickProcess] Initializing processors...');
    processorRegistry.register(new OpenAIVisionProcessor());
    try {
      processorRegistry.register(new GoogleInvoiceProcessor());
      console.log('[QuickProcess] Google processor registered');
    } catch (e: any) {
      console.log('[QuickProcess] Google processor unavailable:', e.message);
    }
    processorsInitialized = true;
  }
}

/**
 * POST /api/quick-invoice-process/:fileId
 * Quickly process an uploaded invoice file
 */
router.post("/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log(`[QuickProcess] Processing file ${fileId} for tenant ${tenantId}`);

    // Get file from database
    const [fileRecord] = await db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.id, fileId))
      .limit(1);

    if (!fileRecord) {
      return res.status(404).json({ error: "File not found" });
    }

    if (fileRecord.tenantId !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    console.log(`[QuickProcess] File found: ${fileRecord.originalName} (${fileRecord.mimeType})`);

    // Read file from disk
    const fileBuffer = readFileSync(fileRecord.path);
    console.log(`[QuickProcess] File read: ${(fileBuffer.length / 1024).toFixed(1)}KB`);

    // Initialize processors
    initializeProcessors();

    // Process document
    const result = await processorRegistry.process(
      fileBuffer,
      fileRecord.originalName,
      fileRecord.mimeType,
      { tenantId, userId },
      (progress: number, message: string) => {
        console.log(`[QuickProcess] ${progress}% - ${message}`);
      }
    );

    console.log(`[QuickProcess] Processing complete - ${result.processorUsed}`);

    // VALIDAÇÃO CRÍTICA: Verificar se fatura é dirigida à empresa correta
    if (result.extractedData.recipientNIF) {
      // Buscar NIF da empresa do tenant schema
      const company = await selectOneFromTenantTable<{ nif?: string; name?: string }>(
        tenantId,
        'company_info',
        sql`tenant_id = ${tenantId}`
      );

      if (company?.nif) {
        // Normalizar NIFs (remover espaços e comparar)
        const companyNIF = company.nif.replace(/\s/g, '');
        const recipientNIF = result.extractedData.recipientNIF.replace(/\s/g, '');

        if (companyNIF !== recipientNIF) {
          console.warn(`[QuickProcess] ⚠️  NIF MISMATCH - Company: ${companyNIF}, Invoice: ${recipientNIF}`);
          return res.status(400).json({
            error: "Fatura incorreta - NIF destinatário não corresponde",
            message: `Esta fatura está dirigida ao NIF ${recipientNIF}, mas a sua empresa tem o NIF ${companyNIF}. Por razões de conformidade fiscal, não é possível adicionar faturas de outras empresas.`,
            details: {
              yourCompanyNIF: companyNIF,
              yourCompanyName: company.name,
              invoiceReceiverNIF: recipientNIF,
              invoiceIssuer: result.extractedData.issuer,
            }
          });
        } else {
          console.log(`[QuickProcess] ✅ NIF validation passed - ${companyNIF}`);
        }
      }
    }

    // Try to create/update supplier if NIF present
    let supplierResult = null;
    if (result.extractedData.issuerNIF) {
      try {
        supplierResult = await SupplierSyncService.syncFromOCR(
          tenantId,
          result.extractedData
        );
        console.log(`[QuickProcess] Supplier ${supplierResult.wasCreated ? 'created' : 'updated'}: ${supplierResult.supplierId}`);
      } catch (e: any) {
        console.error('[QuickProcess] Supplier sync failed:', e.message);
      }
    }

    // Return results
    res.json({
      success: true,
      processor: result.processorUsed,
      documentType: result.documentTypeLabel,
      confidence: result.confidence,
      data: {
        supplier: result.extractedData.issuer,
        nif: result.extractedData.issuerNIF,
        invoiceNumber: result.extractedData.invoiceNumber,
        invoiceDate: result.extractedData.invoiceDate,
        dueDate: result.extractedData.dueDate,
        totalAmount: result.extractedData.totalAmount,
        taxAmount: result.extractedData.taxAmount,
        subtotal: result.extractedData.subtotal,
        currency: result.extractedData.currency,
        items: result.extractedData.items || [],
      },
      supplier: supplierResult ? {
        id: supplierResult.supplierId,
        created: supplierResult.wasCreated,
      } : null,
      rawExtractedData: result.extractedData,
    });

  } catch (error: any) {
    console.error('[QuickProcess] Error:', error);
    res.status(500).json({
      error: "Processing failed",
      message: error.message,
    });
  }
});

export default router;
