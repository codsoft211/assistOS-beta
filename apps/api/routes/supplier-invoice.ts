import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import { purchaseOrders, purchasingInvoices, suppliers } from "../../../shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { apiRateLimiter } from "../middleware/rate-limit";
import { recordChange } from "../../../packages/cdc";

const router = Router();

// Configure multer for file upload
const upload = multer({
  dest: 'uploads/temp/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Validation schema for invoice submission
const submitInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  invoiceDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format'
  }),
  totalAmount: z.string().transform(val => parseFloat(val)).refine(val => val > 0, {
    message: 'Total amount must be positive'
  }),
  currency: z.string().default('EUR'),
  notes: z.string().optional(),
});

/**
 * GET /api/public/supplier-invoice/:token/validate
 * Validate invoice submission token
 * NO AUTH REQUIRED - public endpoint
 */
router.get("/:token/validate", apiRateLimiter, async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        valid: false,
        message: "Token is required"
      });
    }

    // Find purchase order with this token
    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.invoiceSubmissionToken, token))
      .limit(1);

    if (!po) {
      return res.status(404).json({
        valid: false,
        message: "Invalid submission link. This link may have been used or does not exist."
      });
    }

    // Check if token has expired
    if (po.invoiceSubmissionTokenExpiresAt && new Date(po.invoiceSubmissionTokenExpiresAt) < new Date()) {
      return res.status(410).json({
        valid: false,
        message: "This submission link has expired. Please contact the sender for a new link."
      });
    }

    // Token is valid
    res.json({
      valid: true,
      poNumber: po.code,
      message: "Submission link is valid"
    });
  } catch (error: any) {
    console.error("[Supplier Invoice] Error validating token:", error);
    res.status(500).json({
      valid: false,
      message: "Failed to validate submission link"
    });
  }
});

/**
 * POST /api/public/supplier-invoice/:token
 * Submit supplier invoice with file upload
 * NO AUTH REQUIRED - public endpoint
 */
router.post("/:token", apiRateLimiter, upload.single('invoice_file'), async (req, res) => {
  try {
    const { token } = req.params;

    // Validate token and get purchase order
    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.invoiceSubmissionToken, token))
      .limit(1);

    if (!po) {
      // Clean up uploaded file if token is invalid
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      return res.status(404).json({
        error: "Invalid submission link. This link may have been used or does not exist."
      });
    }

    // Check if token has expired
    if (po.invoiceSubmissionTokenExpiresAt && new Date(po.invoiceSubmissionTokenExpiresAt) < new Date()) {
      // Clean up uploaded file
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      return res.status(410).json({
        error: "This submission link has expired. Please contact the sender for a new link."
      });
    }

    // Validate form data
    const validatedData = submitInvoiceSchema.parse(req.body);

    // Handle file upload
    let attachmentsData: any = null;
    if (req.file) {
      // Create invoices directory if it doesn't exist
      const invoicesDir = path.join('uploads', 'invoices');
      await fs.mkdir(invoicesDir, { recursive: true });

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `${po.code}_${timestamp}.pdf`;
      const finalPath = path.join(invoicesDir, filename);

      // Move file from temp to invoices directory
      await fs.rename(req.file.path, finalPath);

      // Create attachments array
      attachmentsData = [{
        filename: req.file.originalname,
        path: finalPath,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: new Date().toISOString(),
      }];

      console.log(`[Supplier Invoice] File uploaded: ${finalPath}`);
    }

    // Generate invoice code
    const invoiceCode = `INV-${po.code}-${Date.now().toString().slice(-6)}`;

    // Calculate tax (assuming 23% VAT for EUR, adjust as needed)
    const taxRate = validatedData.currency === 'EUR' ? 0.23 : 0;
    const subtotal = validatedData.totalAmount / (1 + taxRate);
    const taxTotal = validatedData.totalAmount - subtotal;

    // Create purchasing invoice
    const [invoice] = await db.insert(purchasingInvoices).values({
      tenantId: po.tenantId,
      code: invoiceCode,
      invoiceNumber: validatedData.invoiceNumber,
      invoiceDate: validatedData.invoiceDate,
      supplierId: po.supplierId,
      poId: po.id,
      submissionSource: 'web_form',
      subtotal: subtotal.toFixed(2),
      taxTotal: taxTotal.toFixed(2),
      totalAmount: validatedData.totalAmount.toFixed(2),
      currency: validatedData.currency,
      status: 'pending_approval',
      attachments: attachmentsData,
      notes: validatedData.notes,
      ocrExtracted: false,
      threeWayMatchStatus: 'pending',
      poDiscrepancy: false,
      receiptDiscrepancy: false,
      priceDiscrepancy: false,
    }).returning();

    // Record CDC event for invoice creation
    await recordChange({
      tenantId: po.tenantId,
      connectorType: 'internal',
      eventType: 'created',
      entityType: 'invoice',
      entityId: invoice.id.toString(),
      changedFields: ['code', 'invoiceNumber', 'totalAmount', 'currency', 'supplierId', 'status'],
      eventData: {
        code: invoice.code,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: parseFloat(invoice.totalAmount),
        subtotal: parseFloat(invoice.subtotal),
        taxTotal: parseFloat(invoice.taxTotal),
        currency: invoice.currency,
        supplierId: invoice.supplierId,
        status: invoice.status,
        timestamp: new Date().toISOString(),
      },
      source: 'supplier-invoice-api',
      timestamp: new Date(),
    });

    // Revoke the token (one-time use)
    await db
      .update(purchaseOrders)
      .set({
        invoiceSubmissionToken: null,
        invoiceSubmissionTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, po.id));

    console.log(`[Supplier Invoice] ✅ Invoice created: ${invoiceCode} for PO ${po.code}`);

    res.status(201).json({
      success: true,
      invoiceId: invoice.id,
      invoiceCode: invoice.code,
      message: "Invoice submitted successfully"
    });
  } catch (error: any) {
    console.error("[Supplier Invoice] Error submitting invoice:", error);

    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors
      });
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: "File size exceeds 10MB limit"
        });
      }
      return res.status(400).json({
        error: `File upload error: ${error.message}`
      });
    }

    res.status(500).json({
      error: "Failed to submit invoice. Please try again."
    });
  }
});

export default router;
