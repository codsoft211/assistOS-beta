/**
 * Accounts Receivable (AR) Module Routes
 * Invoices, Payments, Quotes, Proposals
 * Extracted from financeiro.ts (lines 298-2646)
 */

import { Router } from "express";
import { requirePermission } from "../../middleware/permissions.middleware";
import { db } from "../../db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { 
  invoices, 
  invoiceLines,
  payments, 
  paymentAllocations,
  clients,
  costTemplates,
  quotes,
  quoteLines,
  proposals,
  tenants,
  dunningRuns,
  paymentReminders,
  documentLinks,
  documents
} from "../../../../shared/schema";
import { selectOneFromTenantTable } from "../../utils/tenant-db-helper";
import { costCalculatorService, QuoteCalculationInput } from "../../../../packages/modules/financeiro/services/costCalculatorService";
import { toolRegistry } from "../../../../packages/ai/tools/kernel";
import { faturaSchema, recebimentoSchema } from "./shared";

export function createArRouter(): Router {
  const router = Router();
// ============================================================================
// FATURAS (INVOICES)
// ============================================================================

// GET /api/financeiro/faturas - List invoices
router.get("/faturas", requirePermission('financeiro.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status, clienteId, dataInicio, dataFim } = req.query;

    let conditions = [
      eq(invoices.tenantId, tenantId),
      eq(invoices.invoiceType, 'receivable')
    ];

    if (status && status !== 'all') {
      conditions.push(eq(invoices.status, status as string));
    }
    if (clienteId) {
      conditions.push(eq(invoices.clientId, clienteId as string));
    }
    if (dataInicio) {
      conditions.push(gte(invoices.issueDate, new Date(dataInicio as string)));
    }
    if (dataFim) {
      conditions.push(lte(invoices.issueDate, new Date(dataFim as string)));
    }

    const results = await db
      .select({
        id: invoices.id,
        numero: invoices.invoiceNumber,
        cliente: invoices.clientName,
        clienteId: invoices.clientId,
        dataEmissao: invoices.issueDate,
        dataVencimento: invoices.dueDate,
        valorTotal: invoices.totalAmount,
        iva: invoices.taxAmount,
        estado: invoices.status,
      })
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.issueDate));

    res.json(results.map(r => ({
      ...r,
      dataEmissao: r.dataEmissao?.toISOString() || '',
      dataVencimento: r.dataVencimento?.toISOString() || '',
      valorTotal: parseFloat(r.valorTotal || '0'),
      iva: parseFloat(r.iva || '0'),
    })));
  } catch (error: any) {
    console.error("[Financeiro API] Error listing faturas:", error);
    res.status(500).json({ error: "Failed to list faturas" });
  }
});

// POST /api/financeiro/faturas - Create invoice
router.post("/faturas", requirePermission('financeiro.faturas.create'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = faturaSchema.parse(req.body);

    // Get client info
    const cliente = await db
      .select()
      .from(clients)
      .where(and(
        eq(clients.id, validatedData.clienteId),
        eq(clients.tenantId, tenantId)
      ))
      .limit(1);

    if (!cliente || cliente.length === 0) {
      return res.status(404).json({ error: "Cliente not found" });
    }

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;

    validatedData.linhas.forEach(linha => {
      const linhaTotal = linha.quantidade * linha.precoUnitario;
      const linhaTax = linhaTotal * (linha.taxaIVA / 100);
      subtotal += linhaTotal;
      taxAmount += linhaTax;
    });

    const totalAmount = subtotal + taxAmount;

    // Generate invoice number
    const year = new Date().getFullYear();
    const lastInvoice = await db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.fiscalYear, year)
      ))
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    let nextNumber = 1;
    if (lastInvoice.length > 0) {
      const match = lastInvoice[0].invoiceNumber.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const invoiceNumber = `FT ${year}/${nextNumber.toString().padStart(5, '0')}`;

    // Create invoice
    const [newInvoice] = await db.insert(invoices).values({
      tenantId,
      invoiceType: 'receivable',
      invoiceNumber,
      clientId: validatedData.clienteId,
      clientName: cliente[0].name,
      clientNif: cliente[0].nif || undefined,
      issueDate: new Date(validatedData.dataEmissao),
      dueDate: new Date(validatedData.dataVencimento),
      status: 'draft',
      paymentStatus: 'pending',
      currency: 'EUR',
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      paidAmount: '0',
      fiscalYear: year,
      notes: validatedData.notas,
      createdBy: userId,
    }).returning();

    // Create invoice lines
    for (let i = 0; i < validatedData.linhas.length; i++) {
      const linha = validatedData.linhas[i];
      const netAmount = linha.quantidade * linha.precoUnitario;
      const lineTaxAmount = netAmount * (linha.taxaIVA / 100);
      const lineTotal = netAmount + lineTaxAmount;

      await db.insert(invoiceLines).values({
        tenantId,
        invoiceId: newInvoice.id,
        lineNumber: i + 1,
        description: linha.descricao,
        quantity: linha.quantidade.toFixed(3),
        unit: 'un',
        unitPrice: linha.precoUnitario.toFixed(4),
        discountRate: '0',
        discountAmount: '0',
        netAmount: netAmount.toFixed(2),
        taxRate: linha.taxaIVA.toFixed(2),
        taxAmount: lineTaxAmount.toFixed(2),
        totalAmount: lineTotal.toFixed(2),
      });
    }

    res.status(201).json(newInvoice);
  } catch (error: any) {
    console.error("[Financeiro API] Error creating fatura:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create fatura" });
  }
});

// GET /api/financeiro/faturas/:id - Get invoice by ID
router.get("/faturas/:id", requirePermission('financeiro.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, req.params.id),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: "Fatura not found" });
    }

    // Get invoice lines
    const lines = await db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, req.params.id))
      .orderBy(invoiceLines.lineNumber);

    res.json({
      ...invoice,
      linhas: lines,
    });
  } catch (error: any) {
    console.error("[Financeiro API] Error getting fatura:", error);
    res.status(500).json({ error: "Failed to get fatura" });
  }
});

// DELETE /api/financeiro/faturas/:id - Delete invoice
router.delete("/faturas/:id", requirePermission('financeiro.faturas.delete'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(invoices)
      .where(and(
        eq(invoices.id, req.params.id),
        eq(invoices.tenantId, tenantId)
      ));

    res.json({ message: "Fatura deleted successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error deleting fatura:", error);
    res.status(500).json({ error: "Failed to delete fatura" });
  }
});

// POST /api/financeiro/faturas/:id/marcar-paga
router.post("/faturas/:id/marcar-paga", requirePermission('financeiro.faturas.edit'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, req.params.id),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: "Fatura not found" });
    }

    await db
      .update(invoices)
      .set({
        paymentStatus: 'paid',
        paidAmount: invoice.totalAmount,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, req.params.id));

    res.json({ message: "Fatura marked as paid" });
  } catch (error: any) {
    console.error("[Financeiro API] Error marking fatura as paid:", error);
    res.status(500).json({ error: "Failed to mark fatura as paid" });
  }
});

// ============================================================================
// INVOICES (English alias for FATURAS)
// ============================================================================

// GET /api/financeiro/invoices - List invoices (English alias)
router.get("/invoices", requirePermission('financeiro.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status, search } = req.query;

    let conditions = [
      eq(invoices.tenantId, tenantId),
      eq(invoices.invoiceType, 'receivable')
    ];

    if (status && status !== 'all') {
      conditions.push(eq(invoices.status, status as string));
    }
    
    // Search by invoice number or client name
    if (search && typeof search === 'string') {
      conditions.push(
        sql`(${invoices.invoiceNumber} ILIKE ${'%' + search + '%'} OR ${invoices.clientName} ILIKE ${'%' + search + '%'})`
      );
    }

    const results = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientId: invoices.clientId,
        clientName: invoices.clientName,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.issueDate));

    res.json(results.map(r => ({
      ...r,
      issueDate: r.issueDate?.toISOString() || '',
      dueDate: r.dueDate?.toISOString() || '',
      totalAmount: parseFloat(r.totalAmount || '0'),
    })));
  } catch (error: any) {
    console.error("[Financeiro API] Error listing invoices:", error);
    res.status(500).json({ error: "Failed to list invoices" });
  }
});

