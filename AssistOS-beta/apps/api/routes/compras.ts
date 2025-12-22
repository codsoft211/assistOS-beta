/**
 * Compras (Procurement) Module Routes
 * 
 * Traditional Express Router with direct handler functions
 * 
 * SECURITY: All routes protected with module-level permission checks
 */

import { Router } from "express";
import { db } from "../db";
import {suppliers, purchaseOrders, purchaseOrderLines, purchasingInvoices, purchasingInvoiceLines, rfqs, rfqLines, invoices, supplierInvoices } from "../../../shared/schema";
import { eq, and, desc, sql, gte, lte, count } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "../middleware/permissions.middleware";
import multer from "multer";
import path from "path";
import fs from "fs";
import { extractInvoiceData } from "../../../packages/modules/compras/services/invoice-ocr.service";
import { recordChange } from "../../../packages/cdc";

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createSupplierSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default('PT'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactPhone: z.string().optional(),
  category: z.string().optional(),
  type: z.enum(['preferred', 'approved', 'trial', 'blocked']).default('approved'),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  currency: z.string().default('EUR'),
  minimumOrderValue: z.string().optional(),
  averageLeadTimeDays: z.number().int().optional(),
  bankName: z.string().optional(),
  iban: z.string().optional(),
  swiftBic: z.string().optional(),
  notes: z.string().optional()
});

const updateSupplierSchema = createSupplierSchema.partial();

// ============================================================================
// ROUTES
// ============================================================================

// GET /api/compras/suppliers - List all suppliers
router.get("/suppliers", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const results = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, tenantId),
          eq(suppliers.isActive, true)
        )
      );
    
    res.json({ suppliers: results });
  } catch (error: any) {
    console.error("[Compras API] Error listing suppliers:", error);
    res.status(500).json({ error: "Failed to list suppliers" });
  }
});

// POST /api/compras/suppliers - Create supplier
router.post("/suppliers", requirePermission('purchasing.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const supplierData = createSupplierSchema.parse(req.body);
    
    const [supplier] = await db.insert(suppliers).values({
      ...supplierData,
      tenantId,
      createdBy: userId,
      updatedBy: userId
    }).returning();
    
    // Record CDC event for supplier creation
    await recordChange({
      tenantId,
      connectorType: 'internal',
      eventType: 'created',
      entityType: 'supplier',
      entityId: supplier.id.toString(),
      changedFields: ['code', 'name', 'taxId', 'type'],
      eventData: {
        code: supplier.code,
        name: supplier.name,
        taxId: supplier.taxId,
        type: supplier.type,
        timestamp: new Date().toISOString(),
      },
      source: 'compras-api',
      timestamp: new Date(),
    });
    
    console.log(`[Compras API] Created supplier: ${supplier.code} - ${supplier.name}`);
    res.status(201).json(supplier);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors 
      });
    }
    console.error("[Compras API] Error creating supplier:", error);
    res.status(500).json({ error: "Failed to create supplier" });
  }
});

// GET /api/compras/suppliers/:id - Get supplier by ID
router.get("/suppliers/:id", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, req.params.id),
          eq(suppliers.tenantId, tenantId),
          eq(suppliers.isActive, true)
        )
      )
      .limit(1);
    
    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    
    res.json(supplier);
  } catch (error: any) {
    console.error("[Compras API] Error getting supplier:", error);
    res.status(500).json({ error: "Failed to get supplier" });
  }
});

// PATCH /api/compras/suppliers/:id - Update supplier
router.patch("/suppliers/:id", requirePermission('purchasing.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const updateData = updateSupplierSchema.parse(req.body);
    
    const [updated] = await db
      .update(suppliers)
      .set({
        ...updateData,
        updatedBy: userId,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(suppliers.id, req.params.id),
          eq(suppliers.tenantId, tenantId),
          eq(suppliers.isActive, true)
        )
      )
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    
    console.log(`[Compras API] Updated supplier: ${updated.code} - ${updated.name}`);
    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors 
      });
    }
    console.error("[Compras API] Error updating supplier:", error);
    res.status(500).json({ error: "Failed to update supplier" });
  }
});

