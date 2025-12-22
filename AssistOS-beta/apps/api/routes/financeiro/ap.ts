/**
 * Accounts Payable (AP) Module Routes
 * Vendor Bills, 3-Way Matching, Approvals, Payment Plans
 */

import { Router } from "express";
import { requirePermission } from "../../middleware/permissions.middleware";
import { db } from "../../db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { 
  purchasingInvoices,
  purchasingInvoiceLines,
  approvalWorkflows,
  paymentPlans,
  suppliers
} from "../../../../shared/schema";

export function createApRouter(): Router {
  const router = Router();

  // ============================================================================
  // FATURAS DE FORNECEDOR (VENDOR BILLS)
  // ============================================================================

  // GET /api/financeiro/faturas-fornecedor - Listar faturas de fornecedor
  router.get("/faturas-fornecedor", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const environment = (req as any).environment || 'production';
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status, supplierId, dataInicio, dataFim, page = 1, limit = 50 } = req.query;

      let conditions = [
        eq(purchasingInvoices.tenantId, tenantId),
        eq(purchasingInvoices.environment, environment)
      ];

      if (status && status !== 'all') {
        conditions.push(eq(purchasingInvoices.status, status as string));
      }
      if (supplierId) {
        conditions.push(eq(purchasingInvoices.supplierId, supplierId as string));
      }
      if (dataInicio) {
        conditions.push(sql`${purchasingInvoices.invoiceDate} >= ${new Date(dataInicio as string).toISOString().split('T')[0]}`);
      }
      if (dataFim) {
        conditions.push(sql`${purchasingInvoices.invoiceDate} <= ${new Date(dataFim as string).toISOString().split('T')[0]}`);
      }

      const bills = await db
        .select()
        .from(purchasingInvoices)
        .where(and(...conditions))
        .orderBy(desc(purchasingInvoices.invoiceDate))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(purchasingInvoices)
        .where(and(...conditions));

      res.json({ 
        bills, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listadas ${bills.length} faturas de fornecedor (página ${page}/${Math.ceil(Number(count) / Number(limit))}) para tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao listar faturas de fornecedor:", error);
      res.status(500).json({ error: "Failed to list vendor bills" });
    }
  });

  // POST /api/financeiro/faturas-fornecedor - Criar fatura de fornecedor
  router.post("/faturas-fornecedor", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const data = req.body;

      // Validate required fields
      if (!data.supplierId) {
        return res.status(400).json({ error: "supplierId is required" });
      }
      if (!data.totalAmount || parseFloat(data.totalAmount) <= 0) {
        return res.status(400).json({ error: "totalAmount is required and must be greater than 0" });
      }
      if (!data.invoiceDate) {
        return res.status(400).json({ error: "invoiceDate is required" });
      }

      // Validate supplier exists
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, data.supplierId),
          eq(suppliers.tenantId, tenantId)
        ))
        .limit(1);

      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      // Auto-generate bill number if not provided
      let invoiceNumber = data.invoiceNumber;
      if (!invoiceNumber) {
        const year = new Date().getFullYear();
        const randomNum = Math.floor(Math.random() * 99999);
        invoiceNumber = `FB ${year}/${randomNum.toString().padStart(5, '0')}`;
      }

      // Generate code
      const timestamp = Date.now().toString(36);
      const code = `PINV-${timestamp}`;

      // Calculate subtotal and tax
      const totalAmount = parseFloat(data.totalAmount);
      const taxTotal = data.taxTotal ? parseFloat(data.taxTotal) : totalAmount * 0.23;
      const subtotal = totalAmount - taxTotal;
      
      // Get environment from request context
      const environment = (req as any).environment || 'production';

      // Create purchasing invoice
      const [bill] = await db.insert(purchasingInvoices).values({
        tenantId,
        environment,
        code,
        invoiceNumber,
        invoiceDate: new Date(data.invoiceDate),
        supplierId: data.supplierId,
        poId: data.poId || undefined,
        receiptId: data.receiptId || undefined,
        submissionSource: data.submissionSource || 'manual',
        ocrExtracted: data.ocrExtracted || false,
        ocrData: data.ocrData || undefined,
        ocrConfidence: data.ocrConfidence || undefined,
        subtotal: subtotal.toFixed(2),
        taxTotal: taxTotal.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        currency: data.currency || 'EUR',
        paymentTerms: data.paymentTerms || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        threeWayMatchStatus: 'pending',
        status: 'draft',
        paidAmount: '0',
        notes: data.notes || undefined,
        attachments: data.attachments || undefined,
        createdBy: userId,
      }).returning();

      // Create bill lines if items array provided
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        for (const item of data.items) {
          await db.insert(purchasingInvoiceLines).values({
            tenantId,
            environment,
            invoiceId: bill.id,
            description: item.description || '',
            quantity: (item.quantity || 0).toFixed(3),
            uom: item.uom || 'un',
            unitPrice: (item.unitPrice || 0).toFixed(2),
            lineTotal: (item.lineTotal || 0).toFixed(2),
            taxRate: (item.taxRate || 23).toFixed(2),
            taxAmount: (item.taxAmount || 0).toFixed(2),
            notes: item.notes || undefined,
          });
        }
      }

      res.status(201).json(bill);
      console.log(`[Financeiro AP] ✅ Fatura de fornecedor criada: ${bill.invoiceNumber} para tenant ${tenantId} (${environment})`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao criar fatura de fornecedor:", error);
      res.status(500).json({ error: "Failed to create vendor bill" });
    }
  });

  // ============================================================================
  // BILLS (English alias for FATURAS DE FORNECEDOR)
  // ============================================================================

  // GET /api/financeiro/bills - List vendor bills (English alias)
  router.get("/bills", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const environment = (req as any).environment || 'production';
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status, supplierId, startDate, endDate, page = 1, limit = 50 } = req.query;

      let conditions = [
        eq(purchasingInvoices.tenantId, tenantId),
        eq(purchasingInvoices.environment, environment)
      ];

      if (status && status !== 'all') {
        conditions.push(eq(purchasingInvoices.status, status as string));
      }
      if (supplierId) {
        conditions.push(eq(purchasingInvoices.supplierId, supplierId as string));
      }
      if (startDate) {
        conditions.push(sql`${purchasingInvoices.invoiceDate} >= ${new Date(startDate as string).toISOString().split('T')[0]}`);
      }
      if (endDate) {
        conditions.push(sql`${purchasingInvoices.invoiceDate} <= ${new Date(endDate as string).toISOString().split('T')[0]}`);
      }

      const bills = await db
        .select()
        .from(purchasingInvoices)
        .where(and(...conditions))
        .orderBy(desc(purchasingInvoices.invoiceDate))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(purchasingInvoices)
        .where(and(...conditions));

      res.json({ 
        bills, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listed ${bills.length} vendor bills (page ${page}/${Math.ceil(Number(count) / Number(limit))}) for tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error listing vendor bills:", error);
      res.status(500).json({ error: "Failed to list vendor bills" });
    }
  });

  // POST /api/financeiro/bills - Create vendor bill (English alias)
  router.post("/bills", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const data = req.body;

      // Validate required fields
      if (!data.supplierId) {
        return res.status(400).json({ error: "supplierId is required" });
      }
      if (!data.totalAmount || parseFloat(data.totalAmount) <= 0) {
        return res.status(400).json({ error: "totalAmount is required and must be greater than 0" });
      }
      if (!data.invoiceDate) {
        return res.status(400).json({ error: "invoiceDate is required" });
      }

      // Validate supplier exists
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, data.supplierId),
          eq(suppliers.tenantId, tenantId)
        ))
        .limit(1);

      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      // Auto-generate bill number if not provided
      let invoiceNumber = data.invoiceNumber;
      if (!invoiceNumber) {
        const year = new Date().getFullYear();
        const randomNum = Math.floor(Math.random() * 99999);
        invoiceNumber = `FB ${year}/${randomNum.toString().padStart(5, '0')}`;
      }

      // Generate code
      const timestamp = Date.now().toString(36);
      const code = `PINV-${timestamp}`;

      // Calculate subtotal and tax
      const totalAmount = parseFloat(data.totalAmount);
      const taxTotal = data.taxTotal ? parseFloat(data.taxTotal) : totalAmount * 0.23;
      const subtotal = totalAmount - taxTotal;
      
      // Get environment from request context
      const environment = (req as any).environment || 'production';

      // Create purchasing invoice
      const [bill] = await db.insert(purchasingInvoices).values({
        tenantId,
        environment,
        code,
        invoiceNumber,
        invoiceDate: new Date(data.invoiceDate),
        supplierId: data.supplierId,
        poId: data.poId || undefined,
        receiptId: data.receiptId || undefined,
        submissionSource: data.submissionSource || 'manual',
        ocrExtracted: data.ocrExtracted || false,
        ocrData: data.ocrData || undefined,
        ocrConfidence: data.ocrConfidence || undefined,
        subtotal: subtotal.toFixed(2),
        taxTotal: taxTotal.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        currency: data.currency || 'EUR',
        paymentTerms: data.paymentTerms || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        threeWayMatchStatus: 'pending',
        status: 'draft',
        paidAmount: '0',
        notes: data.notes || undefined,
        attachments: data.attachments || undefined,
        createdBy: userId,
      }).returning();

      // Create bill lines if items array provided
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        for (const item of data.items) {
          await db.insert(purchasingInvoiceLines).values({
            tenantId,
            environment,
            invoiceId: bill.id,
            description: item.description || '',
            quantity: (item.quantity || 0).toFixed(3),
            uom: item.uom || 'un',
            unitPrice: (item.unitPrice || 0).toFixed(2),
            lineTotal: (item.lineTotal || 0).toFixed(2),
            taxRate: (item.taxRate || 23).toFixed(2),
            taxAmount: (item.taxAmount || 0).toFixed(2),
            notes: item.notes || undefined,
          });
        }
      }

      res.status(201).json(bill);
      console.log(`[Financeiro AP] ✅ Vendor bill created: ${bill.invoiceNumber} for tenant ${tenantId} (${environment})`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error creating vendor bill:", error);
      res.status(500).json({ error: "Failed to create vendor bill" });
    }
  });

  // GET /api/financeiro/bills/:id - Get vendor bill detail
  router.get("/bills/:id", requirePermission('financeiro.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const environment = (req as any).environment || 'production';
      const { id } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get bill with supplier info
      const [bill] = await db
        .select({
          id: purchasingInvoices.id,
          tenantId: purchasingInvoices.tenantId,
          environment: purchasingInvoices.environment,
          code: purchasingInvoices.code,
          invoiceNumber: purchasingInvoices.invoiceNumber,
          invoiceDate: purchasingInvoices.invoiceDate,
          supplierId: purchasingInvoices.supplierId,
          supplierNif: purchasingInvoices.supplierNif,
          supplierName: purchasingInvoices.supplierName,
          supplierAddress: purchasingInvoices.supplierAddress,
          supplierIban: purchasingInvoices.supplierIban,
          receiverNif: purchasingInvoices.receiverNif,
          receiverName: purchasingInvoices.receiverName,
          poId: purchasingInvoices.poId,
          receiptId: purchasingInvoices.receiptId,
          submissionSource: purchasingInvoices.submissionSource,
          ocrExtracted: purchasingInvoices.ocrExtracted,
          ocrData: purchasingInvoices.ocrData,
          ocrConfidence: purchasingInvoices.ocrConfidence,
          ocrValidatedBy: purchasingInvoices.ocrValidatedBy,
          ocrValidatedAt: purchasingInvoices.ocrValidatedAt,
          subtotal: purchasingInvoices.subtotal,
          taxTotal: purchasingInvoices.taxTotal,
          shippingCost: purchasingInvoices.shippingCost,
          otherCharges: purchasingInvoices.otherCharges,
          totalAmount: purchasingInvoices.totalAmount,
          currency: purchasingInvoices.currency,
          paymentTerms: purchasingInvoices.paymentTerms,
          dueDate: purchasingInvoices.dueDate,
          threeWayMatchStatus: purchasingInvoices.threeWayMatchStatus,
          status: purchasingInvoices.status,
          approvedBy: purchasingInvoices.approvedBy,
          approvalDate: purchasingInvoices.approvalDate,
          paidAmount: purchasingInvoices.paidAmount,
          remainingAmount: purchasingInvoices.remainingAmount,
          documentUrl: purchasingInvoices.documentUrl,
          documentType: purchasingInvoices.documentType,
          documentHash: purchasingInvoices.documentHash,
          documentSize: purchasingInvoices.documentSize,
          documentUploadedAt: purchasingInvoices.documentUploadedAt,
          atcud: purchasingInvoices.atcud,
          hash: purchasingInvoices.hash,
          hashControl: purchasingInvoices.hashControl,
          series: purchasingInvoices.series,
          fiscalYear: purchasingInvoices.fiscalYear,
          retentionUntil: purchasingInvoices.retentionUntil,
          notes: purchasingInvoices.notes,
          attachments: purchasingInvoices.attachments,
          createdAt: purchasingInvoices.createdAt,
          updatedAt: purchasingInvoices.updatedAt,
          createdBy: purchasingInvoices.createdBy,
          // Supplier details from join
          supplierFromTable: suppliers.name,
          supplierTaxId: suppliers.taxId,
          supplierEmail: suppliers.email,
          supplierPhone: suppliers.phone,
        })
        .from(purchasingInvoices)
        .leftJoin(suppliers, eq(purchasingInvoices.supplierId, suppliers.id))
        .where(and(
          eq(purchasingInvoices.id, id),
          eq(purchasingInvoices.tenantId, tenantId),
          eq(purchasingInvoices.environment, environment)
        ))
        .limit(1);

      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }

      // Get bill lines - also filter by environment for proper isolation
      const lines = await db
        .select()
        .from(purchasingInvoiceLines)
        .where(and(
          eq(purchasingInvoiceLines.invoiceId, id),
          eq(purchasingInvoiceLines.tenantId, tenantId),
          eq(purchasingInvoiceLines.environment, environment)
        ))
        .orderBy(purchasingInvoiceLines.id);

      res.json({
        ...bill,
        // Use supplier data from table if not stored in invoice
        supplierName: bill.supplierName || bill.supplierFromTable,
        supplierNif: bill.supplierNif || bill.supplierTaxId,
        lines,
      });
      console.log(`[Financeiro AP] ✅ Bill detail fetched: ${bill.invoiceNumber}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error fetching bill detail:", error);
      res.status(500).json({ error: "Failed to fetch bill detail" });
    }
  });

  // PATCH /api/financeiro/bills/:id - Update vendor bill status (Treasury workflow)
  router.patch("/bills/:id", requirePermission('financeiro.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const environment = (req as any).environment || 'production';
      const userId = (req as any).user?.id || (req.session as any)?.userId;
      const { id } = req.params;
      
      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status, scheduledPaymentDate, paidAmount, remainingAmount } = req.body;

      // Validate status is one of the allowed values
      const allowedStatuses = ['draft', 'approved', 'scheduled', 'overdue', 'partially_paid', 'paid'];
      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({ 
          error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` 
        });
      }

      // Build update object
      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (status) {
        updateData.status = status;
        
        // Set approval data when status changes to approved
        if (status === 'approved') {
          updateData.approvedBy = userId;
          updateData.approvalDate = new Date();
        }
      }

      if (scheduledPaymentDate) {
        updateData.scheduledPaymentDate = new Date(scheduledPaymentDate);
      }

      if (paidAmount !== undefined) {
        updateData.paidAmount = paidAmount.toString();
      }

      if (remainingAmount !== undefined) {
        updateData.remainingAmount = remainingAmount.toString();
      }

      const [bill] = await db
        .update(purchasingInvoices)
        .set(updateData)
        .where(and(
          eq(purchasingInvoices.id, id),
          eq(purchasingInvoices.tenantId, tenantId),
          eq(purchasingInvoices.environment, environment)
        ))
        .returning();

      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }

      res.json(bill);
      console.log(`[Financeiro AP] ✅ Bill updated: ${bill.invoiceNumber} → status: ${status || 'unchanged'}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error updating bill:", error);
      res.status(500).json({ error: "Failed to update bill" });
    }
  });

  // DELETE /api/financeiro/bills/:id - Delete vendor bill (only draft)
  router.delete("/bills/:id", requirePermission('financeiro.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const environment = (req as any).environment || 'production';
      const { id } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check bill exists and is in draft status
      const [existingBill] = await db
        .select()
        .from(purchasingInvoices)
        .where(and(
          eq(purchasingInvoices.id, id),
          eq(purchasingInvoices.tenantId, tenantId),
          eq(purchasingInvoices.environment, environment)
        ))
        .limit(1);

      if (!existingBill) {
        return res.status(404).json({ error: "Bill not found" });
      }

      if (existingBill.status !== 'draft') {
        return res.status(400).json({ 
          error: "Can only delete bills in draft status" 
        });
      }

      // Delete bill lines first
      await db
        .delete(purchasingInvoiceLines)
        .where(and(
          eq(purchasingInvoiceLines.invoiceId, id),
          eq(purchasingInvoiceLines.tenantId, tenantId)
        ));

      // Delete the bill
      await db
        .delete(purchasingInvoices)
        .where(and(
          eq(purchasingInvoices.id, id),
          eq(purchasingInvoices.tenantId, tenantId)
        ));

      res.json({ success: true, message: "Bill deleted" });
      console.log(`[Financeiro AP] ✅ Bill deleted: ${existingBill.invoiceNumber}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error deleting bill:", error);
      res.status(500).json({ error: "Failed to delete bill" });
    }
  });

  // GET /api/financeiro/faturas-fornecedor/:id - Get vendor bill detail (Portuguese alias)
  router.get("/faturas-fornecedor/:id", requirePermission('financeiro.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const environment = (req as any).environment || 'production';
      const { id } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get bill with supplier info
      const [bill] = await db
        .select({
          id: purchasingInvoices.id,
          tenantId: purchasingInvoices.tenantId,
          environment: purchasingInvoices.environment,
          code: purchasingInvoices.code,
          invoiceNumber: purchasingInvoices.invoiceNumber,
          invoiceDate: purchasingInvoices.invoiceDate,
          supplierId: purchasingInvoices.supplierId,
          supplierNif: purchasingInvoices.supplierNif,
          supplierName: purchasingInvoices.supplierName,
          supplierAddress: purchasingInvoices.supplierAddress,
          supplierIban: purchasingInvoices.supplierIban,
          receiverNif: purchasingInvoices.receiverNif,
          receiverName: purchasingInvoices.receiverName,
          poId: purchasingInvoices.poId,
          receiptId: purchasingInvoices.receiptId,
          submissionSource: purchasingInvoices.submissionSource,
          ocrExtracted: purchasingInvoices.ocrExtracted,
          ocrData: purchasingInvoices.ocrData,
          ocrConfidence: purchasingInvoices.ocrConfidence,
          ocrValidatedBy: purchasingInvoices.ocrValidatedBy,
          ocrValidatedAt: purchasingInvoices.ocrValidatedAt,
          subtotal: purchasingInvoices.subtotal,
          taxTotal: purchasingInvoices.taxTotal,
          shippingCost: purchasingInvoices.shippingCost,
          otherCharges: purchasingInvoices.otherCharges,
          totalAmount: purchasingInvoices.totalAmount,
          currency: purchasingInvoices.currency,
          paymentTerms: purchasingInvoices.paymentTerms,
          dueDate: purchasingInvoices.dueDate,
          threeWayMatchStatus: purchasingInvoices.threeWayMatchStatus,
          status: purchasingInvoices.status,
          approvedBy: purchasingInvoices.approvedBy,
          approvalDate: purchasingInvoices.approvalDate,
          paidAmount: purchasingInvoices.paidAmount,
          remainingAmount: purchasingInvoices.remainingAmount,
          documentUrl: purchasingInvoices.documentUrl,
          documentType: purchasingInvoices.documentType,
          documentHash: purchasingInvoices.documentHash,
          documentSize: purchasingInvoices.documentSize,
          documentUploadedAt: purchasingInvoices.documentUploadedAt,
          atcud: purchasingInvoices.atcud,
          hash: purchasingInvoices.hash,
          hashControl: purchasingInvoices.hashControl,
          series: purchasingInvoices.series,
          fiscalYear: purchasingInvoices.fiscalYear,
          retentionUntil: purchasingInvoices.retentionUntil,
          notes: purchasingInvoices.notes,
          attachments: purchasingInvoices.attachments,
          createdAt: purchasingInvoices.createdAt,
          updatedAt: purchasingInvoices.updatedAt,
          createdBy: purchasingInvoices.createdBy,
          // Supplier details from join
          supplierFromTable: suppliers.name,
          supplierTaxId: suppliers.taxId,
          supplierEmail: suppliers.email,
          supplierPhone: suppliers.phone,
        })
        .from(purchasingInvoices)
        .leftJoin(suppliers, eq(purchasingInvoices.supplierId, suppliers.id))
        .where(and(
          eq(purchasingInvoices.id, id),
          eq(purchasingInvoices.tenantId, tenantId),
          eq(purchasingInvoices.environment, environment)
        ))
        .limit(1);

      if (!bill) {
        return res.status(404).json({ error: "Fatura não encontrada" });
      }

      // Get bill lines - also filter by environment for proper isolation
      const lines = await db
        .select()
        .from(purchasingInvoiceLines)
        .where(and(
          eq(purchasingInvoiceLines.invoiceId, id),
          eq(purchasingInvoiceLines.tenantId, tenantId),
          eq(purchasingInvoiceLines.environment, environment)
        ))
        .orderBy(purchasingInvoiceLines.id);

      res.json({
        ...bill,
        // Use supplier data from table if not stored in invoice
        supplierName: bill.supplierName || bill.supplierFromTable,
        supplierNif: bill.supplierNif || bill.supplierTaxId,
        lines,
      });
      console.log(`[Financeiro AP] ✅ Detalhe da fatura obtido: ${bill.invoiceNumber}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao obter detalhe da fatura:", error);
      res.status(500).json({ error: "Falha ao obter detalhe da fatura" });
    }
  });

  // ============================================================================
  // CONFERÊNCIA 3-VIAS (3-WAY MATCHING)
  // ============================================================================

  // GET /api/financeiro/conferencia-3-vias - Listar conferências 3-vias
  router.get("/conferencia-3-vias", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { matchStatus, page = 1, limit = 50 } = req.query;

      let conditions = [eq(purchasingInvoices.tenantId, tenantId)];

      if (matchStatus && matchStatus !== 'all') {
        conditions.push(eq(purchasingInvoices.threeWayMatchStatus, matchStatus as string));
      }

      const bills = await db
        .select()
        .from(purchasingInvoices)
        .where(and(...conditions))
        .orderBy(desc(purchasingInvoices.invoiceDate))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(purchasingInvoices)
        .where(and(...conditions));

      // Transform to include matching metadata
      const items = bills.map(bill => ({
        bill,
        matchStatus: bill.threeWayMatchStatus,
        confidenceScore: bill.ocrConfidence ? parseFloat(bill.ocrConfidence) : null,
        variances: {
          poDiscrepancy: bill.poDiscrepancy,
          receiptDiscrepancy: bill.receiptDiscrepancy,
          priceDiscrepancy: bill.priceDiscrepancy,
        }
      }));

      res.json({ 
        items, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listadas ${items.length} conferências 3-vias (página ${page}/${Math.ceil(Number(count) / Number(limit))}) para tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao listar conferências 3-vias:", error);
      res.status(500).json({ error: "Failed to list 3-way matching" });
    }
  });

  // POST /api/financeiro/conferencia-3-vias/:id/aprovar - Aprovar conferência
  router.post("/conferencia-3-vias/:id/aprovar", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;
      const { id } = req.params;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Update matching status to matched
      const [bill] = await db
        .update(purchasingInvoices)
        .set({
          threeWayMatchStatus: 'matched',
          matchedByAgentId: userId,
          matchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(purchasingInvoices.id, id),
          eq(purchasingInvoices.tenantId, tenantId)
        ))
        .returning();

      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }

      res.json(bill);
      console.log(`[Financeiro AP] ✅ Conferência 3-vias aprovada: ${bill.invoiceNumber} para tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao aprovar conferência 3-vias:", error);
      res.status(500).json({ error: "Failed to approve 3-way matching" });
    }
  });

  // ============================================================================
  // MATCHING (English alias for CONFERÊNCIA 3-VIAS)
  // ============================================================================

  // GET /api/financeiro/matching - List 3-way matching (English alias)
  router.get("/matching", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { matchStatus, page = 1, limit = 50 } = req.query;

      let conditions = [eq(purchasingInvoices.tenantId, tenantId)];

      if (matchStatus && matchStatus !== 'all') {
        conditions.push(eq(purchasingInvoices.threeWayMatchStatus, matchStatus as string));
      }

      const bills = await db
        .select()
        .from(purchasingInvoices)
        .where(and(...conditions))
        .orderBy(desc(purchasingInvoices.invoiceDate))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(purchasingInvoices)
        .where(and(...conditions));

      // Transform to include matching metadata
      const items = bills.map(bill => ({
        bill,
        matchStatus: bill.threeWayMatchStatus,
        confidenceScore: bill.ocrConfidence ? parseFloat(bill.ocrConfidence) : null,
        variances: {
          poDiscrepancy: bill.poDiscrepancy,
          receiptDiscrepancy: bill.receiptDiscrepancy,
          priceDiscrepancy: bill.priceDiscrepancy,
        }
      }));

      res.json({ 
        items, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listed ${items.length} 3-way matching items (page ${page}/${Math.ceil(Number(count) / Number(limit))}) for tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error listing 3-way matching:", error);
      res.status(500).json({ error: "Failed to list 3-way matching" });
    }
  });

  // POST /api/financeiro/matching/:id/approve - Approve matching (English alias)
  router.post("/matching/:id/approve", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;
      const { id } = req.params;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Update matching status to matched
      const [bill] = await db
        .update(purchasingInvoices)
        .set({
          threeWayMatchStatus: 'matched',
          matchedByAgentId: userId,
          matchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(purchasingInvoices.id, id),
          eq(purchasingInvoices.tenantId, tenantId)
        ))
        .returning();

      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }

      res.json(bill);
      console.log(`[Financeiro AP] ✅ 3-way matching approved: ${bill.invoiceNumber} for tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error approving 3-way matching:", error);
      res.status(500).json({ error: "Failed to approve 3-way matching" });
    }
  });

  // ============================================================================
  // APROVAÇÕES AP (AP APPROVAL WORKFLOWS)
  // ============================================================================

  // GET /api/financeiro/aprovacoes-ap - Listar workflows de aprovação AP
  router.get("/aprovacoes-ap", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status, stage, page = 1, limit = 50 } = req.query;

      let conditions = [
        eq(approvalWorkflows.tenantId, tenantId),
        eq(approvalWorkflows.entityType, 'purchasing_invoice')
      ];

      if (status && status !== 'all') {
        conditions.push(eq(approvalWorkflows.status, status as string));
      }
      if (stage) {
        conditions.push(sql`${approvalWorkflows.stages} @> ${JSON.stringify([stage])}`);
      }

      const workflows = await db
        .select()
        .from(approvalWorkflows)
        .where(and(...conditions))
        .orderBy(desc(approvalWorkflows.createdAt))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(approvalWorkflows)
        .where(and(...conditions));

      res.json({ 
        workflows, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listados ${workflows.length} workflows de aprovação AP (página ${page}/${Math.ceil(Number(count) / Number(limit))}) para tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao listar workflows de aprovação AP:", error);
      res.status(500).json({ error: "Failed to list AP approval workflows" });
    }
  });

  // POST /api/financeiro/aprovacoes-ap/:id/aprovar - Aprovar workflow
  router.post("/aprovacoes-ap/:id/aprovar", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;
      const { id } = req.params;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const [workflow] = await db
        .update(approvalWorkflows)
        .set({
          status: 'approved',
          updatedAt: new Date(),
        })
        .where(and(
          eq(approvalWorkflows.id, id),
          eq(approvalWorkflows.tenantId, tenantId)
        ))
        .returning();

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      res.json(workflow);
      console.log(`[Financeiro AP] ✅ Workflow de aprovação aprovado: ${workflow.id} para tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao aprovar workflow:", error);
      res.status(500).json({ error: "Failed to approve workflow" });
    }
  });

  // ============================================================================
  // APPROVALS (English alias for APROVAÇÕES AP)
  // ============================================================================

  // GET /api/financeiro/approvals - List AP approval workflows (English alias)
  router.get("/approvals", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status, stage, page = 1, limit = 50 } = req.query;

      let conditions = [
        eq(approvalWorkflows.tenantId, tenantId),
        eq(approvalWorkflows.entityType, 'purchasing_invoice')
      ];

      if (status && status !== 'all') {
        conditions.push(eq(approvalWorkflows.status, status as string));
      }
      if (stage) {
        conditions.push(sql`${approvalWorkflows.stages} @> ${JSON.stringify([stage])}`);
      }

      const workflows = await db
        .select()
        .from(approvalWorkflows)
        .where(and(...conditions))
        .orderBy(desc(approvalWorkflows.createdAt))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(approvalWorkflows)
        .where(and(...conditions));

      res.json({ 
        workflows, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listed ${workflows.length} AP approval workflows (page ${page}/${Math.ceil(Number(count) / Number(limit))}) for tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error listing AP approval workflows:", error);
      res.status(500).json({ error: "Failed to list AP approval workflows" });
    }
  });

  // POST /api/financeiro/approvals/:id/approve - Approve workflow (English alias)
  router.post("/approvals/:id/approve", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;
      const { id } = req.params;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const [workflow] = await db
        .update(approvalWorkflows)
        .set({
          status: 'approved',
          updatedAt: new Date(),
        })
        .where(and(
          eq(approvalWorkflows.id, id),
          eq(approvalWorkflows.tenantId, tenantId)
        ))
        .returning();

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      res.json(workflow);
      console.log(`[Financeiro AP] ✅ Approval workflow approved: ${workflow.id} for tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error approving workflow:", error);
      res.status(500).json({ error: "Failed to approve workflow" });
    }
  });

  // ============================================================================
  // PLANOS DE PAGAMENTO (PAYMENT PLANS)
  // ============================================================================

  // GET /api/financeiro/planos-pagamento - Listar planos de pagamento
  router.get("/planos-pagamento", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status, executionDate, page = 1, limit = 50 } = req.query;

      let conditions = [eq(paymentPlans.tenantId, tenantId)];

      if (status && status !== 'all') {
        conditions.push(eq(paymentPlans.status, status as string));
      }
      if (executionDate) {
        conditions.push(eq(paymentPlans.scheduledDate, new Date(executionDate as string)));
      }

      const plans = await db
        .select()
        .from(paymentPlans)
        .where(and(...conditions))
        .orderBy(desc(paymentPlans.scheduledDate))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(paymentPlans)
        .where(and(...conditions));

      res.json({ 
        plans, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listados ${plans.length} planos de pagamento (página ${page}/${Math.ceil(Number(count) / Number(limit))}) para tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao listar planos de pagamento:", error);
      res.status(500).json({ error: "Failed to list payment plans" });
    }
  });

  // POST /api/financeiro/planos-pagamento - Criar plano de pagamento
  router.post("/planos-pagamento", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { billIds, title, executionDate, notes } = req.body;

      // Validate billIds
      if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
        return res.status(400).json({ error: "billIds array is required and must not be empty" });
      }

      // Validate bills exist and belong to tenant
      const bills = await db
        .select()
        .from(purchasingInvoices)
        .where(and(
          eq(purchasingInvoices.tenantId, tenantId),
          sql`${purchasingInvoices.id} = ANY(${billIds})`
        ));

      if (bills.length !== billIds.length) {
        return res.status(400).json({ error: "Some bills not found or do not belong to tenant" });
      }

      // Calculate total amount
      const totalAmount = bills.reduce((sum, bill) => {
        return sum + parseFloat(bill.totalAmount);
      }, 0);

      // Set default execution date (+7 days)
      const defaultExecutionDate = new Date();
      defaultExecutionDate.setDate(defaultExecutionDate.getDate() + 7);

      const [plan] = await db.insert(paymentPlans).values({
        batchName: title || `Plano de Pagamento ${new Date().toISOString().split('T')[0]}`,
        scheduledDate: executionDate ? new Date(executionDate) : defaultExecutionDate,
        totalAmount: totalAmount.toFixed(2),
        billIds: billIds,
        status: 'pending',
        approvalRequired: totalAmount > 10000,
        notes: notes || undefined,
        createdBy: userId,
      }).returning();

      res.status(201).json(plan);
      console.log(`[Financeiro AP] ✅ Plano de pagamento criado: ${plan.batchName} com ${billIds.length} faturas para tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Erro ao criar plano de pagamento:", error);
      res.status(500).json({ error: "Failed to create payment plan" });
    }
  });

  // ============================================================================
  // PAYMENT-PLANS (English alias for PLANOS DE PAGAMENTO)
  // ============================================================================

  // GET /api/financeiro/payment-plans - List payment plans (English alias)
  router.get("/payment-plans", requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { status, executionDate, page = 1, limit = 50 } = req.query;

      let conditions = [eq(paymentPlans.tenantId, tenantId)];

      if (status && status !== 'all') {
        conditions.push(eq(paymentPlans.status, status as string));
      }
      if (executionDate) {
        conditions.push(eq(paymentPlans.scheduledDate, new Date(executionDate as string)));
      }

      const plans = await db
        .select()
        .from(paymentPlans)
        .where(and(...conditions))
        .orderBy(desc(paymentPlans.scheduledDate))
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count (separate query)
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(paymentPlans)
        .where(and(...conditions));

      res.json({ 
        plans, 
        total: Number(count),
        page: Number(page),
        limit: Number(limit)
      });
      console.log(`[Financeiro AP] ✅ Listed ${plans.length} payment plans (page ${page}/${Math.ceil(Number(count) / Number(limit))}) for tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error listing payment plans:", error);
      res.status(500).json({ error: "Failed to list payment plans" });
    }
  });

  // POST /api/financeiro/payment-plans - Create payment plan (English alias)
  router.post("/payment-plans", requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id || (req.session as any)?.userId;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { billIds, title, executionDate, notes } = req.body;

      // Validate billIds
      if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
        return res.status(400).json({ error: "billIds array is required and must not be empty" });
      }

      // Validate bills exist and belong to tenant
      const bills = await db
        .select()
        .from(purchasingInvoices)
        .where(and(
          eq(purchasingInvoices.tenantId, tenantId),
          sql`${purchasingInvoices.id} = ANY(${billIds})`
        ));

      if (bills.length !== billIds.length) {
        return res.status(400).json({ error: "Some bills not found or do not belong to tenant" });
      }

      // Calculate total amount
      const totalAmount = bills.reduce((sum, bill) => {
        return sum + parseFloat(bill.totalAmount);
      }, 0);

      // Set default execution date (+7 days)
      const defaultExecutionDate = new Date();
      defaultExecutionDate.setDate(defaultExecutionDate.getDate() + 7);

      const [plan] = await db.insert(paymentPlans).values({
        batchName: title || `Payment Plan ${new Date().toISOString().split('T')[0]}`,
        scheduledDate: executionDate ? new Date(executionDate) : defaultExecutionDate,
        totalAmount: totalAmount.toFixed(2),
        billIds: billIds,
        status: 'pending',
        approvalRequired: totalAmount > 10000,
        notes: notes || undefined,
        createdBy: userId,
      }).returning();

      res.status(201).json(plan);
      console.log(`[Financeiro AP] ✅ Payment plan created: ${plan.batchName} with ${billIds.length} bills for tenant ${tenantId}`);
    } catch (error: any) {
      console.error("[Financeiro AP] ❌ Error creating payment plan:", error);
      res.status(500).json({ error: "Failed to create payment plan" });
    }
  });

  console.log("[Financeiro AP] ✅ AP Router configurado com 8 rotas: bills, matching, approvals, payment-plans (PT + EN)");

  return router;
}
