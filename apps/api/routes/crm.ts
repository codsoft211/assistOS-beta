// Complete Commercial CRM Backend - Production Ready
// Clientes (360°), Encomendas, Oportunidades, Analytics

import { Router } from "express";
import { db } from "../db";
import { z } from "zod";
import { 
  clients, 
  salesOrders, 
  salesOrderLines,
  opportunities,
  invoices,
  payments,
  paymentAllocations,
  commercialLeads,
  opportunityRules,
  clientInactiveConditionsSchema,
  productRecurringConditionsSchema,
  crossSellConditionsSchema,
  upsellConditionsSchema,
  churnRiskConditionsSchema,
  opportunityRuleActionsSchema,
  crmActivities,
  crmContracts,
  crmRenewals,
  insertCrmActivitySchema,
  insertCrmContractSchema,
  insertCrmRenewalSchema
} from "../../../shared/schema";
import { eq, and, or, sql, desc, gte, lte, ilike, count, sum } from "drizzle-orm";

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  nif: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default('Portugal'),
  status: z.enum(['Ativo', 'Inativo']).default('Ativo')
});

const createSalesOrderSchema = z.object({
  clientId: z.string(),
  expectedDeliveryDate: z.string().optional(),
  deliveryAddress: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    taxRate: z.number().default(23),
    productId: z.string().optional()
  })).min(1)
});

const createOpportunitySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  type: z.string(),
  source: z.string().default('manual'),
  stage: z.string().default('prospecting'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  estimatedValue: z.number().positive().optional(),
  probability: z.number().min(0).max(100).default(50),
  expectedCloseDate: z.string().optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional()
});

// ============================================================================
// CLIENTES - 360° VIEW
// ============================================================================

/**
 * GET /api/comercial/clientes
 * Lista clientes com filtros
 */
router.get("/clientes", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { search, status, limit = 50, offset = 0 } = req.query;

    let query = db
      .select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId));

    const conditions = [eq(clients.tenantId, tenantId)];

    if (search) {
      conditions.push(
        or(
          ilike(clients.name, `%${search}%`),
          ilike(clients.email, `%${search}%`),
          ilike(clients.company, `%${search}%`),
          ilike(clients.nif, `%${search}%`)
        )!
      );
    }

    if (status) {
      conditions.push(eq(clients.status, status as string));
    }

    const clientsList = await db
      .select()
      .from(clients)
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(clients.createdAt));

    const total = await db
      .select({ count: count() })
      .from(clients)
      .where(and(...conditions));

    res.json({
      clients: clientsList,
      total: total[0]?.count || 0
    });
  } catch (error: any) {
    console.error("[Commercial API] Error listing clients:", error);
    res.status(500).json({ error: "Failed to list clients", details: error.message });
  }
});

/**
 * GET /api/comercial/clientes/:id
 * Ficha completa 360° (histórico: leads, oportunidades, encomendas, faturas, pagamentos)
 * 
 * CRITICAL: Cross-module JOIN queries
 */
router.get("/clientes/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const client = await db
      .select()
      .from(clients)
      .where(and(
        eq(clients.id, id),
        eq(clients.tenantId, tenantId)
      ))
      .limit(1);

    if (!client || client.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const clientData = client[0];

    const ordersData = await db
      .select({
        totalOrders: count(salesOrders.id),
        totalRevenue: sum(salesOrders.totalAmount),
      })
      .from(salesOrders)
      .where(and(
        eq(salesOrders.clientId, id),
        eq(salesOrders.tenantId, tenantId)
      ));

    const stats = {
      totalOrders: Number(ordersData[0]?.totalOrders || 0),
      totalRevenue: Number(ordersData[0]?.totalRevenue || 0),
      avgOrderValue: ordersData[0]?.totalOrders && Number(ordersData[0].totalOrders) > 0
        ? Number(ordersData[0].totalRevenue || 0) / Number(ordersData[0].totalOrders)
        : 0,
      lifetimeValue: Number(ordersData[0]?.totalRevenue || 0)
    };

    const timelineEvents: any[] = [];

    const leadsData = await db
      .select()
      .from(commercialLeads)
      .where(and(
        or(
          eq(commercialLeads.contactEmail, clientData.email || ''),
          eq(commercialLeads.contactPhone, clientData.phone || '')
        )!,
        eq(commercialLeads.tenantId, tenantId)
      ))
      .orderBy(desc(commercialLeads.createdAt))
      .limit(10);

    leadsData.forEach(lead => {
      timelineEvents.push({
        type: 'lead',
        date: lead.createdAt,
        data: {
          id: lead.id,
          description: lead.description,
          status: lead.status,
          source: lead.leadSource
        }
      });
    });

    const opportunitiesData = await db
      .select()
      .from(opportunities)
      .where(and(
        eq(opportunities.clientId, id),
        eq(opportunities.tenantId, tenantId)
      ))
      .orderBy(desc(opportunities.createdAt))
      .limit(20);

    opportunitiesData.forEach(opp => {
      timelineEvents.push({
        type: 'opportunity',
        date: opp.createdAt,
        data: {
          id: opp.id,
          title: opp.title,
          stage: opp.stage,
          status: opp.status,
          estimatedValue: opp.estimatedValue,
          priority: opp.priority
        }
      });
    });

    const ordersTimeline = await db
      .select()
      .from(salesOrders)
      .where(and(
        eq(salesOrders.clientId, id),
        eq(salesOrders.tenantId, tenantId)
      ))
      .orderBy(desc(salesOrders.orderDate))
      .limit(20);

    ordersTimeline.forEach(order => {
      timelineEvents.push({
        type: 'order',
        date: order.createdAt,
        data: {
          id: order.id,
          code: order.orderNumber,
          status: order.status,
          totalAmount: order.totalAmount,
          invoiceId: order.invoiceId
        }
      });
    });

    const invoicesData = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.clientId, id),
        eq(invoices.tenantId, tenantId)
      ))
      .orderBy(desc(invoices.issueDate))
      .limit(20);

    invoicesData.forEach(invoice => {
      timelineEvents.push({
        type: 'invoice',
        date: invoice.issueDate,
        data: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          paymentStatus: invoice.paymentStatus,
          totalAmount: invoice.totalAmount,
          paidAmount: invoice.paidAmount
        }
      });
    });

    const invoiceIds = invoicesData.map(inv => inv.id);
    if (invoiceIds.length > 0) {
      const paymentsData = await db
        .select({
          payment: payments,
          allocation: paymentAllocations
        })
        .from(payments)
        .innerJoin(paymentAllocations, eq(payments.id, paymentAllocations.paymentId))
        .where(and(
          eq(payments.tenantId, tenantId),
          sql`${paymentAllocations.invoiceId} IN ${invoiceIds}`
        ))
        .orderBy(desc(payments.paymentDate))
        .limit(20);

      paymentsData.forEach(({ payment }) => {
        timelineEvents.push({
          type: 'payment',
          date: payment.paymentDate,
          data: {
            id: payment.id,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            status: payment.status
          }
        });
      });
    }

    timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      client: clientData,
      stats,
      timeline: timelineEvents
    });
  } catch (error: any) {
    console.error("[Commercial API] Error fetching client 360:", error);
    res.status(500).json({ error: "Failed to fetch client 360 view", details: error.message });
  }
});