// DELETE /api/compras/suppliers/:id - Delete supplier (soft delete)
router.delete("/suppliers/:id", requirePermission('purchasing.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const [deleted] = await db
      .update(suppliers)
      .set({
        isActive: false,
        updatedBy: userId,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(suppliers.id, req.params.id),
          eq(suppliers.tenantId, tenantId),
          eq(suppliers.isActive, true)
        )
      )
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    
    console.log(`[Compras API] Deleted supplier: ${deleted.code} - ${deleted.name}`);
    res.json({ 
      message: "Supplier deleted successfully",
      id: deleted.id 
    });
  } catch (error: any) {
    console.error("[Compras API] Error deleting supplier:", error);
    res.status(500).json({ error: "Failed to delete supplier" });
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

// GET /api/compras/analytics/dashboard - Dashboard KPIs
router.get("/analytics/dashboard", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    // Total spending current/previous month
    const [currentSpending] = await db
      .select({ total: sql<number>`COALESCE(SUM(${purchasingInvoices.totalAmount}), 0)` })
      .from(purchasingInvoices)
      .where(
        and(
          eq(purchasingInvoices.tenantId, tenantId),
          gte(purchasingInvoices.invoiceDate, currentMonthStart)
        )
      );

    const [previousSpending] = await db
      .select({ total: sql<number>`COALESCE(SUM(${purchasingInvoices.totalAmount}), 0)` })
      .from(purchasingInvoices)
      .where(
        and(
          eq(purchasingInvoices.tenantId, tenantId),
          gte(purchasingInvoices.invoiceDate, previousMonthStart),
          lte(purchasingInvoices.invoiceDate, previousMonthEnd)
        )
      );

    // PO counts by status
    const poStats = await db
      .select({
        status: purchaseOrders.status,
        count: sql<number>`COUNT(*)::int`
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.tenantId, tenantId))
      .groupBy(purchaseOrders.status);

    // On-time delivery stats
    const [deliveryStats] = await db
      .select({
        avgOnTimeRate: sql<number>`COALESCE(AVG(${suppliers.onTimeDeliveryRate}), 0)`
      })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, tenantId),
          eq(suppliers.isActive, true)
        )
      );

    // Recent activity (last 10 POs)
    const recentPOs = await db
      .select({
        id: purchaseOrders.id,
        code: purchaseOrders.code,
        supplier: suppliers.name,
        status: purchaseOrders.status,
        totalAmount: purchaseOrders.totalAmount,
        orderDate: purchaseOrders.orderDate,
        type: sql<string>`'PO'`
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(eq(purchaseOrders.tenantId, tenantId))
      .orderBy(desc(purchaseOrders.orderDate))
      .limit(10);

    res.json({
      spending: {
        current: Number(currentSpending.total) || 0,
        previous: Number(previousSpending.total) || 0,
        trend: previousSpending.total ? ((currentSpending.total - previousSpending.total) / previousSpending.total) * 100 : 0
      },
      purchaseOrders: poStats.reduce((acc: any, stat) => {
        acc[stat.status || 'unknown'] = Number(stat.count);
        return acc;
      }, {}),
      onTimeDeliveryRate: Number(deliveryStats.avgOnTimeRate) || 0,
      pendingApprovals: poStats.find(s => s.status === 'pending_approval')?.count || 0,
      recentActivity: recentPOs
    });
  } catch (error: any) {
    console.error("[Compras API] Error fetching dashboard analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ============================================================================
// INVOICE OCR
// ============================================================================

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/temp');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, PNG, JPG allowed.'));
    }
  }
});