// POST /api/financeiro/invoices - Create invoice (English alias)
router.post("/invoices", requirePermission('financeiro.faturas.create'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { clientId, clientName, issueDate, dueDate, items, notes, status } = req.body;

    // Calculate totals from items
    let subtotal = 0;
    let taxAmount = 0;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    items.forEach((item: any) => {
      const itemSubtotal = (item.quantity || 0) * (item.unitPrice || 0);
      const itemTax = itemSubtotal * 0.23; // 23% IVA default
      subtotal += itemSubtotal;
      taxAmount += itemTax;
    });

    const totalAmount = subtotal + taxAmount;

    // Generate invoice number
    const year = new Date().getFullYear();
    const lastInvoice = await db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.fiscalYear, year)
      ))
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    let nextNumber = 1;
    if (lastInvoice.length > 0) {
      const match = lastInvoice[0].invoiceNumber.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const invoiceNumber = `FT ${year}/${nextNumber.toString().padStart(5, '0')}`;

    // Create invoice
    const [newInvoice] = await db.insert(invoices).values({
      tenantId,
      invoiceType: 'receivable',
      invoiceNumber,
      clientId: clientId || undefined,
      clientName: clientName || 'Cliente sem nome',
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      status: status || 'draft',
      paymentStatus: 'pending',
      currency: 'EUR',
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      paidAmount: '0',
      fiscalYear: year,
      notes: notes,
      createdBy: userId,
    }).returning();

    // Create invoice lines
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const netAmount = (item.quantity || 0) * (item.unitPrice || 0);
      const lineTaxAmount = netAmount * 0.23;
      const lineTotal = netAmount + lineTaxAmount;

      await db.insert(invoiceLines).values({
        tenantId,
        invoiceId: newInvoice.id,
        lineNumber: i + 1,
        description: item.description || '',
        quantity: (item.quantity || 0).toFixed(3),
        unit: item.unit || 'un',
        unitPrice: (item.unitPrice || 0).toFixed(4),
        discountRate: '0',
        discountAmount: '0',
        netAmount: netAmount.toFixed(2),
        taxRate: '23.00',
        taxAmount: lineTaxAmount.toFixed(2),
        totalAmount: lineTotal.toFixed(2),
      });
    }

    res.status(201).json(newInvoice);
  } catch (error: any) {
    console.error("[Financeiro API] Error creating invoice:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// GET /api/financeiro/invoices/:id - Get invoice by ID (English alias)
router.get("/invoices/:id", requirePermission('financeiro.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, req.params.id),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Get invoice lines
    const lines = await db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, req.params.id))
      .orderBy(invoiceLines.lineNumber);

    // Transform lines to match expected format
    const items = lines.map(line => ({
      lineNumber: line.lineNumber,
      description: line.description || '',
      quantity: parseFloat(line.quantity || '0'),
      unit: line.unit || 'un',
      unitPrice: parseFloat(line.unitPrice || '0'),
      totalPrice: parseFloat(line.netAmount || '0'),
    }));

    res.json({
      ...invoice,
      items,
      issueDate: invoice.issueDate?.toISOString() || '',
      dueDate: invoice.dueDate?.toISOString() || '',
      subtotal: parseFloat(invoice.subtotal || '0'),
      taxAmount: parseFloat(invoice.taxAmount || '0'),
      totalAmount: parseFloat(invoice.totalAmount || '0'),
    });
  } catch (error: any) {
    console.error("[Financeiro API] Error getting invoice:", error);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});

// PATCH /api/financeiro/invoices/:id - Update invoice (English alias)
router.patch("/invoices/:id", requirePermission('financeiro.faturas.edit'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if invoice exists
    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, req.params.id),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const { clientId, clientName, issueDate, dueDate, items, notes, status } = req.body;

    // Calculate totals from items if provided
    let subtotal = 0;
    let taxAmount = 0;

    if (items && items.length > 0) {
      items.forEach((item: any) => {
        const itemSubtotal = (item.quantity || 0) * (item.unitPrice || 0);
        const itemTax = itemSubtotal * 0.23; // 23% IVA default
        subtotal += itemSubtotal;
        taxAmount += itemTax;
      });

      // Delete existing lines
      await db
        .delete(invoiceLines)
        .where(eq(invoiceLines.invoiceId, req.params.id));

      // Create new lines
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const netAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const lineTaxAmount = netAmount * 0.23;
        const lineTotal = netAmount + lineTaxAmount;

        await db.insert(invoiceLines).values({
          tenantId,
          invoiceId: req.params.id,
          lineNumber: i + 1,
          description: item.description || '',
          quantity: (item.quantity || 0).toFixed(3),
          unit: item.unit || 'un',
          unitPrice: (item.unitPrice || 0).toFixed(4),
          discountRate: '0',
          discountAmount: '0',
          netAmount: netAmount.toFixed(2),
          taxRate: '23.00',
          taxAmount: lineTaxAmount.toFixed(2),
          totalAmount: lineTotal.toFixed(2),
        });
      }
    }

    const totalAmount = subtotal + taxAmount;

    // Update invoice
    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        clientId: clientId || existing.clientId,
        clientName: clientName || existing.clientName,
        issueDate: issueDate ? new Date(issueDate) : existing.issueDate,
        dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
        subtotal: items ? subtotal.toFixed(2) : existing.subtotal,
        taxAmount: items ? taxAmount.toFixed(2) : existing.taxAmount,
        totalAmount: items ? totalAmount.toFixed(2) : existing.totalAmount,
        notes: notes !== undefined ? notes : existing.notes,
        status: status || existing.status,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, req.params.id))
      .returning();

    res.json(updatedInvoice);
  } catch (error: any) {
    console.error("[Financeiro API] Error updating invoice:", error);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

// DELETE /api/financeiro/invoices/:id - Delete invoice (English alias)
router.delete("/invoices/:id", requirePermission('financeiro.faturas.delete'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(invoices)
      .where(and(
        eq(invoices.id, req.params.id),
        eq(invoices.tenantId, tenantId)
      ));

    res.json({ message: "Invoice deleted successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error deleting invoice:", error);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});


// ============================================================================
// RECEBIMENTOS (PAYMENTS)
// ============================================================================

// GET /api/financeiro/recebimentos - List payments
router.get("/recebimentos", requirePermission('financeiro.recebimentos.view'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { dataInicio, dataFim, metodo, cliente } = req.query;

    let conditions = [
      eq(payments.tenantId, tenantId),
      eq(payments.type, 'received')
    ];

    if (dataInicio) {
      conditions.push(gte(payments.paymentDate, new Date(dataInicio as string)));
    }
    if (dataFim) {
      conditions.push(lte(payments.paymentDate, new Date(dataFim as string)));
    }
    if (metodo && metodo !== 'all') {
      conditions.push(eq(payments.paymentMethod, metodo as string));
    }

    const results = await db
      .select({
        id: payments.id,
        data: payments.paymentDate,
        valor: payments.amount,
        metodoPagamento: payments.paymentMethod,
        referencia: payments.reference,
        notas: payments.notes,
        faturaId: payments.invoiceId,
        reconciledAt: payments.reconciledAt,
      })
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.paymentDate));

    // Fetch invoice info for each payment
    const paymentsWithInvoiceInfo = await Promise.all(
      results.map(async (payment) => {
        let faturaAssociada = null;
        let cliente = null;

        if (payment.faturaId) {
          const [invoice] = await db
            .select({
              numero: invoices.invoiceNumber,
              cliente: invoices.clientName,
            })
            .from(invoices)
            .where(eq(invoices.id, payment.faturaId))
            .limit(1);

          if (invoice) {
            faturaAssociada = invoice.numero;
            cliente = invoice.cliente;
          }
        }

        return {
          ...payment,
          data: payment.data?.toISOString() || '',
          valor: parseFloat(payment.valor || '0'),
          faturaAssociada,
          cliente,
        };
      })
    );

    res.json(paymentsWithInvoiceInfo);
  } catch (error: any) {
    console.error("[Financeiro API] Error listing recebimentos:", error);
    res.status(500).json({ error: "Failed to list recebimentos" });
  }
});