/**
 * POST /api/comercial/clientes
 * Criar novo cliente
 */
router.post("/clientes", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clientData = createClientSchema.parse(req.body);

    const result = await db
      .insert(clients)
      .values({
        ...clientData,
        tenantId,
        createdBy: userId
      })
      .returning();

    res.status(201).json({
      success: true,
      client: result[0]
    });
  } catch (error: any) {
    console.error("[Commercial API] Error creating client:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create client", details: error.message });
  }
});

/**
 * PATCH /api/comercial/clientes/:id
 * Atualizar cliente
 */
router.patch("/clientes/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const clientData = createClientSchema.partial().parse(req.body);

    const result = await db
      .update(clients)
      .set(clientData)
      .where(and(
        eq(clients.id, id),
        eq(clients.tenantId, tenantId)
      ))
      .returning();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json({
      success: true,
      client: result[0]
    });
  } catch (error: any) {
    console.error("[Commercial API] Error updating client:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update client", details: error.message });
  }
});

/**
 * DELETE /api/comercial/clientes/:id
 * Soft delete cliente
 */
router.delete("/clientes/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const result = await db
      .update(clients)
      .set({ status: 'Inativo' })
      .where(and(
        eq(clients.id, id),
        eq(clients.tenantId, tenantId)
      ))
      .returning();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json({
      success: true,
      message: "Client deactivated successfully"
    });
  } catch (error: any) {
    console.error("[Commercial API] Error deleting client:", error);
    res.status(500).json({ error: "Failed to delete client", details: error.message });
  }
});

// ============================================================================
// ENCOMENDAS (SALES ORDERS) - SAP LINK CRITICAL
// ============================================================================

/**
 * GET /api/comercial/encomendas
 * Lista encomendas com filtros
 */
router.get("/encomendas", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { clientId, status, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const conditions = [eq(salesOrders.tenantId, tenantId)];

    if (clientId) {
      conditions.push(eq(salesOrders.clientId, clientId as string));
    }

    if (status) {
      conditions.push(eq(salesOrders.status, status as string));
    }

    if (startDate) {
      conditions.push(gte(salesOrders.orderDate, startDate as string));
    }

    if (endDate) {
      conditions.push(lte(salesOrders.orderDate, endDate as string));
    }

    const orders = await db
      .select({
        order: salesOrders,
        client: clients
      })
      .from(salesOrders)
      .leftJoin(clients, eq(salesOrders.clientId, clients.id))
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(salesOrders.orderDate));

    const total = await db
      .select({ count: count() })
      .from(salesOrders)
      .where(and(...conditions));

    res.json({
      orders: orders.map(({ order, client }) => ({
        ...order,
        client
      })),
      total: total[0]?.count || 0
    });
  } catch (error: any) {
    console.error("[Commercial API] Error listing sales orders:", error);
    res.status(500).json({ error: "Failed to list sales orders", details: error.message });
  }
});

/**
 * GET /api/comercial/encomendas/:id
 * Detalhes encomenda + linhas
 */
router.get("/encomendas/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const orderData = await db
      .select({
        order: salesOrders,
        client: clients
      })
      .from(salesOrders)
      .leftJoin(clients, eq(salesOrders.clientId, clients.id))
      .where(and(
        eq(salesOrders.id, id),
        eq(salesOrders.tenantId, tenantId)
      ))
      .limit(1);

    if (!orderData || orderData.length === 0) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    const lines = await db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.orderId, id));

    res.json({
      ...orderData[0].order,
      client: orderData[0].client,
      lines
    });
  } catch (error: any) {
    console.error("[Commercial API] Error fetching sales order:", error);
    res.status(500).json({ error: "Failed to fetch sales order", details: error.message });
  }
});

/**
 * POST /api/comercial/encomendas
 * Criar encomenda com linhas
 */
router.post("/encomendas", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const orderData = createSalesOrderSchema.parse(req.body);

    const clientCheck = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(
        eq(clients.id, orderData.clientId),
        eq(clients.tenantId, tenantId)
      ))
      .limit(1);

    if (!clientCheck || clientCheck.length === 0) {
      return res.status(400).json({ error: "Client not found or belongs to different tenant" });
    }

    const code = `SO-${Date.now()}`;
    
    let subtotal = 0;
    let taxTotal = 0;

    orderData.lines.forEach(line => {
      const lineTotal = line.quantity * line.unitPrice;
      const lineTax = lineTotal * (line.taxRate / 100);
      subtotal += lineTotal;
      taxTotal += lineTax;
    });

    const totalAmount = subtotal + taxTotal;

    const orderResult = await db
      .insert(salesOrders)
      .values({
        tenantId,
        code,
        clientId: orderData.clientId,
        orderDate: new Date().toISOString().split('T')[0],
        expectedDeliveryDate: orderData.expectedDeliveryDate,
        deliveryAddress: orderData.deliveryAddress,
        paymentMethod: orderData.paymentMethod,
        paymentTerms: orderData.paymentTerms,
        notes: orderData.notes,
        subtotal: subtotal.toString(),
        taxTotal: taxTotal.toString(),
        totalAmount: totalAmount.toString(),
        status: 'draft',
        createdBy: userId
      })
      .returning();

    const order = orderResult[0];

    const linesData = orderData.lines.map(line => {
      const lineTotal = line.quantity * line.unitPrice;
      const taxAmount = lineTotal * (line.taxRate / 100);
      
      return {
        tenantId,
        orderId: order.id,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        lineTotal: lineTotal.toString(),
        taxRate: line.taxRate.toString(),
        taxAmount: taxAmount.toString(),
        productId: line.productId
      };
    });

    await db.insert(salesOrderLines).values(linesData);

    const lines = await db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.orderId, order.id));

    res.status(201).json({
      success: true,
      order: {
        ...order,
        lines
      }
    });
  } catch (error: any) {
    console.error("[Commercial API] Error creating sales order:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create sales order", details: error.message });
  }
});

