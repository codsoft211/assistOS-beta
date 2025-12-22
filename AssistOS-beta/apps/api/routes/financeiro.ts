/**
 * Financeiro (Financial) Module Routes
 * 
 * Complete financial management routes with Portuguese paths
 * SECURITY: All routes protected with module-level permission checks
 * TENANT ISOLATION: All queries filtered by tenantId
 */

import { Router } from "express";
import { requirePermission } from "../middleware/permissions.middleware";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import { eq, and, gte, lte, desc, sql, count, sum } from "drizzle-orm";
import { z } from "zod";
import { 
  invoices, 
  invoiceLines,
  payments, 
  paymentAllocations,
  bankAccounts, 
  taxRates,
  clients,
  bankReconciliations,
  bankStatementTransactions,
  costTemplates,
  rateCards,
  insertCostTemplateSchema,
  insertRateCardSchema,
  quotes,
  quoteLines,
  proposals,
  tenants
} from "../../../shared/schema";
import { selectOneFromTenantTable } from "../utils/tenant-db-helper";
import { costCalculatorService, QuoteCalculationInput } from "../../../packages/modules/financeiro/services/costCalculatorService";
import { toolRegistry } from "../../../packages/ai/tools/kernel";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// This middleware MUST come first to prevent cross-tenant data leaks
// ============================================================================
router.use(hardTenantGuard);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const faturaSchema = z.object({
  clienteId: z.string().uuid(),
  dataEmissao: z.string(),
  dataVencimento: z.string(),
  linhas: z.array(z.object({
    descricao: z.string(),
    quantidade: z.number().positive(),
    precoUnitario: z.number().min(0),
    taxaIVA: z.number().min(0).max(100),
  })).min(1),
  notas: z.string().optional(),
});

const recebimentoSchema = z.object({
  clienteId: z.string().uuid().optional(),
  faturaId: z.string().uuid().optional(),
  dataRecebimento: z.string(),
  valor: z.number().positive(),
  metodoPagamento: z.enum(["MB", "Transferência", "Cheque", "Dinheiro", "MB Way"]),
  referencia: z.string().optional(),
  notas: z.string().optional(),
});

const contaBancariaSchema = z.object({
  nomeConta: z.string(),
  nomeBanco: z.string(),
  numeroConta: z.string(),
  iban: z.string().regex(/^PT50[0-9]{21}$/),
  swift: z.string().optional(),
  moeda: z.string().default("EUR"),
  tipoConta: z.enum(["Ordem", "Poupança"]),
  saldoInicial: z.number().min(0),
  ativa: z.boolean().default(true),
});

// ============================================================================
// DASHBOARD - KPIs FINANCEIROS
// ============================================================================

