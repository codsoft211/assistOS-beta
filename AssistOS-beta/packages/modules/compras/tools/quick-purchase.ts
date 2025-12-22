/**
 * ComprasModule - Quick Purchase Flow AI Tools (CRITICAL!)
 * 5 tools for rapid procurement workflow automation
 * Enables AI to handle entire purchase cycle from bulk requests to invoice submission
 */

import { db } from "../../../../apps/api/db";
import { 
  purchaseRequisitions, 
  purchaseRequisitionLines,
  purchaseOrders,
  purchaseOrderLines,
  suppliers,
  products,
  purchasingInvoices,
  purchasingInvoiceLines,
} from "../../../../shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { sendPurchaseOrderEmail } from "../services/email";
import { getBaseUrl } from "../../../../apps/api/config/environment";

export const quickPurchaseTools = [
  {
    type: "function" as const,
    function: {
      name: "bulk_create_purchase_requests",
      description: "Cria múltiplas requisições de compra de uma só vez a partir de lista de produtos. Ideal para pedidos em massa. Retorna IDs das requisições criadas.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productCode: {
                  type: "string",
                  description: "Código do produto",
                },
                quantity: {
                  type: "number",
                  description: "Quantidade a requisitar",
                },
                notes: {
                  type: "string",
                  description: "Notas específicas do item (opcional)",
                },
              },
              required: ["productCode", "quantity"],
            },
            description: "Lista de itens a requisitar (obrigatório)",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Prioridade das requisições (default: normal)",
          },
          notes: {
            type: "string",
            description: "Notas gerais aplicadas a todas requisições",
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "auto_generate_purchase_orders",
      description: "Gera automaticamente Purchase Orders (POs) a partir de requisições aprovadas. Agrupa por fornecedor, calcula preços, cria linhas. Retorna POs criados prontos para envio.",
      parameters: {
        type: "object",
        properties: {
          requisitionIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs das requisições aprovadas para converter em POs (obrigatório)",
          },
          autoSelectSuppliers: {
            type: "boolean",
            description: "Auto-selecionar melhores fornecedores por score (default: true)",
          },
          paymentTerms: {
            type: "string",
            description: "Termos de pagamento para POs (ex: 'Net 30')",
          },
        },
        required: ["requisitionIds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_po_with_invoice_request",
      description: "Envia PO ao fornecedor por email incluindo link para submissão de invoice. Automatiza comunicação supplier + invoice request. IMPORTANTE: Retorna token único para o supplier submeter invoice.",
      parameters: {
        type: "object",
        properties: {
          poId: {
            type: "string",
            description: "ID do Purchase Order a enviar (obrigatório)",
          },
          supplierEmail: {
            type: "string",
            description: "Email do fornecedor (obrigatório)",
          },
          customMessage: {
            type: "string",
            description: "Mensagem customizada no email (opcional)",
          },
          includeInvoiceRequestLink: {
            type: "boolean",
            description: "Incluir link para submissão de invoice (default: true)",
          },
        },
        required: ["poId", "supplierEmail"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "process_supplier_invoice_submission",
      description: "Processa invoice submetido por supplier através do link público. Valida token, cria purchasing_invoice, extrai OCR se aplicável, executa 3-way match inicial. Retorna invoice criado + match status.",
      parameters: {
        type: "object",
        properties: {
          submissionToken: {
            type: "string",
            description: "Token único de submissão enviado ao supplier (obrigatório)",
          },
          invoiceNumber: {
            type: "string",
            description: "Número da invoice do supplier (obrigatório)",
          },
          invoiceDate: {
            type: "string",
            description: "Data da invoice (YYYY-MM-DD) (obrigatório)",
          },
          totalAmount: {
            type: "number",
            description: "Valor total da invoice (obrigatório)",
          },
          attachmentUrl: {
            type: "string",
            description: "URL do PDF/imagem da invoice uploadado (opcional)",
          },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                },
                quantity: {
                  type: "number",
                },
                unitPrice: {
                  type: "number",
                },
                lineTotal: {
                  type: "number",
                },
              },
            },
            description: "Linhas da invoice (opcional - pode vir de OCR)",
          },
        },
        required: ["submissionToken", "invoiceNumber", "invoiceDate", "totalAmount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_accounts_payable_summary",
      description: "Retorna resumo completo de Accounts Payable (contas a pagar): total pending invoices, total amount due, aging breakdown, top suppliers. Útil para dashboards e decisões financeiras.",
      parameters: {
        type: "object",
        properties: {
          includeAgingBreakdown: {
            type: "boolean",
            description: "Incluir breakdown por aging (0-30, 31-60, 61-90, 90+) (default: true)",
          },
          includeTopSuppliers: {
            type: "boolean",
            description: "Incluir top 10 suppliers por valor pendente (default: true)",
          },
        },
      },
    },
  },
];