// POST /api/compras/invoices/ocr - Upload and extract invoice data
router.post("/invoices/ocr", requirePermission('purchasing.write'), upload.single('file'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Extract invoice data using OCR service
    const result = await extractInvoiceData({
      filePath: req.file.path,
      tenantId,
      userId,
      environment: ((req as any).environment || 'production') as 'production' | 'sandbox',
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const { data } = result;
    if (!data) {
      return res.status(400).json({ error: "No data extracted" });
    }

    // Normalize NIF (Portuguese tax ID) - strip prefixes, spaces, punctuation
    // Ensures "NIF: 502 123 456" and "502123456" are treated as the same supplier
    const normalizeNIF = (nif: string | undefined): string | null => {
      if (!nif || nif === 'UNKNOWN') return null;
      
      // Remove common prefixes and extract only digits
      const digitsOnly = nif
        .replace(/^(NIF|NIPC|Tax ID|Contribuinte)[\s:]+/i, '') // Remove prefix
        .replace(/\D/g, ''); // Keep only digits
      
      // Portuguese NIFs have 9 digits
      if (digitsOnly.length === 9) {
        return digitsOnly;
      }
      
      console.log(`[Compras API] ⚠️ Invalid NIF format: "${nif}" → "${digitsOnly}" (expected 9 digits)`);
      return null;
    };
    
    const normalizedNIF = normalizeNIF(data.supplierTaxId);
    
    // Calculate subtotal (sum of line items) - guard against empty/missing lineItems
    const subtotal = (data.lineItems && data.lineItems.length > 0)
      ? data.lineItems.reduce((sum, item) => sum + item.total, 0)
      : 0;
    
    // Calculate tax amount (totalAmount - subtotal)
    const taxAmount = data.totalAmount - subtotal;

    // Find or create supplier - MATCH BY NIF FIRST (prevents duplicates)
    let supplier = null;
    
    // Primary match: By tax ID (NIF) if available and valid
    if (normalizedNIF) {
      supplier = await db
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.tenantId, tenantId),
            eq(suppliers.taxId, normalizedNIF),
            eq(suppliers.isActive, true)
          )
        )
        .limit(1)
        .then(rows => rows[0]);
      
      if (supplier) {
        console.log(`[Compras API] ✅ Found supplier by NIF: ${supplier.name} (${normalizedNIF})`);
      }
    }
    
    // Fallback match: By name if NIF not found or not provided
    if (!supplier) {
      supplier = await db
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.tenantId, tenantId),
            eq(suppliers.name, data.supplierName),
            eq(suppliers.isActive, true)
          )
        )
        .limit(1)
        .then(rows => rows[0]);
      
      if (supplier) {
        console.log(`[Compras API] ⚠️ Found supplier by name (no NIF match): ${supplier.name}`);
      }
    }

    if (!supplier) {
      // Create new supplier with normalized NIF
      const [newSupplier] = await db.insert(suppliers).values({
        tenantId,
        code: `SUP-${Date.now()}`,
        name: data.supplierName,
        taxId: normalizedNIF,
        type: 'approved',
        currency: data.currency || 'EUR',
        createdBy: userId,
        updatedBy: userId
      }).returning();
      supplier = newSupplier;
      
      // Record CDC event for auto-created supplier
      await recordChange({
        tenantId,
        connectorType: 'internal',
        eventType: 'created',
        entityType: 'supplier',
        entityId: supplier.id.toString(),
        changedFields: ['code', 'name', 'taxId', 'type'],
        eventData: {
          code: supplier.code,
          name: supplier.name,
          taxId: supplier.taxId,
          type: supplier.type,
          timestamp: new Date().toISOString(),
        },
        source: 'invoice-analysis-auto-create',
        timestamp: new Date(),
      });
      
      console.log(`[Compras API] ✨ Created supplier: ${supplier.name} (NIF: ${normalizedNIF || 'N/A'})`);
    }

    // Move PDF to permanent location
    const uploadsDir = path.join(process.cwd(), 'uploads', 'invoices', tenantId);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const pdfFileName = `${Date.now()}-${path.basename(req.file.originalname)}`;
    const permanentPath = path.join(uploadsDir, pdfFileName);
    fs.renameSync(req.file.path, permanentPath);
    
    const pdfUrl = `/uploads/invoices/${tenantId}/${pdfFileName}`;

    // Create invoice in database
    const [invoice] = await db.insert(invoices).values({
      tenantId,
      invoiceType: 'payable',
      invoiceNumber: data.invoiceNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      issueDate: new Date(data.invoiceDate),
      status: 'pending_approval',
      paymentStatus: 'pending',
      currency: data.currency || 'EUR',
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: data.totalAmount.toFixed(2),
      paidAmount: '0',
      pdfUrl,
      category: 'procurement'
    }).returning();

    console.log(`[Compras API] ✅ Created invoice ${invoice.invoiceNumber} for ${supplier.name} - €${data.totalAmount}`);

    res.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplierName,
        issueDate: invoice.issueDate,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        pdfUrl: invoice.pdfUrl
      }
    });
  } catch (error: any) {
    console.error("[Compras API] ❌ ERROR processing invoice OCR:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table,
      column: error.column
    });
    
    // Return detailed error for debugging
    const errorMessage = error.message || "Failed to process invoice";
    const errorDetail = error.detail || error.constraint || "";
    
    res.status(500).json({ 
      error: errorMessage,
      detail: errorDetail,
      hint: "Check server logs for full error details"
    });
  }
});

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