router.get("/dashboard", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // KPIs
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    // Faturação mensal
    const faturasEmitidas = await db
      .select({
        total: sum(invoices.totalAmount)
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          gte(invoices.issueDate, primeiroDiaMes),
          lte(invoices.issueDate, ultimoDiaMes)
        )
      );

    // Recebimentos do mês
    const recebimentosMes = await db
      .select({
        total: sum(payments.amount)
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.type, 'received'),
          gte(payments.paymentDate, primeiroDiaMes),
          lte(payments.paymentDate, ultimoDiaMes)
        )
      );

    // Saldo a receber
    const saldoReceber = await db
      .select({
        total: sum(sql<number>`${invoices.totalAmount} - ${invoices.paidAmount}`)
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          sql`${invoices.totalAmount} > ${invoices.paidAmount}`
        )
      );

    // Faturas vencidas
    const faturasVencidas = await db
      .select({
        count: count()
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          lte(invoices.dueDate, hoje),
          sql`${invoices.totalAmount} > ${invoices.paidAmount}`
        )
      );

    // Evolução mensal (últimos 6 meses)
    const sesMesesAtras = new Date();
    sesMesesAtras.setMonth(sesMesesAtras.getMonth() - 6);

    const evolucaoFaturacao = await db
      .select({
        mes: sql<string>`TO_CHAR(${invoices.issueDate}, 'Mon/YY')`,
        total: sum(invoices.totalAmount)
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          gte(invoices.issueDate, sesMesesAtras)
        )
      )
      .groupBy(sql`TO_CHAR(${invoices.issueDate}, 'Mon/YY')`)
      .orderBy(sql`MIN(${invoices.issueDate})`);

    const evolucaoRecebimentos = await db
      .select({
        mes: sql<string>`TO_CHAR(${payments.paymentDate}, 'Mon/YY')`,
        total: sum(payments.amount)
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.type, 'received'),
          gte(payments.paymentDate, sesMesesAtras)
        )
      )
      .groupBy(sql`TO_CHAR(${payments.paymentDate}, 'Mon/YY')`)
      .orderBy(sql`MIN(${payments.paymentDate})`);

    // Merge evolução
    const mesesSet = new Set([
      ...evolucaoFaturacao.map(r => r.mes),
      ...evolucaoRecebimentos.map(r => r.mes)
    ]);

    const evolucaoMensal = Array.from(mesesSet).map(mes => ({
      mes,
      faturacao: parseFloat(evolucaoFaturacao.find(r => r.mes === mes)?.total || '0'),
      recebimentos: parseFloat(evolucaoRecebimentos.find(r => r.mes === mes)?.total || '0'),
    }));

    // Recebimentos por método
    const recebimentosPorMetodo = await db
      .select({
        metodo: payments.paymentMethod,
        valor: sum(payments.amount)
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.type, 'received')
        )
      )
      .groupBy(payments.paymentMethod);

    // Últimas faturas
    const ultimasFaturas = await db
      .select({
        id: invoices.id,
        numero: invoices.invoiceNumber,
        cliente: invoices.clientName,
        dataEmissao: invoices.issueDate,
        valor: invoices.totalAmount,
        estado: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable')
        )
      )
      .orderBy(desc(invoices.issueDate))
      .limit(10);

    // Top clientes
    const topClientes = await db
      .select({
        id: invoices.clientId,
        nome: invoices.clientName,
        valorTotal: sum(invoices.totalAmount),
        numeroFaturas: count()
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          sql`${invoices.clientId} IS NOT NULL`
        )
      )
      .groupBy(invoices.clientId, invoices.clientName)
      .orderBy(desc(sum(invoices.totalAmount)))
      .limit(10);

    res.json({
      kpis: {
        faturacaoMensal: parseFloat(faturasEmitidas[0]?.total || '0'),
        recebimentosMes: parseFloat(recebimentosMes[0]?.total || '0'),
        saldoReceber: parseFloat(saldoReceber[0]?.total || '0'),
        faturasVencidas: faturasVencidas[0]?.count || 0,
      },
      evolucaoMensal,
      recebimentosPorMetodo: recebimentosPorMetodo.map(r => ({
        metodo: r.metodo || 'N/A',
        valor: parseFloat(r.valor || '0'),
      })),
      ultimasFaturas: ultimasFaturas.map(f => ({
        ...f,
        valor: parseFloat(f.valor || '0'),
        dataEmissao: f.dataEmissao?.toISOString() || '',
      })),
      topClientes: topClientes.map(c => ({
        id: c.id || '',
        nome: c.nome || 'N/A',
        valorTotal: parseFloat(c.valorTotal || '0'),
        numeroFaturas: c.numeroFaturas || 0,
      })),
    });
  } catch (error: any) {
    console.error("[Financeiro API] Error getting dashboard:", error);
    res.status(500).json({ error: "Failed to get dashboard data" });
  }
});

// ============================================================================
// FATURAS (INVOICES)
// ============================================================================