// POST /api/financeiro/recebimentos - Create payment
router.post("/recebimentos", requirePermission('financeiro.recebimentos.create'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = recebimentoSchema.parse(req.body);

    const [newPayment] = await db.insert(payments).values({
      tenantId,
      invoiceId: validatedData.faturaId,
      type: 'received',
      paymentMethod: validatedData.metodoPagamento,
      paymentDate: new Date(validatedData.dataRecebimento),
      amount: validatedData.valor.toFixed(2),
      currency: 'EUR',
      status: 'completed',
      reference: validatedData.referencia,
      notes: validatedData.notas,
    }).returning();

    // If associated with invoice, update invoice paid amount
    if (validatedData.faturaId) {
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(
          eq(invoices.id, validatedData.faturaId),
          eq(invoices.tenantId, tenantId)
        ))
        .limit(1);

      if (invoice) {
        const newPaidAmount = parseFloat(invoice.paidAmount || '0') + validatedData.valor;
        const totalAmount = parseFloat(invoice.totalAmount || '0');

        await db
          .update(invoices)
          .set({
            paidAmount: newPaidAmount.toFixed(2),
            paymentStatus: newPaidAmount >= totalAmount ? 'paid' : 'partial',
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, validatedData.faturaId));

        // Create allocation
        await db.insert(paymentAllocations).values({
          tenantId,
          paymentId: newPayment.id,
          invoiceId: validatedData.faturaId,
          allocatedAmount: validatedData.valor.toFixed(2),
        });
      }
    }

    res.status(201).json(newPayment);
  } catch (error: any) {
    console.error("[Financeiro API] Error creating recebimento:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create recebimento" });
  }
});

// PATCH /api/financeiro/recebimentos/:id - Update payment (for reconciliation)
router.patch("/recebimentos/:id", requirePermission('financeiro.recebimentos.edit'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { reconciledAt } = req.body;

    await db
      .update(payments)
      .set({ reconciledAt: reconciledAt ? new Date(reconciledAt) : null })
      .where(and(
        eq(payments.id, id),
        eq(payments.tenantId, tenantId)
      ));

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Financeiro API] Error updating payment:", error);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// GET /api/financeiro/faturas/abertas - Get open invoices
router.get("/faturas/abertas", requirePermission('financeiro.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const openInvoices = await db
      .select({
        id: invoices.id,
        numero: invoices.invoiceNumber,
        valor: sql<number>`${invoices.totalAmount} - ${invoices.paidAmount}`,
      })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.invoiceType, 'receivable'),
        sql`${invoices.totalAmount} > ${invoices.paidAmount}`
      ))
      .orderBy(desc(invoices.issueDate));

    res.json(openInvoices.map(inv => ({
      ...inv,
      valor: parseFloat(inv.valor?.toString() || '0'),
    })));
  } catch (error: any) {
    console.error("[Financeiro API] Error listing open invoices:", error);
    res.status(500).json({ error: "Failed to list open invoices" });
  }
});

// GET /api/financeiro/recebimentos/pendentes - Get pending payments
router.get("/recebimentos/pendentes", requirePermission('financeiro.recebimentos.view'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Return empty for now - this would be payments not yet matched with bank transactions
    res.json([]);
  } catch (error: any) {
    console.error("[Financeiro API] Error listing pending payments:", error);
    res.status(500).json({ error: "Failed to list pending payments" });
  }
});

// ============================================================================
// QUOTES (ORÇAMENTOS) - QUOTE ENGINE
// ============================================================================

// GET /api/financeiro/quotes - listar orçamentos
router.get("/quotes", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status, clientId } = req.query;

    const conditions = [eq(quotes.tenantId, tenantId)];
    
    if (status && typeof status === 'string') {
      conditions.push(eq(quotes.status, status));
    }
    if (clientId && typeof clientId === 'string') {
      conditions.push(eq(quotes.clientId, clientId));
    }

    const result = await db
      .select()
      .from(quotes)
      .where(and(...conditions))
      .orderBy(desc(quotes.createdAt));
    res.json(result);
  } catch (error: any) {
    console.error("[Financeiro API] Error listing quotes:", error);
    res.status(500).json({ error: "Failed to list quotes" });
  }
});

// POST /api/financeiro/quotes - criar orçamento usando CostCalculatorService
router.post("/quotes", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const input: QuoteCalculationInput = {
      ...req.body,
      tenantId
    };

    // Calcular orçamento usando o serviço
    const result = await costCalculatorService.calculateQuote(input);

    // Salvar quote no banco
    const [quote] = await db.insert(quotes).values({
      tenantId,
      clientId: result.quote.clientId,
      opportunityId: result.quote.opportunityId,
      templateId: result.quote.templateId,
      quoteNumber: result.quote.quoteNumber,
      title: result.quote.title,
      description: result.quote.description,
      status: result.quote.status,
      requirements: result.quote.requirements,
      calculations: result.quote.calculations,
      totalCost: result.quote.totalCost,
      totalPrice: result.quote.totalPrice,
      margin: result.quote.margin,
      marginPercentage: result.quote.marginPercentage,
      createdBy: userId
    }).returning();

    // Salvar quote lines
    const lines = await db.insert(quoteLines).values(
      result.quoteLines.map(line => ({
        quoteId: quote.id,
        lineNumber: line.lineNumber,
        description: line.description,
        category: line.category,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice,
        totalCost: line.totalCost,
        totalPrice: line.totalPrice,
        margin: line.margin,
        marginPercentage: line.marginPercentage
      }))
    ).returning();

    res.status(201).json({ quote, lines });
  } catch (error: any) {
    console.error("[Financeiro API] Error creating quote:", error);
    res.status(500).json({ error: error.message || "Failed to create quote" });
  }
});

// POST /api/financeiro/quotes/generate - Auto-geração via AI
const generateQuoteSchema = z.object({
  description: z.string().min(10, "Descrição muito curta"),
  clientId: z.string().uuid().optional(),
  projectContext: z.string().optional()
});