/**
 * PATCH /api/comercial/encomendas/:id
 * Atualizar encomenda
 */
router.patch("/encomendas/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const updates = req.body;

    const result = await db
      .update(salesOrders)
      .set(updates)
      .where(and(
        eq(salesOrders.id, id),
        eq(salesOrders.tenantId, tenantId)
      ))
      .returning();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    res.json({
      success: true,
      order: result[0]
    });
  } catch (error: any) {
    console.error("[Commercial API] Error updating sales order:", error);
    res.status(500).json({ error: "Failed to update sales order", details: error.message });
  }
});

/**
 * DELETE /api/comercial/encomendas/:id
 * Cancelar encomenda
 */
router.delete("/encomendas/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const result = await db
      .update(salesOrders)
      .set({ status: 'cancelled' })
      .where(and(
        eq(salesOrders.id, id),
        eq(salesOrders.tenantId, tenantId)
      ))
      .returning();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    res.json({
      success: true,
      message: "Sales order cancelled successfully"
    });
  } catch (error: any) {
    console.error("[Commercial API] Error cancelling sales order:", error);
    res.status(500).json({ error: "Failed to cancel sales order", details: error.message });
  }
});

/**
 * POST /api/comercial/encomendas/:id/gerar-fatura
 * Converter encomenda → fatura (SAP-style!)
 */
router.post("/encomendas/:id/gerar-fatura", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const orderData = await db
      .select()
      .from(salesOrders)
      .where(and(
        eq(salesOrders.id, id),
        eq(salesOrders.tenantId, tenantId)
      ))
      .limit(1);

    if (!orderData || orderData.length === 0) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    const order = orderData[0];

    if (order.invoiceId) {
      return res.status(400).json({ error: "Invoice already generated for this order" });
    }

    const invoiceNumber = `INV-${Date.now()}`;
    
    const invoiceResult = await db
      .insert(invoices)
      .values({
        tenantId,
        invoiceType: 'receivable',
        invoiceNumber,
        clientId: order.clientId,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'issued',
        paymentStatus: 'pending',
        subtotal: order.subtotal,
        taxAmount: order.taxTotal,
        totalAmount: order.totalAmount,
        paidAmount: '0',
        createdBy: userId
      })
      .returning();

    const invoice = invoiceResult[0];

    await db
      .update(salesOrders)
      .set({
        invoiceId: invoice.id,
        invoiceGeneratedAt: new Date()
      })
      .where(eq(salesOrders.id, id));

    res.status(201).json({
      success: true,
      invoice,
      message: "Invoice generated successfully from sales order"
    });
  } catch (error: any) {
    console.error("[Commercial API] Error generating invoice:", error);
    res.status(500).json({ error: "Failed to generate invoice", details: error.message });
  }
});

// ============================================================================
// OPORTUNIDADES
// ============================================================================

/**
 * GET /api/comercial/oportunidades
 * Lista oportunidades com filtros
 */
router.get("/oportunidades", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { type, priority, status, stage, clientId, assignedTo, limit = 50, offset = 0 } = req.query;

    const conditions = [eq(opportunities.tenantId, tenantId)];

    if (type) conditions.push(eq(opportunities.type, type as string));
    if (priority) conditions.push(eq(opportunities.priority, priority as string));
    if (status) conditions.push(eq(opportunities.status, status as string));
    if (stage) conditions.push(eq(opportunities.stage, stage as string));
    if (clientId) conditions.push(eq(opportunities.clientId, clientId as string));
    if (assignedTo) conditions.push(eq(opportunities.assignedTo, assignedTo as string));

    const oppList = await db
      .select()
      .from(opportunities)
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(opportunities.createdAt));

    const total = await db
      .select({ count: count() })
      .from(opportunities)
      .where(and(...conditions));

    res.json({
      opportunities: oppList,
      total: total[0]?.count || 0
    });
  } catch (error: any) {
    console.error("[Commercial API] Error listing opportunities:", error);
    res.status(500).json({ error: "Failed to list opportunities", details: error.message });
  }
});

/**
 * GET /api/comercial/oportunidades/:id
 * Detalhes oportunidade
 */
router.get("/oportunidades/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const opp = await db
      .select()
      .from(opportunities)
      .where(and(
        eq(opportunities.id, id),
        eq(opportunities.tenantId, tenantId)
      ))
      .limit(1);

    if (!opp || opp.length === 0) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    res.json(opp[0]);
  } catch (error: any) {
    console.error("[Commercial API] Error fetching opportunity:", error);
    res.status(500).json({ error: "Failed to fetch opportunity", details: error.message });
  }
});

/**
 * POST /api/comercial/oportunidades
 * Criar oportunidade manual
 */
router.post("/oportunidades", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const oppData = createOpportunitySchema.parse(req.body);

    const result = await db
      .insert(opportunities)
      .values({
        ...oppData,
        tenantId,
        createdBy: userId
      })
      .returning();

    res.status(201).json({
      success: true,
      opportunity: result[0]
    });
  } catch (error: any) {
    console.error("[Commercial API] Error creating opportunity:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create opportunity", details: error.message });
  }
});

/**
 * PATCH /api/comercial/oportunidades/:id
 * Atualizar (mudar stage, fechar won/lost)
 */
router.patch("/oportunidades/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const updates = createOpportunitySchema.partial().parse(req.body);

    const result = await db
      .update(opportunities)
      .set(updates as any)
      .where(and(
        eq(opportunities.id, id),
        eq(opportunities.tenantId, tenantId)
      ))
      .returning();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    res.json({
      success: true,
      opportunity: result[0]
    });
  } catch (error: any) {
    console.error("[Commercial API] Error updating opportunity:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update opportunity", details: error.message });
  }
});

/**
 * DELETE /api/comercial/oportunidades/:id
 * Cancelar
 */