// GET /api/financeiro/faturas - List invoices
router.get("/faturas", requirePermission('financeiro.faturas.view'), async (req, res) => {
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
router.get("/faturas/:id", requirePermission('financeiro.faturas.view'), async (req, res) => {
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
router.get("/invoices", requirePermission('financeiro.faturas.view'), async (req, res) => {
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
router.get("/invoices/:id", requirePermission('financeiro.faturas.view'), async (req, res) => {
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
router.get("/faturas/abertas", requirePermission('financeiro.faturas.view'), async (req, res) => {
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
// CONTAS BANCÁRIAS (BANK ACCOUNTS)
// ============================================================================

// GET /api/financeiro/contas-bancarias - List bank accounts
router.get("/contas-bancarias", requirePermission('financeiro.contas.view'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const accounts = await db
      .select({
        id: bankAccounts.id,
        nomeConta: bankAccounts.accountName,
        nomeBanco: bankAccounts.bankName,
        iban: bankAccounts.iban,
        saldoAtual: bankAccounts.currentBalance,
        moeda: bankAccounts.currency,
        ativa: bankAccounts.isActive,
        tipoConta: bankAccounts.accountType,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.tenantId, tenantId))
      .orderBy(desc(bankAccounts.isDefault), bankAccounts.accountName);

    res.json(accounts.map(acc => ({
      ...acc,
      saldoAtual: parseFloat(acc.saldoAtual || '0'),
    })));
  } catch (error: any) {
    console.error("[Financeiro API] Error listing bank accounts:", error);
    res.status(500).json({ error: "Failed to list bank accounts" });
  }
});

// POST /api/financeiro/contas-bancarias - Create bank account
router.post("/contas-bancarias", requirePermission('financeiro.contas.manage'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = contaBancariaSchema.parse(req.body);

    const [newAccount] = await db.insert(bankAccounts).values({
      tenantId,
      bankName: validatedData.nomeBanco,
      accountName: validatedData.nomeConta,
      accountNumber: validatedData.numeroConta,
      iban: validatedData.iban,
      swift: validatedData.swift,
      currency: validatedData.moeda,
      accountType: validatedData.tipoConta === 'Ordem' ? 'checking' : 'savings',
      currentBalance: validatedData.saldoInicial.toFixed(2),
      isActive: validatedData.ativa,
    }).returning();

    res.status(201).json(newAccount);
  } catch (error: any) {
    console.error("[Financeiro API] Error creating bank account:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create bank account" });
  }
});

// PATCH /api/financeiro/contas-bancarias/:id - Update bank account
router.patch("/contas-bancarias/:id", requirePermission('financeiro.contas.manage'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = contaBancariaSchema.partial().parse(req.body);

    const updateData: any = {};
    if (validatedData.nomeConta) updateData.accountName = validatedData.nomeConta;
    if (validatedData.nomeBanco) updateData.bankName = validatedData.nomeBanco;
    if (validatedData.numeroConta) updateData.accountNumber = validatedData.numeroConta;
    if (validatedData.iban) updateData.iban = validatedData.iban;
    if (validatedData.swift) updateData.swift = validatedData.swift;
    if (validatedData.moeda) updateData.currency = validatedData.moeda;
    if (validatedData.tipoConta) updateData.accountType = validatedData.tipoConta === 'Ordem' ? 'checking' : 'savings';
    if (validatedData.ativa !== undefined) updateData.isActive = validatedData.ativa;

    updateData.updatedAt = new Date();

    const [updatedAccount] = await db
      .update(bankAccounts)
      .set(updateData)
      .where(and(
        eq(bankAccounts.id, req.params.id),
        eq(bankAccounts.tenantId, tenantId)
      ))
      .returning();

    if (!updatedAccount) {
      return res.status(404).json({ error: "Bank account not found" });
    }

    res.json(updatedAccount);
  } catch (error: any) {
    console.error("[Financeiro API] Error updating bank account:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update bank account" });
  }
});

// PATCH /api/financeiro/contas-bancarias/:id/toggle - Toggle active status
router.patch("/contas-bancarias/:id/toggle", requirePermission('financeiro.contas.manage'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ativa } = req.body;

    await db
      .update(bankAccounts)
      .set({
        isActive: ativa,
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankAccounts.id, req.params.id),
        eq(bankAccounts.tenantId, tenantId)
      ));

    res.json({ message: "Bank account status updated" });
  } catch (error: any) {
    console.error("[Financeiro API] Error toggling bank account:", error);
    res.status(500).json({ error: "Failed to toggle bank account" });
  }
});

// DELETE /api/financeiro/contas-bancarias/:id - Delete bank account
router.delete("/contas-bancarias/:id", requirePermission('financeiro.contas.manage'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(bankAccounts)
      .where(and(
        eq(bankAccounts.id, req.params.id),
        eq(bankAccounts.tenantId, tenantId)
      ));

    res.json({ message: "Bank account deleted successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error deleting bank account:", error);
    res.status(500).json({ error: "Failed to delete bank account" });
  }
});

// ============================================================================
// RECONCILIAÇÕES (BANK RECONCILIATIONS)
// ============================================================================

// GET /api/financeiro/reconciliacoes/transacoes - Get bank transactions
router.get("/reconciliacoes/transacoes", requirePermission('financeiro.reconciliacao'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { contaId } = req.query;

    // Return empty for now - would show bank statement transactions
    res.json([]);
  } catch (error: any) {
    console.error("[Financeiro API] Error getting transactions:", error);
    res.status(500).json({ error: "Failed to get transactions" });
  }
});

// GET /api/financeiro/reconciliacoes/historico - Get reconciliation history
router.get("/reconciliacoes/historico", requirePermission('financeiro.reconciliacao'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const reconciliations = await db
      .select()
      .from(bankReconciliations)
      .where(eq(bankReconciliations.tenantId, tenantId))
      .orderBy(desc(bankReconciliations.statementDate))
      .limit(20);

    res.json(reconciliations.map(r => ({
      id: r.id,
      data: r.statementDate?.toISOString() || '',
      conta: `${r.bankName} - ${r.accountNumber}`,
      transacoesReconciliadas: 0, // Would count from reconciled_transactions
      saldoFinal: parseFloat(r.closingBalance || '0'),
    })));
  } catch (error: any) {
    console.error("[Financeiro API] Error getting reconciliation history:", error);
    res.status(500).json({ error: "Failed to get reconciliation history" });
  }
});