router.post("/quotes/generate", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { description, clientId, projectContext } = generateQuoteSchema.parse(req.body);
    
    // STEP 1: Extract requirements usando AI tool
    const extractTool = toolRegistry.get('extract_quote_requirements');
    if (!extractTool) {
      return res.status(500).json({ error: "ExtractQuoteRequirementsTool not found" });
    }
    
    const extractResult = await extractTool.execute(
      { text: description, context: projectContext ? { existingQuoteId: projectContext } : undefined },
      { tenantId, userId, environment: 'sandbox' }
    );
    
    if (!extractResult.success || !extractResult.data) {
      return res.status(400).json({ 
        error: "Falha ao extrair requisitos",
        details: extractResult.error?.message 
      });
    }
    
    const extractedRequirements = extractResult.data;
    
    // STEP 2: Find best template usando TemplateMappingService
    const { TemplateMappingService } = await import('../../../../packages/modules/financeiro/services/templateMappingService');
    const mappingResult = await TemplateMappingService.findBestTemplate(extractedRequirements, tenantId);
    
    if (!mappingResult.bestMatch) {
      return res.status(404).json({ 
        error: "Nenhum template compatível encontrado",
        message: "Crie um template primeiro ou forneça mais detalhes"
      });
    }
    
    // STEP 3: Preparar input para CostCalculator
    // Converter requirements extraídos para formato QuoteCalculationInput
    const calculationInput: QuoteCalculationInput = {
      tenantId,
      templateId: mappingResult.bestMatch.template.id,
      clientId: clientId,
      requirements: {
        title: extractedRequirements.projectName,
        description: description,
        items: [
          ...extractedRequirements.requirements.labor.map((role: any) => ({
            description: role.description || role.role,
            roleId: undefined,
            hours: role.hours,
            quantity: 1,
            unit: 'hours'
          })),
          ...extractedRequirements.requirements.materials.map((mat: any) => ({
            description: mat.description || mat.item,
            quantity: mat.quantity || 1,
            unitCost: 0,
            unit: 'unit'
          }))
        ]
      }
    };
    
    // STEP 4: Calculate quote
    const result = await costCalculatorService.calculateQuote(calculationInput);
    
    // STEP 5: Salvar quote no banco
    // Store metadata in notes field (metadata field doesn't exist in schema)
    const quoteMetadata = {
      generatedViaAI: true,
      originalDescription: description,
      extractedRequirements: extractedRequirements,
      templateMatchScore: mappingResult.bestMatch.matchScore
    };
    
    const [quote] = await db.insert(quotes).values({
      tenantId,
      clientId: result.quote.clientId,
      templateId: result.quote.templateId,
      quoteNumber: result.quote.quoteNumber,
      title: result.quote.title,
      description: result.quote.description,
      status: result.quote.status,
      requirements: result.quote.requirements,
      calculations: result.quote.calculations,
      totalCost: result.quote.totalCost,
      totalPrice: result.quote.totalPrice,
      margin: result.quote.margin,
      marginPercentage: result.quote.marginPercentage,
      createdBy: userId,
      notes: JSON.stringify(quoteMetadata)
    }).returning();
    
    // STEP 6: Salvar quote lines
    const lines = await db.insert(quoteLines).values(
      result.quoteLines.map(line => ({
        quoteId: quote.id,
        lineNumber: line.lineNumber,
        description: line.description,
        category: line.category,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice,
        totalCost: line.totalCost,
        totalPrice: line.totalPrice,
        margin: line.margin,
        marginPercentage: line.marginPercentage
      }))
    ).returning();
    
    res.status(201).json({ 
      success: true,
      quote, 
      lines,
      metadata: {
        extractedRequirements: extractedRequirements,
        templateMatch: {
          template: mappingResult.bestMatch.template,
          score: mappingResult.bestMatch.matchScore,
          confidence: mappingResult.bestMatch.confidence,
          reasons: mappingResult.bestMatch.reasons
        }
      }
    });
    
  } catch (error: any) {
    console.error("[Financeiro API] Error generating quote:", error);
    res.status(500).json({ error: error.message || "Failed to generate quote" });
  }
});

// POST /api/financeiro/quotes/:id/send-email
router.post("/quotes/:id/send-email", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const quoteId = req.params.id;
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { recipientEmail, message, cc } = req.body;
    
    const { quoteEmailService } = await import('../../../../packages/modules/financeiro/services/quoteEmailService');
    
    const result = await quoteEmailService.sendQuoteEmail({
      quoteId,
      tenantId,
      recipientEmail,
      message,
      cc
    });
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    // Update sentAt timestamp (metadata field doesn't exist in schema)
    await db
      .update(quotes)
      .set({ 
        sentAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(quotes.id, quoteId),
        eq(quotes.tenantId, tenantId)
      ));
    
    res.json({ 
      success: true, 
      messageId: result.messageId,
      message: 'Orçamento enviado com sucesso' 
    });
    
  } catch (error: any) {
    console.error("[Financeiro API] Error sending quote email:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

// GET /api/financeiro/quotes/:id - detalhes do orçamento com linhas
router.get("/quotes/:id", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const quoteId = req.params.id;

    const [quote] = await db
      .select()
      .from(quotes)
      .where(and(
        eq(quotes.id, quoteId),
        eq(quotes.tenantId, tenantId)
      ));

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    const lines = await db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.quoteId, quoteId))
      .orderBy(quoteLines.lineNumber);

    res.json({ ...quote, lines });
  } catch (error: any) {
    console.error("[Financeiro API] Error getting quote details:", error);
    res.status(500).json({ error: "Failed to get quote details" });
  }
});

// PATCH /api/financeiro/quotes/:id/status - avançar status do workflow
router.patch("/quotes/:id/status", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const quoteId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if (status === 'sent') {
      updateData.sentAt = new Date();
    } else if (status === 'approved') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = userId;
    } else if (status === 'accepted') {
      updateData.acceptedAt = new Date();
    } else if (status === 'rejected') {
      updateData.rejectedAt = new Date();
    }

    const [updated] = await db
      .update(quotes)
      .set(updateData)
      .where(and(
        eq(quotes.id, quoteId),
        eq(quotes.tenantId, tenantId)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Quote not found" });
    }

    res.json(updated);
  } catch (error: any) {
    console.error("[Financeiro API] Error updating quote status:", error);
    res.status(500).json({ error: "Failed to update quote status" });
  }
});

// ============================================================================
// QUOTE LINE MANAGEMENT - EDIÇÃO HUMANA
// ============================================================================

// Helper function para recalcular totais do quote
async function recalculateQuoteTotals(quoteId: string) {
  const lines = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId));
  
  const totalCost = lines.reduce((sum, line) => sum + parseFloat(line.totalCost || '0'), 0);
  const totalPrice = lines.reduce((sum, line) => sum + parseFloat(line.totalPrice || '0'), 0);
  const margin = totalPrice - totalCost;
  const marginPercentage = totalCost > 0 ? (margin / totalCost) * 100 : 0;
  
  await db.update(quotes)
    .set({
      totalCost: totalCost.toFixed(2),
      totalPrice: totalPrice.toFixed(2),
      margin: margin.toFixed(2),
      marginPercentage: marginPercentage.toFixed(2),
      updatedAt: new Date()
    })
    .where(eq(quotes.id, quoteId));
}

// PATCH /api/financeiro/quotes/:id/lines/:lineId - Atualizar linha individual
router.patch('/quotes/:id/lines/:lineId', requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id: quoteId, lineId } = req.params;
    const { quantity, unitPrice, description, category, unit, unitCost } = req.body;
    
    // Verificar tenant ownership do quote
    const [quote] = await db.select().from(quotes).where(
      and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))
    );
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    // Preparar dados para atualização
    const updateData: any = {
      updatedAt: new Date()
    };

    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (unit !== undefined) updateData.unit = unit;
    if (quantity !== undefined) updateData.quantity = quantity.toString();
    if (unitCost !== undefined) updateData.unitCost = unitCost.toString();
    if (unitPrice !== undefined) updateData.unitPrice = unitPrice.toString();

    // Recalcular totais da linha
    const qty = quantity !== undefined ? quantity : parseFloat((await db.select({ quantity: quoteLines.quantity }).from(quoteLines).where(eq(quoteLines.id, lineId)).limit(1))[0]?.quantity || '1');
    const uCost = unitCost !== undefined ? unitCost : parseFloat((await db.select({ unitCost: quoteLines.unitCost }).from(quoteLines).where(eq(quoteLines.id, lineId)).limit(1))[0]?.unitCost || '0');
    const uPrice = unitPrice !== undefined ? unitPrice : parseFloat((await db.select({ unitPrice: quoteLines.unitPrice }).from(quoteLines).where(eq(quoteLines.id, lineId)).limit(1))[0]?.unitPrice || '0');
    
    const tCost = qty * uCost;
    const tPrice = qty * uPrice;
    const lineMargin = tPrice - tCost;
    const lineMarginPct = tCost > 0 ? (lineMargin / tCost) * 100 : 0;

    updateData.totalCost = tCost.toFixed(2);
    updateData.totalPrice = tPrice.toFixed(2);
    updateData.margin = lineMargin.toFixed(2);
    updateData.marginPercentage = lineMarginPct.toFixed(2);
    
    // Atualizar linha
    const [updated] = await db.update(quoteLines)
      .set(updateData)
      .where(eq(quoteLines.id, lineId))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // Recalcular totais do quote
    await recalculateQuoteTotals(quoteId);
    
    res.json(updated);
  } catch (error: any) {
    console.error("[Financeiro API] Error updating quote line:", error);
    res.status(500).json({ error: "Failed to update quote line" });
  }
});