router.delete("/oportunidades/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const result = await db
      .update(opportunities)
      .set({ status: 'cancelled' })
      .where(and(
        eq(opportunities.id, id),
        eq(opportunities.tenantId, tenantId)
      ))
      .returning();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    res.json({
      success: true,
      message: "Opportunity cancelled successfully"
    });
  } catch (error: any) {
    console.error("[Commercial API] Error cancelling opportunity:", error);
    res.status(500).json({ error: "Failed to cancel opportunity", details: error.message });
  }
});

/**
 * POST /api/comercial/oportunidades/:id/converter
 * Converter oportunidade → encomenda
 */
router.post("/oportunidades/:id/converter", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const oppData = await db
      .select()
      .from(opportunities)
      .where(and(
        eq(opportunities.id, id),
        eq(opportunities.tenantId, tenantId)
      ))
      .limit(1);

    if (!oppData || oppData.length === 0) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    const opp = oppData[0];

    if (opp.salesOrderId) {
      return res.status(400).json({ error: "Opportunity already converted to sales order" });
    }

    if (!opp.clientId) {
      return res.status(400).json({ error: "Opportunity must have a client to convert to order" });
    }

    const code = `SO-${Date.now()}`;
    const orderAmount = Number(opp.estimatedValue || 0);
    const taxAmount = orderAmount * 0.23;
    const totalAmount = orderAmount + taxAmount;

    const orderResult = await db
      .insert(salesOrders)
      .values({
        tenantId,
        code,
        clientId: opp.clientId,
        opportunityId: opp.id,
        orderDate: new Date().toISOString().split('T')[0],
        status: 'draft',
        subtotal: orderAmount.toString(),
        taxTotal: taxAmount.toString(),
        totalAmount: totalAmount.toString(),
        notes: `Converted from opportunity: ${opp.title}`,
        createdBy: userId
      })
      .returning();

    const order = orderResult[0];

    await db
      .update(opportunities)
      .set({
        salesOrderId: order.id,
        status: 'won',
        actualCloseDate: new Date().toISOString().split('T')[0]
      })
      .where(eq(opportunities.id, id));

    res.status(201).json({
      success: true,
      order,
      message: "Opportunity converted to sales order successfully"
    });
  } catch (error: any) {
    console.error("[Commercial API] Error converting opportunity:", error);
    res.status(500).json({ error: "Failed to convert opportunity", details: error.message });
  }
});

// ============================================================================
// ANALYTICS CRM
// ============================================================================

/**
 * GET /api/comercial/dashboard
 * KPIs CRM (pipeline, taxa conversão, top clientes)
 */
router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pipelineStats = await db
      .select({
        totalOpportunities: count(opportunities.id),
        totalValue: sum(opportunities.estimatedValue),
        wonOpportunities: sql`COUNT(CASE WHEN ${opportunities.status} = 'won' THEN 1 END)`,
        lostOpportunities: sql`COUNT(CASE WHEN ${opportunities.status} = 'lost' THEN 1 END)`,
      })
      .from(opportunities)
      .where(eq(opportunities.tenantId, tenantId));

    const ordersStats = await db
      .select({
        totalOrders: count(salesOrders.id),
        totalRevenue: sum(salesOrders.totalAmount)
      })
      .from(salesOrders)
      .where(eq(salesOrders.tenantId, tenantId));

    const topClients = await db
      .select({
        clientId: salesOrders.clientId,
        clientName: clients.name,
        totalOrders: count(salesOrders.id),
        totalRevenue: sum(salesOrders.totalAmount)
      })
      .from(salesOrders)
      .leftJoin(clients, eq(salesOrders.clientId, clients.id))
      .where(eq(salesOrders.tenantId, tenantId))
      .groupBy(salesOrders.clientId, clients.name)
      .orderBy(desc(sum(salesOrders.totalAmount)))
      .limit(10);

    const totalOpp = Number(pipelineStats[0]?.totalOpportunities || 0);
    const won = Number(pipelineStats[0]?.wonOpportunities || 0);
    const conversionRate = totalOpp > 0 ? (won / totalOpp) * 100 : 0;

    res.json({
      pipeline: {
        totalOpportunities: totalOpp,
        totalValue: Number(pipelineStats[0]?.totalValue || 0),
        wonOpportunities: won,
        lostOpportunities: Number(pipelineStats[0]?.lostOpportunities || 0),
        conversionRate: conversionRate.toFixed(2)
      },
      orders: {
        totalOrders: Number(ordersStats[0]?.totalOrders || 0),
        totalRevenue: Number(ordersStats[0]?.totalRevenue || 0),
        avgOrderValue: ordersStats[0]?.totalOrders && Number(ordersStats[0].totalOrders) > 0
          ? Number(ordersStats[0].totalRevenue || 0) / Number(ordersStats[0].totalOrders)
          : 0
      },
      topClients: topClients.map(c => ({
        ...c,
        totalRevenue: Number(c.totalRevenue || 0)
      }))
    });
  } catch (error: any) {
    console.error("[Commercial API] Error fetching dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard", details: error.message });
  }
});

/**
 * GET /api/comercial/dashboard/stats
 * Dashboard Stats - KPIs para Dashboard CRM
 */