// GET /api/compras/purchase-orders - List all purchase orders
router.get("/purchase-orders", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const orders = await db
      .select({
        id: purchaseOrders.id,
        code: purchaseOrders.code,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
        totalAmount: purchaseOrders.totalAmount,
        supplier: suppliers.name,
        supplierId: suppliers.id
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(eq(purchaseOrders.tenantId, tenantId))
      .orderBy(desc(purchaseOrders.orderDate));

    res.json({ purchaseOrders: orders });
  } catch (error: any) {
    console.error("[Compras API] Error listing purchase orders:", error);
    res.status(500).json({ error: "Failed to list purchase orders" });
  }
});

// GET /api/compras/purchase-orders/:id - Get purchase order details
router.get("/purchase-orders/:id", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [order] = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, req.params.id),
          eq(purchaseOrders.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.poId, order.id));

    res.json({ ...order, lines });
  } catch (error: any) {
    console.error("[Compras API] Error getting purchase order:", error);
    res.status(500).json({ error: "Failed to get purchase order" });
  }
});

// ============================================================================
// INVOICES
// ============================================================================

// GET /api/compras/invoices - List all invoices (payable invoices only)
router.get("/invoices", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const invoicesList = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        status: invoices.status,
        paymentStatus: invoices.paymentStatus,
        subtotal: invoices.subtotal,
        taxAmount: invoices.taxAmount,
        totalAmount: invoices.totalAmount,
        supplierName: invoices.supplierName,
        supplierId: invoices.supplierId,
        pdfUrl: invoices.pdfUrl,
        currency: invoices.currency
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'payable')
        )
      )
      .orderBy(desc(invoices.issueDate));

    res.json({ invoices: invoicesList });
  } catch (error: any) {
    console.error("[Compras API] Error listing invoices:", error);
    res.status(500).json({ error: "Failed to list invoices" });
  }
});

// GET /api/compras/invoices/pending-validation - List HITL pending invoices (supplier_invoices table)
router.get("/invoices/pending-validation", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pendingInvoices = await db
      .select({
        id: supplierInvoices.id,
        supplierName: supplierInvoices.supplierName,
        invoiceNumber: supplierInvoices.invoiceNumber,
        invoiceDate: supplierInvoices.invoiceDate,
        totalAmount: supplierInvoices.totalAmount,
        currency: supplierInvoices.currency,
        extractionConfidence: supplierInvoices.extractionConfidence,
        extractionProcessor: supplierInvoices.extractionProcessor,
        fileId: supplierInvoices.fileId,
        supplierId: supplierInvoices.supplierId,
      })
      .from(supplierInvoices)
      .where(and(
        eq(supplierInvoices.tenantId, tenantId),
        eq(supplierInvoices.extractionStatus, 'pending_validation')
      ))
      .orderBy(desc(supplierInvoices.createdAt));
    
    console.log(`[Compras API] ✓ Found ${pendingInvoices.length} pending validation invoices`);
    
    res.json({ invoices: pendingInvoices });
  } catch (error: any) {
    console.error("[Compras API] ❌ Error listing pending invoices:", error);
    res.status(500).json({ error: "Failed to list pending invoices" });
  }
});