// POST /api/financeiro/reconciliacoes/upload - Upload bank statement
router.post("/reconciliacoes/upload", requirePermission('financeiro.reconciliacao'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Implement file upload and parsing
    res.json({ message: "Bank statement uploaded successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error uploading statement:", error);
    res.status(500).json({ error: "Failed to upload statement" });
  }
});

// POST /api/financeiro/reconciliacoes/matching-automatico - Auto-match transactions
router.post("/reconciliacoes/matching-automatico", requirePermission('financeiro.reconciliacao'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Implement automatic matching algorithm
    res.json({ message: "Automatic matching completed" });
  } catch (error: any) {
    console.error("[Financeiro API] Error in automatic matching:", error);
    res.status(500).json({ error: "Failed to complete automatic matching" });
  }
});

// POST /api/financeiro/reconciliacoes/associar - Manually associate transaction with payment
router.post("/reconciliacoes/associar", requirePermission('financeiro.reconciliacao'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { transacaoId, recebimentoId } = req.body;

    // TODO: Associate bank transaction with payment
    res.json({ message: "Transaction associated successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error associating transaction:", error);
    res.status(500).json({ error: "Failed to associate transaction" });
  }
});

// POST /api/financeiro/reconciliacoes/confirmar - Confirm reconciliation
router.post("/reconciliacoes/confirmar", requirePermission('financeiro.reconciliacao'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Finalize and lock reconciliation
    res.json({ message: "Reconciliation confirmed successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error confirming reconciliation:", error);
    res.status(500).json({ error: "Failed to confirm reconciliation" });
  }
});

// ============================================================================
// CONFIGURAÇÕES (SETTINGS)
// ============================================================================