router.get("/dashboard/stats", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Total clients and new clients this month
    const clientsStats = await db
      .select({
        total: count(clients.id),
        active: sql`COUNT(CASE WHEN ${clients.status} = 'Ativo' THEN 1 END)`,
        newThisMonth: sql`COUNT(CASE WHEN ${clients.createdAt} >= date_trunc('month', CURRENT_DATE) THEN 1 END)`
      })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));

    // Pipeline stats by status
    const oppStats = await db
      .select({
        total: count(opportunities.id),
        open: sql`COUNT(CASE WHEN ${opportunities.status} = 'open' THEN 1 END)`,
        inProgress: sql`COUNT(CASE WHEN ${opportunities.status} = 'in_progress' THEN 1 END)`,
        won: sql`COUNT(CASE WHEN ${opportunities.status} = 'won' THEN 1 END)`,
        lost: sql`COUNT(CASE WHEN ${opportunities.status} = 'lost' THEN 1 END)`,
        openValue: sql`SUM(CASE WHEN ${opportunities.status} = 'open' THEN COALESCE(${opportunities.estimatedValue}, 0) ELSE 0 END)`,
        inProgressValue: sql`SUM(CASE WHEN ${opportunities.status} = 'in_progress' THEN COALESCE(${opportunities.estimatedValue}, 0) ELSE 0 END)`,
        wonValue: sql`SUM(CASE WHEN ${opportunities.status} = 'won' THEN COALESCE(${opportunities.estimatedValue}, 0) ELSE 0 END)`,
        lostValue: sql`SUM(CASE WHEN ${opportunities.status} = 'lost' THEN COALESCE(${opportunities.estimatedValue}, 0) ELSE 0 END)`,
        pipelineValue: sql`SUM(CASE WHEN ${opportunities.status} IN ('open', 'in_progress') THEN COALESCE(${opportunities.estimatedValue}, 0) ELSE 0 END)`,
        aiGenerated: sql`COUNT(CASE WHEN ${opportunities.source} = 'ai_generated' AND ${opportunities.createdAt} >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END)`
      })
      .from(opportunities)
      .where(eq(opportunities.tenantId, tenantId));

    const totalOpp = Number(oppStats[0]?.total || 0);
    const won = Number(oppStats[0]?.won || 0);
    const conversionRate = totalOpp > 0 ? ((won / totalOpp) * 100).toFixed(1) : "0.0";

    res.json({
      totalClients: Number(clientsStats[0]?.active || 0),
      newClientsThisMonth: Number(clientsStats[0]?.newThisMonth || 0),
      pipelineValue: Number(oppStats[0]?.pipelineValue || 0),
      openOpportunities: Number(oppStats[0]?.open || 0),
      conversionRate: parseFloat(conversionRate),
      wonOpportunities: won,
      totalOpportunities: totalOpp,
      aiAlerts: Number(oppStats[0]?.aiGenerated || 0),
      
      // Pipeline breakdown data
      openValue: Number(oppStats[0]?.openValue || 0),
      inProgressOpportunities: Number(oppStats[0]?.inProgress || 0),
      inProgressValue: Number(oppStats[0]?.inProgressValue || 0),
      wonValue: Number(oppStats[0]?.wonValue || 0),
      lostOpportunities: Number(oppStats[0]?.lost || 0),
      lostValue: Number(oppStats[0]?.lostValue || 0)
    });
  } catch (error: any) {
    console.error("[Commercial API] Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch dashboard stats", details: error.message });
  }
});

/**
 * GET /api/comercial/dashboard/top-clients
 * Top clients by lifetime value
 */
router.get("/dashboard/top-clients", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { limit = 5 } = req.query;

    const topClients = await db
      .select({
        id: clients.id,
        name: clients.name,
        company: clients.company,
        totalOrders: count(salesOrders.id),
        lifetimeValue: sum(salesOrders.totalAmount)
      })
      .from(clients)
      .leftJoin(salesOrders, eq(clients.id, salesOrders.clientId))
      .where(eq(clients.tenantId, tenantId))
      .groupBy(clients.id, clients.name, clients.company)
      .orderBy(desc(sum(salesOrders.totalAmount)))
      .limit(Number(limit));

    res.json(topClients.map(c => ({
      id: c.id,
      name: c.name,
      company: c.company || '',
      totalOrders: Number(c.totalOrders || 0),
      lifetimeValue: Number(c.lifetimeValue || 0)
    })));
  } catch (error: any) {
    console.error("[Commercial API] Error fetching top clients:", error);
    res.status(500).json({ error: "Failed to fetch top clients", details: error.message });
  }
});

/**
 * GET /api/comercial/dashboard/ai-alerts
 * Recent AI-generated opportunities (alerts)
 */
router.get("/dashboard/ai-alerts", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { limit = 5 } = req.query;

    const aiAlerts = await db
      .select({
        opportunity: opportunities,
        client: clients
      })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .where(and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.source, 'ai_generated')
      ))
      .orderBy(desc(opportunities.createdAt))
      .limit(Number(limit));

    res.json(aiAlerts.map(({ opportunity, client }) => ({
      id: opportunity.id,
      title: opportunity.title,
      description: opportunity.description || '',
      type: opportunity.type || 'outros',
      clientName: client?.name || opportunity.clientName || 'Cliente não identificado',
      estimatedValue: Number(opportunity.estimatedValue || 0),
      probability: opportunity.probability || 50,
      createdAt: opportunity.createdAt
    })));
  } catch (error: any) {
    console.error("[Commercial API] Error fetching AI alerts:", error);
    res.status(500).json({ error: "Failed to fetch AI alerts", details: error.message });
  }
});

/**
 * GET /api/comercial/pipeline
 * Oportunidades por stage (Kanban data)
 */
router.get("/pipeline", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const oppsByStage = await db
      .select({
        stage: opportunities.stage,
        count: count(opportunities.id),
        totalValue: sum(opportunities.estimatedValue)
      })
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.status, 'open')
      ))
      .groupBy(opportunities.stage);

    const allOpportunities = await db
      .select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.status, 'open')
      ))
      .orderBy(desc(opportunities.createdAt));

    res.json({
      byStage: oppsByStage.map(s => ({
        ...s,
        totalValue: Number(s.totalValue || 0)
      })),
      opportunities: allOpportunities
    });
  } catch (error: any) {
    console.error("[Commercial API] Error fetching pipeline:", error);
    res.status(500).json({ error: "Failed to fetch pipeline", details: error.message });
  }
});

// ============================================================================
// LEGACY ROUTES - BACKWARDS COMPATIBILITY
// ============================================================================

router.get("/leads", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status, ownerId, limit = 50 } = req.query;

    const conditions = [eq(commercialLeads.tenantId, tenantId)];

    if (status) conditions.push(eq(commercialLeads.status, status as string));
    if (ownerId) conditions.push(eq(commercialLeads.ownerId, ownerId as string));

    const leads = await db
      .select()
      .from(commercialLeads)
      .where(and(...conditions))
      .limit(Number(limit))
      .orderBy(desc(commercialLeads.createdAt));

    res.json({ leads, total: leads.length });
  } catch (error: any) {
    console.error("[Commercial API] Error listing leads:", error);
    res.status(500).json({ error: "Failed to list leads", details: error.message });
  }
});

// These routes are handled by other route handlers above
// Removing duplicate/incorrect route definitions

// ============================================================================
// OPPORTUNITY RULES - CONFIGURADOR
// ============================================================================

const createRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: z.enum(['client_inactive', 'product_recurring', 'cross_sell', 'upsell', 'churn_risk']),
  conditions: z.record(z.any()),
  action: opportunityRuleActionsSchema,
  isActive: z.boolean().default(true)
});