// POST /api/financeiro/quotes/:id/lines - Adicionar nova linha
router.post('/quotes/:id/lines', requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const quoteId = req.params.id;
    const { description, quantity, unit, unitCost, unitPrice, category } = req.body;
    
    // Validação básica
    if (!description || !unitPrice || !quantity) {
      return res.status(400).json({ error: 'Description, quantity and unitPrice are required' });
    }

    // Verificar ownership
    const [quote] = await db.select().from(quotes).where(
      and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))
    );
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    // Obter próximo line_number
    const existingLines = await db.select({ lineNumber: quoteLines.lineNumber }).from(quoteLines).where(eq(quoteLines.quoteId, quoteId));
    const nextLineNumber = (existingLines.length > 0 ? Math.max(...existingLines.map(l => l.lineNumber)) : 0) + 1;
    
    // Calcular totais
    const qty = parseFloat(quantity.toString());
    const uCost = unitCost ? parseFloat(unitCost.toString()) : 0;
    const uPrice = parseFloat(unitPrice.toString());
    const tCost = qty * uCost;
    const tPrice = qty * uPrice;
    const lineMargin = tPrice - tCost;
    const lineMarginPct = tCost > 0 ? (lineMargin / tCost) * 100 : 0;

    // Criar linha
    const [newLine] = await db.insert(quoteLines).values({
      quoteId,
      lineNumber: nextLineNumber,
      description,
      quantity: qty.toString(),
      unit: unit || 'unit',
      unitCost: uCost.toFixed(2),
      unitPrice: uPrice.toFixed(2),
      category: category || null,
      totalCost: tCost.toFixed(2),
      totalPrice: tPrice.toFixed(2),
      margin: lineMargin.toFixed(2),
      marginPercentage: lineMarginPct.toFixed(2)
    }).returning();
    
    // Recalcular totais
    await recalculateQuoteTotals(quoteId);
    
    res.status(201).json(newLine);
  } catch (error: any) {
    console.error("[Financeiro API] Error creating quote line:", error);
    res.status(500).json({ error: "Failed to create quote line" });
  }
});

// DELETE /api/financeiro/quotes/:id/lines/:lineId - Remover linha
router.delete('/quotes/:id/lines/:lineId', requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id: quoteId, lineId } = req.params;
    
    // Verificar ownership
    const [quote] = await db.select().from(quotes).where(
      and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))
    );
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    // Deletar linha
    await db.delete(quoteLines).where(eq(quoteLines.id, lineId));
    
    // Recalcular totais
    await recalculateQuoteTotals(quoteId);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Financeiro API] Error deleting quote line:", error);
    res.status(500).json({ error: "Failed to delete quote line" });
  }
});

// PATCH /api/financeiro/quotes/:id/discount - Aplicar desconto global
router.patch('/quotes/:id/discount', requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const quoteId = req.params.id;
    const { discountType, appliedDiscount } = req.body;
    
    const [quote] = await db.select().from(quotes).where(
      and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))
    );
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    // Recalcular totais base primeiro
    await recalculateQuoteTotals(quoteId);
    
    // Buscar quote atualizado
    const [updatedQuote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    
    let newTotalPrice = parseFloat(updatedQuote.totalPrice || '0');
    const baseTotalPrice = newTotalPrice;
    
    // Aplicar desconto
    if (discountType === 'percentage' && appliedDiscount) {
      newTotalPrice = baseTotalPrice * (1 - parseFloat(appliedDiscount.toString()) / 100);
    } else if (discountType === 'fixed' && appliedDiscount) {
      newTotalPrice = baseTotalPrice - parseFloat(appliedDiscount.toString());
    } else {
      // Sem desconto
      newTotalPrice = baseTotalPrice;
    }

    // Validar que total não fique negativo
    if (newTotalPrice < 0) {
      return res.status(400).json({ error: 'Discount cannot result in negative total' });
    }
    
    const newMargin = newTotalPrice - parseFloat(updatedQuote.totalCost || '0');
    const newMarginPercentage = parseFloat(updatedQuote.totalCost || '0') > 0 
      ? (newMargin / parseFloat(updatedQuote.totalCost || '0')) * 100 
      : 0;
    
    const [final] = await db.update(quotes)
      .set({
        discountType: discountType || null,
        appliedDiscount: appliedDiscount ? appliedDiscount.toString() : null,
        totalPrice: newTotalPrice.toFixed(2),
        margin: newMargin.toFixed(2),
        marginPercentage: newMarginPercentage.toFixed(2),
        updatedAt: new Date()
      })
      .where(eq(quotes.id, quoteId))
      .returning();
    
    res.json(final);
  } catch (error: any) {
    console.error("[Financeiro API] Error applying discount:", error);
    res.status(500).json({ error: "Failed to apply discount" });
  }
});

// ============================================================================
// PROPOSAL GENERATION & DOWNLOAD
// ============================================================================