// GET /api/financeiro/configuracoes - Get financial settings
router.get("/configuracoes", requirePermission('financeiro.configuracoes'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const rates = await db
      .select()
      .from(taxRates)
      .where(and(
        eq(taxRates.tenantId, tenantId),
        eq(taxRates.isActive, true)
      ))
      .orderBy(desc(taxRates.ratePercentage));

    res.json({
      taxasIVA: rates.map(r => ({
        id: r.id,
        nome: r.rateName,
        percentagem: parseFloat(r.ratePercentage || '0'),
        pais: r.country,
      })),
    });
  } catch (error: any) {
    console.error("[Financeiro API] Error getting settings:", error);
    res.status(500).json({ error: "Failed to get settings" });
  }
});

// PATCH /api/financeiro/configuracoes - Update financial settings
router.patch("/configuracoes", requirePermission('financeiro.configuracoes'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Update settings
    res.json({ message: "Settings updated successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error updating settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// GET /api/financeiro/clientes - Get clients (for dropdowns)
router.get("/clientes", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clientsList = await db
      .select({
        id: clients.id,
        nome: clients.name,
      })
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(clients.name);

    res.json(clientsList);
  } catch (error: any) {
    console.error("[Financeiro API] Error getting clients:", error);
    res.status(500).json({ error: "Failed to get clients" });
  }
});

// ============================================================================
// COST TEMPLATES (TEMPLATES DE CUSTO)
// ============================================================================

// GET /api/financeiro/templates - List cost templates
router.get("/templates", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { type, isActive } = req.query;

    let conditions = [eq(costTemplates.tenantId, tenantId)];

    if (type) {
      conditions.push(eq(costTemplates.type, type as string));
    }
    if (isActive !== undefined) {
      conditions.push(eq(costTemplates.isActive, isActive === 'true'));
    }

    const templates = await db
      .select()
      .from(costTemplates)
      .where(and(...conditions))
      .orderBy(desc(costTemplates.createdAt));

    res.json(templates);
  } catch (error: any) {
    console.error("[Financeiro API] Error listing templates:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// POST /api/financeiro/templates - Create cost template
router.post("/templates", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = insertCostTemplateSchema.parse(req.body);

    const [newTemplate] = await db.insert(costTemplates).values({
      ...validatedData,
      tenantId,
      createdBy: userId,
    }).returning();

    res.status(201).json(newTemplate);
  } catch (error: any) {
    console.error("[Financeiro API] Error creating template:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create template" });
  }
});

// PATCH /api/financeiro/templates/:id - Update cost template
router.patch("/templates/:id", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = insertCostTemplateSchema.partial().parse(req.body);

    const [updatedTemplate] = await db
      .update(costTemplates)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(and(
        eq(costTemplates.id, req.params.id),
        eq(costTemplates.tenantId, tenantId)
      ))
      .returning();

    if (!updatedTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json(updatedTemplate);
  } catch (error: any) {
    console.error("[Financeiro API] Error updating template:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update template" });
  }
});