// Helper function to validate conditions based on trigger type
function validateRuleConditions(trigger: string, conditions: any): boolean {
  try {
    switch (trigger) {
      case 'client_inactive':
        clientInactiveConditionsSchema.parse(conditions);
        break;
      case 'product_recurring':
        productRecurringConditionsSchema.parse(conditions);
        break;
      case 'cross_sell':
        crossSellConditionsSchema.parse(conditions);
        break;
      case 'upsell':
        upsellConditionsSchema.parse(conditions);
        break;
      case 'churn_risk':
        churnRiskConditionsSchema.parse(conditions);
        break;
      default:
        throw new Error(`Unknown trigger type: ${trigger}`);
    }
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * GET /api/comercial/rules
 * Lista regras de oportunidades
 */
router.get("/rules", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { isActive, limit = 50, offset = 0 } = req.query;

    const conditions = [eq(opportunityRules.tenantId, tenantId)];

    if (isActive !== undefined) {
      conditions.push(eq(opportunityRules.isActive, isActive === 'true'));
    }

    const rules = await db
      .select()
      .from(opportunityRules)
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(opportunityRules.createdAt));

    const total = await db
      .select({ count: count() })
      .from(opportunityRules)
      .where(and(...conditions));

    res.json({
      rules,
      total: total[0]?.count || 0
    });
  } catch (error: any) {
    console.error("[Commercial API] Error listing rules:", error);
    res.status(500).json({ error: "Failed to list rules", details: error.message });
  }
});

/**
 * POST /api/comercial/rules
 * Criar nova regra
 */
router.post("/rules", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validated = createRuleSchema.parse(req.body);

    // Validate conditions based on trigger type
    validateRuleConditions(validated.trigger, validated.conditions);

    const [rule] = await db
      .insert(opportunityRules)
      .values({
        tenantId,
        createdBy: userId,
        name: validated.name,
        description: validated.description,
        ruleType: validated.trigger,
        conditions: validated.conditions,
        action: validated.action,
        isActive: validated.isActive,
        triggers: {}
      })
      .returning();

    res.status(201).json(rule);
  } catch (error: any) {
    console.error("[Commercial API] Error creating rule:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create rule", details: error.message });
  }
});

/**
 * PATCH /api/comercial/rules/:id
 * Atualizar regra existente
 */
router.patch("/rules/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const validated = createRuleSchema.partial().parse(req.body);

    // If trigger or conditions are being updated, validate them
    if (validated.trigger && validated.conditions) {
      validateRuleConditions(validated.trigger, validated.conditions);
    } else if (validated.conditions) {
      // If only conditions are updated, get current trigger type
      const [existingRule] = await db
        .select({ ruleType: opportunityRules.ruleType })
        .from(opportunityRules)
        .where(and(
          eq(opportunityRules.id, id),
          eq(opportunityRules.tenantId, tenantId)
        ))
        .limit(1);
      
      if (!existingRule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      validateRuleConditions(existingRule.ruleType, validated.conditions);
    }

    const updateData: any = {
      updatedAt: new Date()
    };

    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.trigger !== undefined) updateData.ruleType = validated.trigger;
    if (validated.conditions !== undefined) updateData.conditions = validated.conditions;
    if (validated.action !== undefined) updateData.action = validated.action;
    if (validated.isActive !== undefined) updateData.isActive = validated.isActive;

    const [updated] = await db
      .update(opportunityRules)
      .set(updateData)
      .where(and(
        eq(opportunityRules.id, id),
        eq(opportunityRules.tenantId, tenantId)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Rule not found" });
    }

    res.json(updated);
  } catch (error: any) {
    console.error("[Commercial API] Error updating rule:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update rule", details: error.message });
  }
});

/**
 * DELETE /api/comercial/rules/:id
 * Deletar regra
 */
router.delete("/rules/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const [deleted] = await db
      .delete(opportunityRules)
      .where(and(
        eq(opportunityRules.id, id),
        eq(opportunityRules.tenantId, tenantId)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Rule not found" });
    }

    res.json({ success: true, message: "Rule deleted" });
  } catch (error: any) {
    console.error("[Commercial API] Error deleting rule:", error);
    res.status(500).json({ error: "Failed to delete rule", details: error.message });
  }
});

// ============================================================================
// CRM ACTIVITIES - COMPLETE TIMELINE FOR ACTIVE CLIENTS
// ============================================================================

/**
 * GET /api/crm/activities
 * List all activities with filters
 */
router.get("/activities", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { clientId, activityType, limit = 50, offset = 0 } = req.query;
    
    const conditions = [eq(crmActivities.tenantId, tenantId)];
    if (clientId) conditions.push(eq(crmActivities.clientId, clientId as string));
    if (activityType) conditions.push(eq(crmActivities.activityType, activityType as string));

    const activities = await db
      .select()
      .from(crmActivities)
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(crmActivities.createdAt));

    const total = await db
      .select({ count: count() })
      .from(crmActivities)
      .where(and(...conditions));

    res.json({ activities, total: total[0]?.count || 0 });
  } catch (error: any) {
    console.error("[CRM API] Error listing activities:", error);
    res.status(500).json({ error: "Failed to list activities" });
  }
});

/**
 * GET /api/crm/activities/:id
 * Get activity detail
 */
router.get("/activities/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const activity = await db
      .select()
      .from(crmActivities)
      .where(and(eq(crmActivities.id, id), eq(crmActivities.tenantId, tenantId)))
      .limit(1);

    if (!activity || activity.length === 0) {
      return res.status(404).json({ error: "Activity not found" });
    }

    res.json(activity[0]);
  } catch (error: any) {
    console.error("[CRM API] Error fetching activity:", error);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

/**
 * POST /api/crm/activities
 * Create new activity (call, email, meeting, note, task)
 */
router.post("/activities", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    if (!tenantId || !userId) return res.status(401).json({ error: "Unauthorized" });

    const validated = insertCrmActivitySchema.parse(req.body);

    // Validate tenant ownership of clientId (only if a real ID is provided)
    if (validated.clientId && validated.clientId.trim() !== '') {
      const client = await db.select().from(clients).where(
        and(eq(clients.id, validated.clientId), eq(clients.tenantId, tenantId))
      ).limit(1);
      if (!client || client.length === 0) {
        return res.status(403).json({ error: "Client not found or access denied" });
      }
    }

    const [activity] = await db
      .insert(crmActivities)
      .values({
        ...validated,
        tenantId,
        createdBy: userId
      })
      .returning();

    res.status(201).json(activity);
  } catch (error: any) {
    console.error("[CRM API] Error creating activity:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create activity" });
  }
});

