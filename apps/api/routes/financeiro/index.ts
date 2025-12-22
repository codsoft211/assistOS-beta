/**
 * Financeiro (Financial) Module - Main Router
 * 
 * Complete financial management routes with Portuguese paths
 * SECURITY: All routes protected with module-level permission checks
 * TENANT ISOLATION: All queries filtered by tenantId
 * 
 * Restructured into modular subrouters:
 * - AR (Accounts Receivable): /ar/* - Invoices, payments, quotes, proposals
 * - AP (Accounts Payable): /ap/* - Bills, matching, approvals (skeleton)
 * - Treasury: /treasury/* - Bank accounts, reconciliation
 */

import { Router } from "express";
import { requirePermission } from "../../middleware/permissions.middleware";
import { hardTenantGuard } from "../../middleware/hard-tenant-guard";
import { db } from "../../db";
import { eq, and, gte, lte, desc, sql, sum, count } from "drizzle-orm";
import { z } from "zod";
import { 
  invoices, 
  payments, 
  taxRates,
  clients,
  costTemplates,
  rateCards,
  insertCostTemplateSchema,
  insertRateCardSchema
} from "../../../../shared/schema";
import { createArRouter } from "./ar";
import { createApRouter } from "./ap";
import { createTreasuryRouter } from "./treasury";
import { createCatalogRouter } from "../../../../packages/modules/financeiro/routes/catalog";
import * as shared from "./shared";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// This middleware MUST come first to prevent cross-tenant data leaks
// ============================================================================
router.use(hardTenantGuard);

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

    // Ensure server-side fields are set correctly
    const insertData: any = {
      ...validatedData,
      tenantId,
      createdBy: userId,
    };

    const [newTemplate] = await db.insert(costTemplates).values(insertData).returning();

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

    // Prepare update data with server-side fields
    const updateData: any = {
      ...validatedData,
      updatedAt: new Date(),
    };

    const [updatedTemplate] = await db
      .update(costTemplates)
      .set(updateData)
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
// SUBROUTER MOUNTS
// ============================================================================

// Mount modular subrouters
router.use('/ar', createArRouter());
router.use('/ap', createApRouter());
router.use('/treasury', createTreasuryRouter());
router.use('/catalog', createCatalogRouter());

// ============================================================================
// LEGACY COMPATIBILITY - Backwards compatible route mounts
// Re-mount AR routes at root level for existing frontend pages
// This ensures /faturas, /invoices, /recebimentos, /quotes, etc. still work
// ============================================================================

const arRouter = createArRouter();
router.use('/', arRouter);

// Export router
export default router;