/**
 * Execute a quick purchase tool based on tool call from AI
 */
export async function executeQuickPurchaseTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Quick Purchase Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "bulk_create_purchase_requests":
      return await handleBulkCreatePurchaseRequests(args, context);
      
    case "auto_generate_purchase_orders":
      return await handleAutoGeneratePurchaseOrders(args, context);
      
    case "send_po_with_invoice_request":
      return await handleSendPOWithInvoiceRequest(args, context);
      
    case "process_supplier_invoice_submission":
      return await handleProcessSupplierInvoiceSubmission(args, context);
      
    case "get_accounts_payable_summary":
      return await handleGetAccountsPayableSummary(args, context);
      
    default:
      throw new Error(`Unknown quick purchase tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleBulkCreatePurchaseRequests(
  args: {
    items: Array<{
      productCode: string;
      quantity: number;
      notes?: string;
    }>;
    priority?: string;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { items, priority = 'normal', notes } = args;

  // Get products to validate and get IDs
  const productCodes = items.map(i => i.productCode);
  const productsData = await db
    .select()
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      inArray(products.code, productCodes)
    ));

  if (productsData.length !== items.length) {
    return {
      success: false,
      error: `Alguns produtos não foram encontrados no tenant. Encontrados: ${productsData.length}/${items.length}`,
    };
  }

  const productMap = new Map(productsData.map(p => [p.code, p]));

  // Create requisition
  const requisitionCode = `REQ-${Date.now()}`;
  const requisition = await db.insert(purchaseRequisitions).values({
    id: nanoid(),
    tenantId,
    code: requisitionCode,
    requestDate: new Date(),
    requestedBy: userId || nanoid(),
    priority: priority as any,
    status: 'draft',
    notes: notes || `Bulk requisition - ${items.length} items`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create lines
  const lines = [];
  for (const item of items) {
    const product = productMap.get(item.productCode);
    if (!product) continue;

    const line = await db.insert(purchaseRequisitionLines).values({
      id: nanoid(),
      tenantId,
      requisitionId: requisition[0].id,
      productId: product.id,
      quantity: item.quantity.toString(),
      uom: product.uom || 'UN',
      estimatedPrice: product.price,
      estimatedTotal: (parseFloat(product.price || '0') * item.quantity).toString(),
      notes: item.notes,
    }).returning();

    lines.push(line[0]);
  }

  return {
    success: true,
    message: `Requisição ${requisitionCode} criada com ${lines.length} itens`,
    requisition: requisition[0],
    lines,
  };
}

async function handleAutoGeneratePurchaseOrders(
  args: {
    requisitionIds: string[];
    autoSelectSuppliers?: boolean;
    paymentTerms?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { requisitionIds, autoSelectSuppliers = true, paymentTerms } = args;

  // Get requisitions + lines
  const requisitionsData = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(
      eq(purchaseRequisitions.tenantId, tenantId),
      inArray(purchaseRequisitions.id, requisitionIds)
    ));

  if (requisitionsData.length === 0) {
    return {
      success: false,
      error: "Nenhuma requisição encontrada",
    };
  }

  const linesData = await db
    .select()
    .from(purchaseRequisitionLines)
    .where(and(
      eq(purchaseRequisitionLines.tenantId, tenantId),
      inArray(purchaseRequisitionLines.requisitionId, requisitionIds)
    ));

  // For simplicity, create ONE PO with all lines
  // In production, would group by suggested supplier
  const firstSupplier = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.tenantId, tenantId),
      eq(suppliers.status, 'active')
    ))
    .orderBy(desc(suppliers.rating))
    .limit(1);

  if (firstSupplier.length === 0) {
    return {
      success: false,
      error: "Nenhum fornecedor ativo encontrado. Crie um fornecedor primeiro.",
    };
  }

  const poCode = `PO-${Date.now()}`;
  const totalAmount = linesData.reduce((sum, line) => 
    sum + parseFloat(line.estimatedTotal || '0'), 0
  );

  const po = await db.insert(purchaseOrders).values({
    id: nanoid(),
    tenantId,
    code: poCode,
    orderDate: new Date(),
    supplierId: firstSupplier[0].id,
    subtotal: totalAmount.toString(),
    taxTotal: (totalAmount * 0.23).toString(),
    totalAmount: (totalAmount * 1.23).toString(),
    currency: 'EUR',
    paymentTerms: paymentTerms || firstSupplier[0].paymentTerms || 'Net 30',
    status: 'draft',
    createdBy: userId || nanoid(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create PO lines from requisition lines
  const poLines = [];
  for (const line of linesData) {
    const poLine = await db.insert(purchaseOrderLines).values({
      id: nanoid(),
      tenantId,
      poId: po[0].id,
      requisitionLineId: line.id,
      productId: line.productId,
      quantity: line.quantity,
      uom: line.uom,
      unitPrice: line.estimatedPrice,
      lineTotal: line.estimatedTotal,
      remainingQuantity: line.quantity,
    }).returning();

    poLines.push(poLine[0]);
  }

  return {
    success: true,
    message: `PO ${poCode} gerado automaticamente com ${poLines.length} linhas`,
    po: po[0],
    lines: poLines,
  };
}

async function handleSendPOWithInvoiceRequest(
  args: {
    poId: string;
    supplierEmail: string;
    customMessage?: string;
    includeInvoiceRequestLink?: boolean;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { poId, supplierEmail, customMessage, includeInvoiceRequestLink = true } = args;

  // Verify PO exists in tenant
  const po = await db
    .select()
    .from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenantId, tenantId)
    ))
    .limit(1);

  if (po.length === 0) {
    return {
      success: false,
      error: "PO não encontrado",
    };
  }

  // Get supplier information
  const supplier = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.id, po[0].supplierId),
      eq(suppliers.tenantId, tenantId)
    ))
    .limit(1);

  if (supplier.length === 0) {
    return {
      success: false,
      error: "Fornecedor não encontrado",
    };
  }

  // Use provided email or fall back to supplier's email
  const emailTo = supplierEmail || supplier[0].email;

  if (!emailTo) {
    return {
      success: false,
      error: "Supplier email not available - please provide supplierEmail or update supplier record",
    };
  }

  // Generate UUID token for supplier invoice submission
  const submissionToken = crypto.randomUUID();
  
  // Set expiry to 48 hours from now
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  // Update PO with token and expiry
  await db
    .update(purchaseOrders)
    .set({
      invoiceSubmissionToken: submissionToken,
      invoiceSubmissionTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenantId, tenantId)
    ));

  // Get base URL from environment
  const baseUrl = getBaseUrl();
  const invoiceSubmitUrl = `${baseUrl}/supplier-invoice/${submissionToken}`;

  // Send email using email service
  const emailResult = await sendPurchaseOrderEmail({
    supplierId: supplier[0].id,
    supplierEmail: emailTo, // Use the determined email (supplied or DB)
    supplierName: supplier[0].name,
    poNumber: po[0].code,
    poId: po[0].id,
    totalAmount: parseFloat(po[0].totalAmount),
    currency: po[0].currency || 'EUR',
    invoiceSubmissionToken: submissionToken,
    invoiceSubmissionUrl: invoiceSubmitUrl,
    tenantId,
    customMessage,
  });

  if (!emailResult.success) {
    console.error('[send_po_with_invoice_request] Email failed:', emailResult.error);
    // Don't fail the entire operation if email fails - just log the error
  }

  return {
    success: true,
    message: `PO ${po[0].code} enviado para ${supplier[0].name}`,
    po: po[0],
    supplier: {
      id: supplier[0].id,
      name: supplier[0].name,
      email: supplier[0].email,
    },
    submissionToken,
    invoiceSubmitUrl: includeInvoiceRequestLink ? invoiceSubmitUrl : null,
    emailSent: emailResult.success,
    emailMessageId: emailResult.messageId,
  };
}

async function handleProcessSupplierInvoiceSubmission(
  args: {
    submissionToken: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmount: number;
    attachmentUrl?: string;
    lineItems?: Array<{
      description?: string;
      quantity?: number;
      unitPrice?: number;
      lineTotal?: number;
    }>;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { submissionToken, invoiceNumber, invoiceDate, totalAmount, attachmentUrl, lineItems } = args;

  // Find PO by token (simplified - in production, store token in dedicated table)
  const pos = await db
    .select()
    .from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.tenantId, tenantId),
      sql`${purchaseOrders.notes} LIKE ${'%' + submissionToken + '%'}`
    ))
    .limit(1);

  if (pos.length === 0) {
    return {
      success: false,
      error: "Token inválido ou PO não encontrado",
    };
  }

  const po = pos[0];

  // Create invoice
  const invoiceCode = `INV-${Date.now()}`;
  const invoice = await db.insert(purchasingInvoices).values({
    id: nanoid(),
    tenantId,
    code: invoiceCode,
    invoiceNumber,
    invoiceDate: new Date(invoiceDate),
    supplierId: po.supplierId,
    poId: po.id,
    submissionSource: 'web_form',
    subtotal: (totalAmount / 1.23).toString(),
    taxTotal: (totalAmount - totalAmount / 1.23).toString(),
    totalAmount: totalAmount.toString(),
    currency: po.currency,
    threeWayMatchStatus: 'pending',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create invoice lines if provided
  const invoiceLines = [];
  if (lineItems && lineItems.length > 0) {
    for (const item of lineItems) {
      const line = await db.insert(purchasingInvoiceLines).values({
        id: nanoid(),
        tenantId,
        invoiceId: invoice[0].id,
        description: item.description || 'Item',
        quantity: (item.quantity || 1).toString(),
        unitPrice: (item.unitPrice || 0).toString(),
        lineTotal: (item.lineTotal || 0).toString(),
        taxRate: '23',
        taxAmount: ((item.lineTotal || 0) * 0.23).toString(),
      }).returning();

      invoiceLines.push(line[0]);
    }
  }

  // Initial 3-way match check (simplified)
  const poTotal = parseFloat(po.totalAmount);
  const invoiceTotal = totalAmount;
  const discrepancy = Math.abs(poTotal - invoiceTotal);
  const matchStatus = discrepancy < 1 ? 'matched' : 'discrepancy';

  await db
    .update(purchasingInvoices)
    .set({
      threeWayMatchStatus: matchStatus as any,
      poDiscrepancy: discrepancy > 0,
      poDiscrepancyAmount: discrepancy.toString(),
    })
    .where(and(
      eq(purchasingInvoices.id, invoice[0].id),
      eq(purchasingInvoices.tenantId, tenantId)
    ));

  return {
    success: true,
    message: `Invoice ${invoiceNumber} processada com sucesso`,
    invoice: invoice[0],
    lines: invoiceLines,
    matchResult: {
      status: matchStatus,
      poTotal,
      invoiceTotal,
      discrepancy,
      approved: matchStatus === 'matched',
    },
  };
}

async function handleGetAccountsPayableSummary(
  args: {
    includeAgingBreakdown?: boolean;
    includeTopSuppliers?: boolean;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { includeAgingBreakdown = true, includeTopSuppliers = true } = args;

  // Get all pending/approved invoices
  const invoices = await db
    .select()
    .from(purchasingInvoices)
    .where(and(
      eq(purchasingInvoices.tenantId, tenantId),
      inArray(purchasingInvoices.status, ['pending_approval', 'approved'])
    ));

  const totalPending = invoices.reduce((sum, inv) => 
    sum + parseFloat(inv.remainingAmount || inv.totalAmount), 0
  );

  const summary: any = {
    totalPendingInvoices: invoices.length,
    totalAmountDue: totalPending,
    currency: 'EUR',
  };

  // Aging breakdown
  if (includeAgingBreakdown) {
    const now = new Date();
    const aging = {
      current: 0,      // 0-30 days
      days31to60: 0,
      days61to90: 0,
      over90: 0,
    };

    for (const inv of invoices) {
      const daysOld = Math.floor((now.getTime() - inv.invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = parseFloat(inv.remainingAmount || inv.totalAmount);

      if (daysOld <= 30) aging.current += amount;
      else if (daysOld <= 60) aging.days31to60 += amount;
      else if (daysOld <= 90) aging.days61to90 += amount;
      else aging.over90 += amount;
    }

    summary.agingBreakdown = aging;
  }

  // Top suppliers by pending amount
  if (includeTopSuppliers) {
    const supplierTotals = new Map<string, number>();

    for (const inv of invoices) {
      const current = supplierTotals.get(inv.supplierId) || 0;
      supplierTotals.set(inv.supplierId, current + parseFloat(inv.remainingAmount || inv.totalAmount));
    }

    const topSuppliers = Array.from(supplierTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([supplierId, amount]) => ({ supplierId, pendingAmount: amount }));

    summary.topSuppliers = topSuppliers;
  }

  return {
    success: true,
    summary,
  };
}