/**
 * PATCH /api/crm/activities/:id
 * Update activity
 */
router.patch("/activities/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const validated = insertCrmActivitySchema.partial().parse(req.body);

    // Validate tenant ownership of clientId if being updated (only if a real ID is provided)
    if (validated.clientId && validated.clientId.trim() !== '') {
      const client = await db.select().from(clients).where(
        and(eq(clients.id, validated.clientId), eq(clients.tenantId, tenantId))
      ).limit(1);
      if (!client || client.length === 0) {
        return res.status(403).json({ error: "Client not found or access denied" });
      }
    }

    const [updated] = await db
      .update(crmActivities)
      .set(validated)
      .where(and(eq(crmActivities.id, id), eq(crmActivities.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Activity not found" });
    res.json(updated);
  } catch (error: any) {
    console.error("[CRM API] Error updating activity:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update activity" });
  }
});

/**
 * DELETE /api/crm/activities/:id
 * Delete activity
 */
router.delete("/activities/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const [deleted] = await db
      .delete(crmActivities)
      .where(and(eq(crmActivities.id, id), eq(crmActivities.tenantId, tenantId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Activity not found" });
    res.json({ success: true, message: "Activity deleted" });
  } catch (error: any) {
    console.error("[CRM API] Error deleting activity:", error);
    res.status(500).json({ error: "Failed to delete activity" });
  }
});

// ============================================================================
// CRM CONTRACTS - MULTI-CONTRACT SUPPORT PER CLIENT
// ============================================================================

/**
 * GET /api/crm/contracts
 * List all contracts with filters
 */
router.get("/contracts", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { clientId, status, limit = 50, offset = 0 } = req.query;
    
    const conditions = [eq(crmContracts.tenantId, tenantId)];
    if (clientId) conditions.push(eq(crmContracts.clientId, clientId as string));
    if (status) conditions.push(eq(crmContracts.status, status as string));

    const contracts = await db
      .select({
        contract: crmContracts,
        client: clients
      })
      .from(crmContracts)
      .leftJoin(clients, eq(crmContracts.clientId, clients.id))
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(crmContracts.createdAt));

    const total = await db
      .select({ count: count() })
      .from(crmContracts)
      .where(and(...conditions));

    res.json({ 
      contracts: contracts.map(({ contract, client }) => ({ ...contract, client })),
      total: total[0]?.count || 0 
    });
  } catch (error: any) {
    console.error("[CRM API] Error listing contracts:", error);
    res.status(500).json({ error: "Failed to list contracts" });
  }
});

/**
 * GET /api/crm/contracts/:id
 * Get contract detail
 */
router.get("/contracts/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const contractData = await db
      .select({
        contract: crmContracts,
        client: clients
      })
      .from(crmContracts)
      .leftJoin(clients, eq(crmContracts.clientId, clients.id))
      .where(and(eq(crmContracts.id, id), eq(crmContracts.tenantId, tenantId)))
      .limit(1);

    if (!contractData || contractData.length === 0) {
      return res.status(404).json({ error: "Contract not found" });
    }

    res.json({ ...contractData[0].contract, client: contractData[0].client });
  } catch (error: any) {
    console.error("[CRM API] Error fetching contract:", error);
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

/**
 * POST /api/crm/contracts
 * Create new contract
 */
router.post("/contracts", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    if (!tenantId || !userId) return res.status(401).json({ error: "Unauthorized" });

    const validated = insertCrmContractSchema.parse(req.body);

    // Validate tenant ownership of clientId (only if a real ID is provided)
    if (validated.clientId && validated.clientId.trim() !== '') {
      const client = await db.select().from(clients).where(
        and(eq(clients.id, validated.clientId), eq(clients.tenantId, tenantId))
      ).limit(1);
      if (!client || client.length === 0) {
        return res.status(403).json({ error: "Client not found or access denied" });
      }
    }

    const [contract] = await db
      .insert(crmContracts)
      .values({
        ...validated,
        tenantId,
        createdBy: userId
      })
      .returning();

    res.status(201).json(contract);
  } catch (error: any) {
    console.error("[CRM API] Error creating contract:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create contract" });
  }
});

/**
 * PATCH /api/crm/contracts/:id
 * Update contract
 */
router.patch("/contracts/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const validated = insertCrmContractSchema.partial().parse(req.body);

    // Validate tenant ownership of clientId if being updated (only if a real ID is provided)
    if (validated.clientId && validated.clientId.trim() !== '') {
      const client = await db.select().from(clients).where(
        and(eq(clients.id, validated.clientId), eq(clients.tenantId, tenantId))
      ).limit(1);
      if (!client || client.length === 0) {
        return res.status(403).json({ error: "Client not found or access denied" });
      }
    }

    const [updated] = await db
      .update(crmContracts)
      .set(validated)
      .where(and(eq(crmContracts.id, id), eq(crmContracts.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Contract not found" });
    res.json(updated);
  } catch (error: any) {
    console.error("[CRM API] Error updating contract:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update contract" });
  }
});

/**
 * DELETE /api/crm/contracts/:id
 * Cancel contract
 */
router.delete("/contracts/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const [deleted] = await db
      .update(crmContracts)
      .set({ status: 'cancelled' })
      .where(and(eq(crmContracts.id, id), eq(crmContracts.tenantId, tenantId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Contract not found" });
    res.json({ success: true, message: "Contract cancelled" });
  } catch (error: any) {
    console.error("[CRM API] Error cancelling contract:", error);
    res.status(500).json({ error: "Failed to cancel contract" });
  }
});

// ============================================================================
// CRM RENEWALS - FORECAST, ALERTS & INTERVENTION
// ============================================================================

/**
 * GET /api/crm/renewals
 * List all renewals with forecast
 */
router.get("/renewals", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { clientId, status, riskLevel, limit = 50, offset = 0 } = req.query;
    
    const conditions = [eq(crmRenewals.tenantId, tenantId)];
    if (clientId) conditions.push(eq(crmRenewals.clientId, clientId as string));
    if (status) conditions.push(eq(crmRenewals.status, status as string));
    if (riskLevel) conditions.push(eq(crmRenewals.riskLevel, riskLevel as string));

    const renewals = await db
      .select({
        renewal: crmRenewals,
        client: clients,
        contract: crmContracts
      })
      .from(crmRenewals)
      .leftJoin(clients, eq(crmRenewals.clientId, clients.id))
      .leftJoin(crmContracts, eq(crmRenewals.contractId, crmContracts.id))
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(crmRenewals.renewalDate);

    const total = await db
      .select({ count: count() })
      .from(crmRenewals)
      .where(and(...conditions));

    res.json({ 
      renewals: renewals.map(({ renewal, client, contract }) => ({ 
        ...renewal, 
        client, 
        contract 
      })),
      total: total[0]?.count || 0 
    });
  } catch (error: any) {
    console.error("[CRM API] Error listing renewals:", error);
    res.status(500).json({ error: "Failed to list renewals" });
  }
});