// POST /api/financeiro/quotes/:id/generate-proposal - Gerar PDF da proposta
router.post('/quotes/:id/generate-proposal', requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const quoteId = req.params.id;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // 1. Buscar quote + lines + tenant info
    const [quote] = await db.select().from(quotes).where(
      and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))
    );
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    const lines = await db.select().from(quoteLines)
      .where(eq(quoteLines.quoteId, quoteId))
      .orderBy(quoteLines.lineNumber);
    
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    
    // Buscar company info from tenant-specific schema (not public schema)
    const company = await selectOneFromTenantTable(
      tenantId,
      'company_info',
      sql`tenant_id = ${tenantId}`
    );
    
    // 2. Preparar dados para template Handlebars
    const templateData = {
      tenant: {
        name: tenant.name,
        logo: (tenant.settings as any)?.logo || null,
        address: company?.address || (tenant.settings as any)?.address || '',
        phone: company?.phone || (tenant.settings as any)?.phone || '',
        email: company?.email || (tenant.settings as any)?.email || ''
      },
      quote: {
        number: quote.quoteNumber,
        title: quote.title,
        description: quote.description || '',
        date: new Date(quote.createdAt).toLocaleDateString('pt-PT'),
        validUntil: quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('pt-PT') : 'N/A',
        status: quote.status
      },
      lines: lines.map(line => ({
        number: line.lineNumber,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: parseFloat(line.unitPrice).toFixed(2),
        totalPrice: parseFloat(line.totalPrice).toFixed(2)
      })),
      totals: {
        totalCost: parseFloat(quote.totalCost).toFixed(2),
        totalPrice: parseFloat(quote.totalPrice).toFixed(2),
        margin: parseFloat(quote.margin || '0').toFixed(2),
        marginPercentage: parseFloat(quote.marginPercentage || '0').toFixed(1)
      }
    };
    
    // 3. Compilar template Handlebars
    const handlebars = require('handlebars');
    const fs = require('fs');
    const path = require('path');
    
    const templatePath = path.join(__dirname, '../../../templates/proposal-basic.hbs');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);
    const html = template(templateData);
    
    // 4. Gerar PDF usando Puppeteer
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });
    await browser.close();
    
    // 5. Salvar PDF no filesystem
    const crypto = require('crypto');
    const publicId = crypto.randomUUID();
    const fileName = `proposal-${quote.quoteNumber}-${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '../../../storage/proposals', fileName);
    
    // Garantir que o diretório existe
    const proposalsDir = path.join(__dirname, '../../../storage/proposals');
    if (!fs.existsSync(proposalsDir)) {
      fs.mkdirSync(proposalsDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, pdfBuffer);
    
    // 6. Salvar registro no database (proposals table)
    const [proposal] = await db.insert(proposals).values({
      quoteId,
      tenantId,
      publicId,
      pdfUrl: `/storage/proposals/${fileName}`,
      status: 'draft',
      createdBy: userId
    }).returning();
    
    // 7. Atualizar status do quote se for draft
    if (quote.status === 'draft') {
      await db.update(quotes)
        .set({ status: 'review' })
        .where(eq(quotes.id, quoteId));
    }
    
    // 8. Retornar URL para download
    res.json({ 
      proposalId: proposal.id,
      downloadUrl: `/api/financeiro/proposals/${proposal.id}/download`
    });
  } catch (error: any) {
    console.error("[Financeiro API] Error generating proposal:", error);
    res.status(500).json({ error: "Failed to generate proposal", details: error.message });
  }
});

// GET /api/financeiro/proposals/:id/download - Download PDF
router.get('/proposals/:id/download', requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const proposalId = req.params.id;
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const [proposal] = await db.select().from(proposals).where(
      and(eq(proposals.id, proposalId), eq(proposals.tenantId, tenantId))
    );
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    // Buscar quote para nome do arquivo
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, proposal.quoteId));
    
    // Ler arquivo do filesystem
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../../..', proposal.pdfUrl || '');
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF file not found' });
    }
    
    const pdfBuffer = fs.readFileSync(filePath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Proposta-${quote?.quoteNumber || proposal.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("[Financeiro API] Error downloading proposal:", error);
    res.status(500).json({ error: "Failed to download proposal" });
  }
});

// ============================================================================
// QUOTE STATUS WORKFLOW
// ============================================================================

// PATCH /api/financeiro/quotes/:id/status - Atualizar status do workflow
router.patch('/quotes/:id/status', requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const quoteId = req.params.id;
    const { status, notes } = req.body;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Validar status permitidos
    const validStatuses = ['draft', 'review', 'approved', 'sent', 'accepted', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Buscar quote atual
    const [quote] = await db.select().from(quotes).where(
      and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))
    );
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    // Validar transições de estado permitidas
    const allowedTransitions: Record<string, string[]> = {
      'draft': ['review', 'approved'],
      'review': ['approved', 'draft'],
      'approved': ['sent'],
      'sent': ['accepted', 'rejected'],
      'accepted': [],
      'rejected': []
    };
    
    if (!allowedTransitions[quote.status]?.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid transition from ${quote.status} to ${status}` 
      });
    }
    
    // Atualizar status com timestamps relevantes
    const updateData: any = {
      status,
      updatedAt: new Date()
    };
    
    if (notes) {
      updateData.notes = notes;
    }
    
    if (status === 'sent') {
      updateData.sentAt = new Date();
    } else if (status === 'approved') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = userId;
    } else if (status === 'accepted') {
      updateData.acceptedAt = new Date();
    } else if (status === 'rejected') {
      updateData.rejectedAt = new Date();
    }
    
    const [updated] = await db.update(quotes)
      .set(updateData)
      .where(eq(quotes.id, quoteId))
      .returning();
    
    res.json(updated);
  } catch (error: any) {
    console.error("[Financeiro API] Error updating quote status:", error);
    res.status(500).json({ error: "Failed to update quote status" });
  }
});

// ============================================================================
// CREDIT NOTES (AR)
// ============================================================================

// POST /api/financeiro/credit-notes - Create AR Credit Note
router.post("/credit-notes", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { clientId, clientName, issueDate, dueDate, items, notes, linkedInvoiceId, totalAmount } = req.body;

    // Calculate totalAmount from items if not provided
    let calculatedTotal: number;
    if (totalAmount !== undefined && totalAmount !== null && totalAmount !== '') {
      calculatedTotal = parseFloat(totalAmount);
    } else if (items && Array.isArray(items) && items.length > 0) {
      // Sum from items
      calculatedTotal = items.reduce((sum, item) => {
        const itemTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
        return sum + itemTotal;
      }, 0);
    } else {
      return res.status(400).json({ error: "Either totalAmount or items array required" });
    }
    
    // Validate negative amount (auto-negate if positive)
    if (calculatedTotal > 0) {
      calculatedTotal = -calculatedTotal; // Auto-negate
    } else if (calculatedTotal === 0) {
      return res.status(400).json({ error: "Credit note amount cannot be zero" });
    }

    // Calculate totals from items if provided
    let subtotal = 0;
    let taxAmount = 0;

    if (items && items.length > 0) {
      items.forEach((item: any) => {
        const itemSubtotal = (item.quantity || 0) * (item.unitPrice || 0);
        const itemTax = itemSubtotal * 0.23; // 23% IVA default
        subtotal += itemSubtotal;
        taxAmount += itemTax;
      });

      // Negate for credit note
      subtotal = -Math.abs(subtotal);
      taxAmount = -Math.abs(taxAmount);
    } else {
      // Use calculatedTotal to derive subtotal and tax
      const totalAbs = Math.abs(calculatedTotal);
      subtotal = -(totalAbs / 1.23);
      taxAmount = -(totalAbs - Math.abs(subtotal));
    }

    const finalTotal = subtotal + taxAmount;

    // Generate credit note number
    const year = new Date().getFullYear();
    const lastCreditNote = await db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.fiscalYear, year),
        sql`${invoices.invoiceNumber} LIKE 'NC %'`
      ))
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    let nextNumber = 1;
    if (lastCreditNote.length > 0) {
      const match = lastCreditNote[0].invoiceNumber.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const creditNoteNumber = `NC ${year}/${nextNumber.toString().padStart(5, '0')}`;

    // Create credit note
    const [newCreditNote] = await db.insert(invoices).values({
      invoiceType: 'receivable',
      invoiceNumber: creditNoteNumber,
      clientId: clientId || undefined,
      clientName: clientName || 'Cliente sem nome',
      issueDate: new Date(issueDate || new Date()),
      dueDate: new Date(dueDate || new Date()),
      status: 'draft',
      paymentStatus: 'pending',
      currency: 'EUR',
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: finalTotal.toFixed(2),
      paidAmount: '0',
      fiscalYear: year,
      notes: notes,
      linkedInvoiceId: linkedInvoiceId || undefined,
      createdBy: userId,
    }).returning();

    // Create credit note lines if items provided
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const netAmount = -Math.abs((item.quantity || 0) * (item.unitPrice || 0));
        const lineTaxAmount = netAmount * 0.23;
        const lineTotal = netAmount + lineTaxAmount;

        await db.insert(invoiceLines).values({
          tenantId,
          invoiceId: newCreditNote.id,
          lineNumber: i + 1,
          description: item.description || '',
          quantity: (item.quantity || 0).toFixed(3),
          unit: item.unit || 'un',
          unitPrice: (-Math.abs(item.unitPrice || 0)).toFixed(4),
          discountRate: '0',
          discountAmount: '0',
          netAmount: netAmount.toFixed(2),
          taxRate: '23.00',
          taxAmount: lineTaxAmount.toFixed(2),
          totalAmount: lineTotal.toFixed(2),
        });
      }
    }

    console.log(`[Financeiro AR] ✅ Nota de crédito criada: ${creditNoteNumber}`);
    res.status(201).json(newCreditNote);
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao criar nota de crédito:", error);
    res.status(500).json({ error: "Failed to create credit note" });
  }
});