// GET /api/compras/invoices/:id - Get invoice details (supplier_invoices table for HITL)
router.get("/invoices/:id", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Explicit select to avoid missing columns error
    const [invoice] = await db
      .select({
        id: supplierInvoices.id,
        tenantId: supplierInvoices.tenantId,
        supplierId: supplierInvoices.supplierId,
        fileId: supplierInvoices.fileId,
        supplierName: supplierInvoices.supplierName,
        nif: supplierInvoices.nif,
        receiverTaxId: supplierInvoices.receiverTaxId,
        invoiceNumber: supplierInvoices.invoiceNumber,
        invoiceType: supplierInvoices.invoiceType,
        invoiceDate: supplierInvoices.invoiceDate,
        dueDate: supplierInvoices.dueDate,
        paymentStatus: supplierInvoices.paymentStatus,
        paymentDate: supplierInvoices.paymentDate,
        totalAmount: supplierInvoices.totalAmount,
        taxAmount: supplierInvoices.taxAmount,
        netAmount: supplierInvoices.netAmount,
        currency: supplierInvoices.currency,
        description: supplierInvoices.description,
        lineItems: supplierInvoices.lineItems,
        extractionStatus: supplierInvoices.extractionStatus,
        extractionConfidence: supplierInvoices.extractionConfidence,
        extractionProcessor: supplierInvoices.extractionProcessor,
        validatedAt: supplierInvoices.validatedAt,
        validatedBy: supplierInvoices.validatedBy,
        createdAt: supplierInvoices.createdAt,
        updatedAt: supplierInvoices.updatedAt,
      })
      .from(supplierInvoices)
      .where(and(
        eq(supplierInvoices.id, req.params.id),
        eq(supplierInvoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!invoice) {
      console.log(`[Compras API] ⚠️ Invoice not found: ${req.params.id}`);
      return res.status(404).json({ error: "Invoice not found" });
    }

    console.log(`[Compras API] ✓ Found invoice: ${invoice.invoiceNumber}`);
    res.json(invoice);
  } catch (error: any) {
    console.error("[Compras API] ❌ Error getting invoice:", error);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});

// PATCH /api/compras/invoices/:id/validate - Validate/reject invoice (HITL)
router.patch("/invoices/:id/validate", requirePermission('purchasing.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { action, corrections } = req.body;
    
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be 'approve' or 'reject'" });
    }

    const [invoice] = await db
      .select()
      .from(supplierInvoices)
      .where(and(
        eq(supplierInvoices.id, req.params.id),
        eq(supplierInvoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    let updated;
    
    if (action === 'approve') {
      // Apply corrections if provided
      const correctedData = corrections || {};
      
      [updated] = await db
        .update(supplierInvoices)
        .set({
          extractionStatus: 'validated',
          validatedAt: new Date(),
          validatedBy: userId,
          // Apply corrections
          ...correctedData,
        })
        .where(eq(supplierInvoices.id, req.params.id))
        .returning();
      
      console.log(`[Compras API] ✅ Invoice ${invoice.invoiceNumber} APPROVED by user ${userId}`);
    } else {
      [updated] = await db
        .update(supplierInvoices)
        .set({
          extractionStatus: 'rejected',
          validatedAt: new Date(),
          validatedBy: userId,
        })
        .where(eq(supplierInvoices.id, req.params.id))
        .returning();
      
      console.log(`[Compras API] ❌ Invoice ${invoice.invoiceNumber} REJECTED by user ${userId}`);
    }

    res.json({ 
      success: true, 
      invoice: updated,
      message: action === 'approve' ? 'Invoice approved successfully' : 'Invoice rejected'
    });
  } catch (error: any) {
    console.error("[Compras API] ❌ Error validating invoice:", error);
    res.status(500).json({ error: "Failed to validate invoice" });
  }
});

// ============================================================================
// RFQs
// ============================================================================

// GET /api/compras/rfqs - List all RFQs
router.get("/rfqs", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const rfqsList = await db
      .select()
      .from(rfqs)
      .where(eq(rfqs.tenantId, tenantId))
      .orderBy(desc(rfqs.createdAt));

    res.json({ rfqs: rfqsList });
  } catch (error: any) {
    console.error("[Compras API] Error listing RFQs:", error);
    res.status(500).json({ error: "Failed to list RFQs" });
  }
});

// GET /api/compras/rfqs/:id - Get RFQ details
router.get("/rfqs/:id", requirePermission('purchasing.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [rfq] = await db
      .select()
      .from(rfqs)
      .where(
        and(
          eq(rfqs.id, req.params.id),
          eq(rfqs.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!rfq) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    const lines = await db
      .select()
      .from(rfqLines)
      .where(eq(rfqLines.rfqId, rfq.id));

    res.json({ ...rfq, lines });
  } catch (error: any) {
    console.error("[Compras API] Error getting RFQ:", error);
    res.status(500).json({ error: "Failed to get RFQ" });
  }
});

console.log("[Compras Routes] ✅ Registered routes: 5 suppliers + analytics + OCR + POs + invoices + RFQs");

export default router;