/**
 * GET /api/crm/renewals/upcoming
 * Get upcoming renewals (next 90 days) with alert status
 */
router.get("/renewals/upcoming", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();
    const next90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const upcomingRenewals = await db
      .select({
        renewal: crmRenewals,
        client: clients,
        contract: crmContracts
      })
      .from(crmRenewals)
      .leftJoin(clients, eq(crmRenewals.clientId, clients.id))
      .leftJoin(crmContracts, eq(crmRenewals.contractId, crmContracts.id))
      .where(and(
        eq(crmRenewals.tenantId, tenantId),
        gte(crmRenewals.renewalDate, now),
        lte(crmRenewals.renewalDate, next90Days),
        or(
          eq(crmRenewals.status, 'upcoming'),
          eq(crmRenewals.status, 'at_risk'),
          eq(crmRenewals.status, 'in_negotiation')
        )!
      ))
      .orderBy(crmRenewals.renewalDate);

    res.json({ renewals: upcomingRenewals.map(({ renewal, client, contract }) => ({ 
      ...renewal, 
      client, 
      contract 
    })) });
  } catch (error: any) {
    console.error("[CRM API] Error fetching upcoming renewals:", error);
    res.status(500).json({ error: "Failed to fetch upcoming renewals" });
  }
});

/**
 * GET /api/crm/renewals/:id
 * Get renewal detail
 */
router.get("/renewals/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const renewalData = await db
      .select({
        renewal: crmRenewals,
        client: clients,
        contract: crmContracts
      })
      .from(crmRenewals)
      .leftJoin(clients, eq(crmRenewals.clientId, clients.id))
      .leftJoin(crmContracts, eq(crmRenewals.contractId, crmContracts.id))
      .where(and(eq(crmRenewals.id, id), eq(crmRenewals.tenantId, tenantId)))
      .limit(1);

    if (!renewalData || renewalData.length === 0) {
      return res.status(404).json({ error: "Renewal not found" });
    }

    const { renewal, client, contract } = renewalData[0];
    res.json({ ...renewal, client, contract });
  } catch (error: any) {
    console.error("[CRM API] Error fetching renewal:", error);
    res.status(500).json({ error: "Failed to fetch renewal" });
  }
});

/**
 * POST /api/crm/renewals
 * Create new renewal forecast
 */
router.post("/renewals", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    if (!tenantId || !userId) return res.status(401).json({ error: "Unauthorized" });

    const validated = insertCrmRenewalSchema.parse(req.body);

    // Validate tenant ownership of clientId (only if a real ID is provided)
    if (validated.clientId && validated.clientId.trim() !== '') {
      const client = await db.select().from(clients).where(
        and(eq(clients.id, validated.clientId), eq(clients.tenantId, tenantId))
      ).limit(1);
      if (!client || client.length === 0) {
        return res.status(403).json({ error: "Client not found or access denied" });
      }
    }

    // Validate tenant ownership of contractId (only if a real ID is provided)
    if (validated.contractId && validated.contractId.trim() !== '') {
      const contract = await db.select().from(crmContracts).where(
        and(eq(crmContracts.id, validated.contractId), eq(crmContracts.tenantId, tenantId))
      ).limit(1);
      if (!contract || contract.length === 0) {
        return res.status(403).json({ error: "Contract not found or access denied" });
      }
    }

    const [renewal] = await db
      .insert(crmRenewals)
      .values({
        ...validated,
        tenantId,
        createdBy: userId
      })
      .returning();

    res.status(201).json(renewal);
  } catch (error: any) {
    console.error("[CRM API] Error creating renewal:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create renewal" });
  }
});

/**
 * PATCH /api/crm/renewals/:id
 * Update renewal (status, risk, intervention plan)
 */
router.patch("/renewals/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const validated = insertCrmRenewalSchema.partial().parse(req.body);

    // Validate tenant ownership of clientId if being updated (only if a real ID is provided)
    if (validated.clientId && validated.clientId.trim() !== '') {
      const client = await db.select().from(clients).where(
        and(eq(clients.id, validated.clientId), eq(clients.tenantId, tenantId))
      ).limit(1);
      if (!client || client.length === 0) {
        return res.status(403).json({ error: "Client not found or access denied" });
      }
    }

    // Validate tenant ownership of contractId if being updated (only if a real ID is provided)
    if (validated.contractId && validated.contractId.trim() !== '') {
      const contract = await db.select().from(crmContracts).where(
        and(eq(crmContracts.id, validated.contractId), eq(crmContracts.tenantId, tenantId))
      ).limit(1);
      if (!contract || contract.length === 0) {
        return res.status(403).json({ error: "Contract not found or access denied" });
      }
    }

    const [updated] = await db
      .update(crmRenewals)
      .set(validated)
      .where(and(eq(crmRenewals.id, id), eq(crmRenewals.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Renewal not found" });
    res.json(updated);
  } catch (error: any) {
    console.error("[CRM API] Error updating renewal:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update renewal" });
  }
});

/**
 * DELETE /api/crm/renewals/:id
 * Cancel renewal tracking
 */
router.delete("/renewals/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const [deleted] = await db
      .update(crmRenewals)
      .set({ status: 'cancelled' })
      .where(and(eq(crmRenewals.id, id), eq(crmRenewals.tenantId, tenantId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Renewal not found" });
    res.json({ success: true, message: "Renewal cancelled" });
  } catch (error: any) {
    console.error("[CRM API] Error cancelling renewal:", error);
    res.status(500).json({ error: "Failed to cancel renewal" });
  }
});

export default router;