// POST /api/financeiro/notas-credito-ar - Portuguese alias
router.post("/notas-credito-ar", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { clienteId, nomeCliente, dataEmissao, dataVencimento, linhas, notas, faturaVinculada, valorTotal } = req.body;

    // Calculate valorTotal from linhas if not provided
    let calculatedTotal: number;
    if (valorTotal !== undefined && valorTotal !== null && valorTotal !== '') {
      calculatedTotal = parseFloat(valorTotal);
    } else if (linhas && Array.isArray(linhas) && linhas.length > 0) {
      // Sum from linhas
      calculatedTotal = linhas.reduce((sum, linha) => {
        const linhaTotal = (parseFloat(linha.quantidade) || 0) * (parseFloat(linha.precoUnitario) || 0);
        return sum + linhaTotal;
      }, 0);
    } else {
      return res.status(400).json({ error: "Necessário valorTotal ou array de linhas" });
    }
    
    // Validate negative amount (auto-negate if positive)
    if (calculatedTotal > 0) {
      calculatedTotal = -calculatedTotal; // Auto-negate
    } else if (calculatedTotal === 0) {
      return res.status(400).json({ error: "Valor da nota de crédito não pode ser zero" });
    }

    // Calculate totals from linhas if provided
    let subtotal = 0;
    let taxAmount = 0;

    if (linhas && linhas.length > 0) {
      linhas.forEach((linha: any) => {
        const linhaSubtotal = (linha.quantidade || 0) * (linha.precoUnitario || 0);
        const linhaTax = linhaSubtotal * ((linha.taxaIVA || 23) / 100);
        subtotal += linhaSubtotal;
        taxAmount += linhaTax;
      });

      // Negate for credit note
      subtotal = -Math.abs(subtotal);
      taxAmount = -Math.abs(taxAmount);
    } else {
      // Use calculatedTotal to derive subtotal and tax
      const totalAbs = Math.abs(calculatedTotal);
      subtotal = -(totalAbs / 1.23);
      taxAmount = -(totalAbs - Math.abs(subtotal));
    }

    const finalTotal = subtotal + taxAmount;

    // Generate credit note number
    const year = new Date().getFullYear();
    const lastCreditNote = await db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.fiscalYear, year),
        sql`${invoices.invoiceNumber} LIKE 'NC %'`
      ))
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    let nextNumber = 1;
    if (lastCreditNote.length > 0) {
      const match = lastCreditNote[0].invoiceNumber.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const creditNoteNumber = `NC ${year}/${nextNumber.toString().padStart(5, '0')}`;

    // Create credit note
    const [newCreditNote] = await db.insert(invoices).values({
      invoiceType: 'receivable',
      invoiceNumber: creditNoteNumber,
      clientId: clienteId || undefined,
      clientName: nomeCliente || 'Cliente sem nome',
      issueDate: new Date(dataEmissao || new Date()),
      dueDate: new Date(dataVencimento || new Date()),
      status: 'draft',
      paymentStatus: 'pending',
      currency: 'EUR',
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: finalTotal.toFixed(2),
      paidAmount: '0',
      fiscalYear: year,
      notes: notas,
      linkedInvoiceId: faturaVinculada || undefined,
      createdBy: userId,
    }).returning();

    // Create credit note lines if linhas provided
    if (linhas && linhas.length > 0) {
      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const netAmount = -Math.abs((linha.quantidade || 0) * (linha.precoUnitario || 0));
        const taxRate = linha.taxaIVA || 23;
        const lineTaxAmount = netAmount * (taxRate / 100);
        const lineTotal = netAmount + lineTaxAmount;

        await db.insert(invoiceLines).values({
          tenantId,
          invoiceId: newCreditNote.id,
          lineNumber: i + 1,
          description: linha.descricao || '',
          quantity: (linha.quantidade || 0).toFixed(3),
          unit: linha.unidade || 'un',
          unitPrice: (-Math.abs(linha.precoUnitario || 0)).toFixed(4),
          discountRate: '0',
          discountAmount: '0',
          netAmount: netAmount.toFixed(2),
          taxRate: taxRate.toFixed(2),
          taxAmount: lineTaxAmount.toFixed(2),
          totalAmount: lineTotal.toFixed(2),
        });
      }
    }

    console.log(`[Financeiro AR] ✅ Nota de crédito criada: ${creditNoteNumber}`);
    res.status(201).json(newCreditNote);
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao criar nota de crédito:", error);
    res.status(500).json({ error: "Falha ao criar nota de crédito" });
  }
});

// ============================================================================
// DUNNING CAMPAIGN MANAGEMENT
// ============================================================================

// GET /api/financeiro/dunning - List dunning runs
router.get("/dunning", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status, page = '1', limit = '50' } = req.query;

    const conditions = [eq(dunningRuns.tenantId, tenantId)];
    
    if (status && typeof status === 'string') {
      conditions.push(eq(dunningRuns.status, status));
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Get dunning runs with reminder details
    const runs = await db
      .select({
        id: dunningRuns.id,
        tenantId: dunningRuns.tenantId,
        environment: dunningRuns.environment,
        reminderId: dunningRuns.reminderId,
        status: dunningRuns.status,
        sentAt: dunningRuns.sentAt,
        channel: dunningRuns.channel,
        outcome: dunningRuns.outcome,
        metadata: dunningRuns.metadata,
        createdAt: dunningRuns.createdAt,
        updatedAt: dunningRuns.updatedAt,
        reminder: {
          id: paymentReminders.id,
          invoiceId: paymentReminders.invoiceId,
          clientId: paymentReminders.clientId,
          reminderType: paymentReminders.reminderType,
          reminderSequence: paymentReminders.reminderSequence,
          recipientEmail: paymentReminders.recipientEmail,
        }
      })
      .from(dunningRuns)
      .leftJoin(paymentReminders, eq(dunningRuns.reminderId, paymentReminders.id))
      .where(and(...conditions))
      .limit(limitNum)
      .offset(offset)
      .orderBy(desc(dunningRuns.createdAt));

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dunningRuns)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    console.log(`[Financeiro AR] ✅ Listadas ${runs.length} dunning runs (total: ${total})`);
    res.json({ runs, total, page: pageNum, limit: limitNum });
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao listar dunning runs:", error);
    res.status(500).json({ error: "Failed to list dunning runs" });
  }
});

// GET /api/financeiro/cobrancas - Portuguese alias
router.get("/cobrancas", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { estado, pagina = '1', limite = '50' } = req.query;

    const conditions = [eq(dunningRuns.tenantId, tenantId)];
    
    if (estado && typeof estado === 'string') {
      conditions.push(eq(dunningRuns.status, estado));
    }

    const pageNum = parseInt(pagina as string);
    const limitNum = parseInt(limite as string);
    const offset = (pageNum - 1) * limitNum;

    // Get dunning runs with reminder details
    const runs = await db
      .select({
        id: dunningRuns.id,
        tenantId: dunningRuns.tenantId,
        environment: dunningRuns.environment,
        reminderId: dunningRuns.reminderId,
        status: dunningRuns.status,
        sentAt: dunningRuns.sentAt,
        channel: dunningRuns.channel,
        outcome: dunningRuns.outcome,
        metadata: dunningRuns.metadata,
        createdAt: dunningRuns.createdAt,
        updatedAt: dunningRuns.updatedAt,
        lembrete: {
          id: paymentReminders.id,
          faturaId: paymentReminders.invoiceId,
          clienteId: paymentReminders.clientId,
          tipoLembrete: paymentReminders.reminderType,
          sequenciaLembrete: paymentReminders.reminderSequence,
          emailDestinatario: paymentReminders.recipientEmail,
        }
      })
      .from(dunningRuns)
      .leftJoin(paymentReminders, eq(dunningRuns.reminderId, paymentReminders.id))
      .where(and(...conditions))
      .limit(limitNum)
      .offset(offset)
      .orderBy(desc(dunningRuns.createdAt));

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dunningRuns)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    console.log(`[Financeiro AR] ✅ Listadas ${runs.length} cobranças (total: ${total})`);
    res.json({ runs, total, pagina: pageNum, limite: limitNum });
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao listar cobranças:", error);
    res.status(500).json({ error: "Falha ao listar cobranças" });
  }
});