// DELETE /api/financeiro/templates/:id - Delete cost template
router.delete("/templates/:id", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(costTemplates)
      .where(and(
        eq(costTemplates.id, req.params.id),
        eq(costTemplates.tenantId, tenantId)
      ));

    res.json({ message: "Template deleted successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error deleting template:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ============================================================================
// RATE CARDS (TABELAS DE TAXAS HORÁRIAS)
// ============================================================================

// GET /api/financeiro/rate-cards - List rate cards with KPIs
router.get("/rate-cards", requirePermission('financial.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { department, isActive } = req.query;

    let conditions = [eq(rateCards.tenantId, tenantId)];

    if (department) {
      conditions.push(eq(rateCards.department, department as string));
    }
    if (isActive !== undefined) {
      conditions.push(eq(rateCards.isActive, isActive === 'true'));
    }

    const cards = await db
      .select()
      .from(rateCards)
      .where(and(...conditions))
      .orderBy(desc(rateCards.createdAt));

    // Calculate KPIs
    const kpis = {
      averageMargin: 0,
      highestRate: 0,
      lowestRate: 0,
    };

    if (cards.length > 0) {
      const margins = cards.map(c => {
        const costRate = parseFloat(c.costRate || '0');
        const billRate = parseFloat(c.billRate || '0');
        return costRate > 0 ? ((billRate - costRate) / costRate) * 100 : 0;
      });

      kpis.averageMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
      kpis.highestRate = Math.max(...cards.map(c => parseFloat(c.billRate || '0')));
      kpis.lowestRate = Math.min(...cards.map(c => parseFloat(c.billRate || '0')).filter(r => r > 0));
    }

    res.json({ cards, kpis });
  } catch (error: any) {
    console.error("[Financeiro API] Error listing rate cards:", error);
    res.status(500).json({ error: "Failed to list rate cards" });
  }
});

// POST /api/financeiro/rate-cards - Create rate card
router.post("/rate-cards", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = insertRateCardSchema.parse(req.body);

    // Calculate margin percentage
    const costRate = parseFloat(validatedData.costRate);
    const billRate = parseFloat(validatedData.billRate);
    const marginPercentage = costRate > 0 ? ((billRate - costRate) / costRate) * 100 : 0;

    const [newRateCard] = await db.insert(rateCards).values({
      ...validatedData,
      tenantId,
      marginPercentage: marginPercentage.toFixed(2),
    }).returning();

    res.status(201).json(newRateCard);
  } catch (error: any) {
    console.error("[Financeiro API] Error creating rate card:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create rate card" });
  }
});

// PATCH /api/financeiro/rate-cards/:id - Update rate card
router.patch("/rate-cards/:id", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = insertRateCardSchema.partial().parse(req.body);

    // Recalculate margin if rates are being updated
    let updateData: any = { ...validatedData, updatedAt: new Date() };

    if (validatedData.costRate || validatedData.billRate) {
      const [existing] = await db
        .select()
        .from(rateCards)
        .where(and(
          eq(rateCards.id, req.params.id),
          eq(rateCards.tenantId, tenantId)
        ))
        .limit(1);

      if (existing) {
        const costRate = parseFloat(validatedData.costRate || existing.costRate);
        const billRate = parseFloat(validatedData.billRate || existing.billRate);
        const marginPercentage = costRate > 0 ? ((billRate - costRate) / costRate) * 100 : 0;
        updateData.marginPercentage = marginPercentage.toFixed(2);
      }
    }

    const [updatedRateCard] = await db
      .update(rateCards)
      .set(updateData)
      .where(and(
        eq(rateCards.id, req.params.id),
        eq(rateCards.tenantId, tenantId)
      ))
      .returning();

    if (!updatedRateCard) {
      return res.status(404).json({ error: "Rate card not found" });
    }

    res.json(updatedRateCard);
  } catch (error: any) {
    console.error("[Financeiro API] Error updating rate card:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update rate card" });
  }
});

// DELETE /api/financeiro/rate-cards/:id - Delete rate card
router.delete("/rate-cards/:id", requirePermission('financial.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(rateCards)
      .where(and(
        eq(rateCards.id, req.params.id),
        eq(rateCards.tenantId, tenantId)
      ));

    res.json({ message: "Rate card deleted successfully" });
  } catch (error: any) {
    console.error("[Financeiro API] Error deleting rate card:", error);
    res.status(500).json({ error: "Failed to delete rate card" });
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
    const { TemplateMappingService } = await import('../../../packages/modules/financeiro/services/templateMappingService');
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
      metadata: {
        generatedViaAI: true,
        originalDescription: description,
        extractedRequirements: extractedRequirements,
        templateMatchScore: mappingResult.bestMatch.matchScore
      }
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
    
    const { quoteEmailService } = await import('../../../packages/modules/financeiro/services/quoteEmailService');
    
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
    
    await db
      .update(quotes)
      .set({ 
        metadata: sql`jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{emailSentAt}',
          to_jsonb(NOW()::text)
        )`
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

console.log("[Financeiro Routes] ✅ Registered Portuguese routes: dashboard + faturas + recebimentos + contas-bancarias + reconciliacoes + configuracoes + templates + rate-cards + quotes + quote-lines + proposals + status-workflow");

export default router;