// POST /api/financeiro/dunning/:id/send - Manually trigger dunning reminder
router.post("/dunning/:id/send", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Check if dunning run exists and belongs to tenant
    const [existingRun] = await db
      .select()
      .from(dunningRuns)
      .where(and(
        eq(dunningRuns.id, id),
        eq(dunningRuns.tenantId, tenantId)
      ))
      .limit(1);

    if (!existingRun) {
      return res.status(404).json({ error: "Dunning run not found" });
    }

    // Increment attempt number in metadata
    const currentMetadata = (existingRun.metadata || {}) as any;
    const attemptNumber = (currentMetadata.attemptNumber || 0) + 1;
    const now = new Date();

    const updatedMetadata = {
      ...currentMetadata,
      attemptNumber,
      lastAttemptAt: now.toISOString(),
    };

    // Update dunning run status
    const [updatedRun] = await db
      .update(dunningRuns)
      .set({
        status: 'sent',
        sentAt: now,
        metadata: updatedMetadata,
        updatedAt: now,
      })
      .where(eq(dunningRuns.id, id))
      .returning();

    console.log(`[Financeiro AR] ✅ Dunning reminder enviado: ${id} (tentativa ${attemptNumber})`);
    res.json(updatedRun);
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao enviar dunning reminder:", error);
    res.status(500).json({ error: "Failed to send dunning reminder" });
  }
});

// POST /api/financeiro/cobrancas/:id/enviar - Portuguese alias
router.post("/cobrancas/:id/enviar", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Check if dunning run exists and belongs to tenant
    const [existingRun] = await db
      .select()
      .from(dunningRuns)
      .where(and(
        eq(dunningRuns.id, id),
        eq(dunningRuns.tenantId, tenantId)
      ))
      .limit(1);

    if (!existingRun) {
      return res.status(404).json({ error: "Cobrança não encontrada" });
    }

    // Increment attempt number in metadata
    const currentMetadata = (existingRun.metadata || {}) as any;
    const attemptNumber = (currentMetadata.attemptNumber || 0) + 1;
    const now = new Date();

    const updatedMetadata = {
      ...currentMetadata,
      attemptNumber,
      lastAttemptAt: now.toISOString(),
    };

    // Update dunning run status
    const [updatedRun] = await db
      .update(dunningRuns)
      .set({
        status: 'sent',
        sentAt: now,
        metadata: updatedMetadata,
        updatedAt: now,
      })
      .where(eq(dunningRuns.id, id))
      .returning();

    console.log(`[Financeiro AR] ✅ Lembrete de cobrança enviado: ${id} (tentativa ${attemptNumber})`);
    res.json(updatedRun);
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao enviar lembrete de cobrança:", error);
    res.status(500).json({ error: "Falha ao enviar lembrete de cobrança" });
  }
});

// ============================================================================
// INVOICE DETAIL (Composite View)
// ============================================================================

// GET /api/financeiro/invoices/:id/detail - Get comprehensive invoice details
router.get("/invoices/:id/detail", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Get invoice
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, id),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Get payments
    const relatedPayments = await db
      .select()
      .from(payments)
      .where(and(
        eq(payments.invoiceId, id),
        eq(payments.tenantId, tenantId)
      ))
      .orderBy(desc(payments.paymentDate));

    // Get document links
    const links = await db
      .select({
        documentLinks,
        documents,
      })
      .from(documentLinks)
      .innerJoin(documents, eq(documentLinks.docId, documents.id))
      .where(and(
        eq(documentLinks.entityType, 'invoice'),
        eq(documentLinks.entityId, id),
        eq(documentLinks.tenantId, tenantId)
      ));

    // Get dunning history
    const dunningHistory = await db
      .select()
      .from(dunningRuns)
      .leftJoin(paymentReminders, eq(dunningRuns.reminderId, paymentReminders.id))
      .where(and(
        eq(paymentReminders.invoiceId, id),
        eq(dunningRuns.tenantId, tenantId)
      ))
      .orderBy(desc(dunningRuns.createdAt));

    // Calculate totals
    const totalPaid = relatedPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const outstanding = parseFloat(invoice.totalAmount || '0') - totalPaid;

    // Format documents
    const formattedDocuments = links.map(l => ({
      id: l.documents.id,
      fileName: l.documents.filename,
      type: l.documents.documentType,
      url: l.documents.storagePath,
      uploadedAt: l.documents.createdAt,
    }));

    console.log(`[Financeiro AR] ✅ Detalhes da fatura ${invoice.invoiceNumber} carregados`);
    res.json({
      invoice,
      payments: relatedPayments,
      totalPaid,
      outstanding,
      documents: formattedDocuments,
      dunningHistory: dunningHistory.map(d => d.dunning_runs),
    });
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao carregar detalhes da fatura:", error);
    res.status(500).json({ error: "Failed to load invoice details" });
  }
});

// GET /api/financeiro/faturas/:id/detalhes - Portuguese alias
router.get("/faturas/:id/detalhes", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Get invoice
    const [fatura] = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, id),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!fatura) {
      return res.status(404).json({ error: "Fatura não encontrada" });
    }

    // Get payments (recebimentos)
    const recebimentos = await db
      .select()
      .from(payments)
      .where(and(
        eq(payments.invoiceId, id),
        eq(payments.tenantId, tenantId)
      ))
      .orderBy(desc(payments.paymentDate));

    // Get document links
    const links = await db
      .select({
        documentLinks,
        documents,
      })
      .from(documentLinks)
      .innerJoin(documents, eq(documentLinks.docId, documents.id))
      .where(and(
        eq(documentLinks.entityType, 'invoice'),
        eq(documentLinks.entityId, id),
        eq(documentLinks.tenantId, tenantId)
      ));

    // Get dunning history (histórico de cobranças)
    const historicoCobrancas = await db
      .select()
      .from(dunningRuns)
      .leftJoin(paymentReminders, eq(dunningRuns.reminderId, paymentReminders.id))
      .where(and(
        eq(paymentReminders.invoiceId, id),
        eq(dunningRuns.tenantId, tenantId)
      ))
      .orderBy(desc(dunningRuns.createdAt));

    // Calculate totals
    const totalPago = recebimentos.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const valorEmAberto = parseFloat(fatura.totalAmount || '0') - totalPago;

    // Format documents (documentos)
    const documentos = links.map(l => ({
      id: l.documents.id,
      nomeArquivo: l.documents.filename,
      tipo: l.documents.documentType,
      url: l.documents.storagePath,
      dataEnvio: l.documents.createdAt,
    }));

    console.log(`[Financeiro AR] ✅ Detalhes da fatura ${fatura.invoiceNumber} carregados`);
    res.json({
      fatura,
      recebimentos,
      totalPago,
      valorEmAberto,
      documentos,
      historicoCobrancas: historicoCobrancas.map(d => d.dunning_runs),
    });
  } catch (error: any) {
    console.error("[Financeiro AR] Erro ao carregar detalhes da fatura:", error);
    res.status(500).json({ error: "Falha ao carregar detalhes da fatura" });
  }
});

console.log("[Financeiro Routes] ✅ Registered AR routes: faturas + recebimentos + quotes + proposals + credit-notes + dunning + invoice-detail");

  return router;
}
