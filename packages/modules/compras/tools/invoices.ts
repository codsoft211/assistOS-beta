/**
 * ComprasModule - Invoices AI Tools (CRITICAL!)
 * 4 tools for invoice processing, OCR extraction, 3-way matching, and approval
 */

import { db } from "../../../../apps/api/db";
import { 
  purchasingInvoices, 
  purchasingInvoiceLines,
  purchaseOrders,
  purchaseOrderLines,
  receipts,
  receiptLines,
} from "../../../../shared/schema";
import { eq, and, desc, or, ilike, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import path from "path";
import { extractInvoiceData } from "../services/invoice-ocr.service";

export const invoiceTools = [
  {
    type: "function" as const,
    function: {
      name: "list_invoices",
      description: "Lista invoices de fornecedores do tenant. Permite filtrar por status, supplier, período, 3-way match status. Retorna invoices completas com linhas.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "pending_approval", "approved", "rejected", "paid", "partially_paid"],
            description: "Filtrar por status",
          },
          supplierId: {
            type: "string",
            description: "ID do fornecedor",
          },
          threeWayMatchStatus: {
            type: "string",
            enum: ["pending", "matched", "discrepancy", "override"],
            description: "Status do 3-way match",
          },
          search: {
            type: "string",
            description: "Buscar por código ou número de invoice",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "process_invoice_ocr",
      description: "Processa invoice PDF/imagem com OCR para extrair dados automaticamente. Extrai invoice number, date, total, line items. Retorna dados extraídos + confidence scores.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: {
            type: "string",
            description: "ID da invoice a processar (obrigatório)",
          },
          attachmentUrl: {
            type: "string",
            description: "URL do PDF/imagem da invoice (obrigatório)",
          },
          ocrEngine: {
            type: "string",
            enum: ["google_vision", "aws_textract", "tesseract"],
            description: "OCR engine a usar (default: google_vision)",
          },
        },
        required: ["invoiceId", "attachmentUrl"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "three_way_match_validation",
      description: "Executa validação 3-way match entre Invoice, PO e Receipt. Compara quantidades, preços, totais. Identifica discrepâncias e calcula match confidence. Retorna relatório detalhado.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: {
            type: "string",
            description: "ID da invoice a validar (obrigatório)",
          },
          tolerancePercent: {
            type: "number",
            description: "% de tolerância para discrepâncias de preço (default: 5)",
          },
        },
        required: ["invoiceId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "approve_invoice",
      description: "Aprova (ou rejeita) uma invoice. Valida 3-way match, registra aprovador, atualiza status. Permite override de discrepâncias com justificativa.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: {
            type: "string",
            description: "ID da invoice (obrigatório)",
          },
          action: {
            type: "string",
            enum: ["approve", "reject", "approve_with_override"],
            description: "Ação a executar (obrigatório)",
          },
          overrideReason: {
            type: "string",
            description: "Razão do override (obrigatório para approve_with_override)",
          },
          rejectionReason: {
            type: "string",
            description: "Razão da rejeição (obrigatório para reject)",
          },
        },
        required: ["invoiceId", "action"],
      },
    },
  },
];

/**
 * Execute an invoice tool based on tool call from AI
 */
export async function executeInvoiceTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Invoice Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "list_invoices":
      return await handleListInvoices(args, context);
      
    case "process_invoice_ocr":
      return await handleProcessInvoiceOcr(args, context);
      
    case "three_way_match_validation":
      return await handleThreeWayMatchValidation(args, context);
      
    case "approve_invoice":
      return await handleApproveInvoice(args, context);
      
    default:
      throw new Error(`Unknown invoice tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleListInvoices(
  args: {
    status?: string;
    supplierId?: string;
    threeWayMatchStatus?: string;
    search?: string;
    limit?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { status, supplierId, threeWayMatchStatus, search, limit = 20 } = args;

  const whereConditions: any[] = [eq(purchasingInvoices.tenantId, tenantId)];

  if (status) {
    whereConditions.push(eq(purchasingInvoices.status, status as any));
  }

  if (supplierId) {
    whereConditions.push(eq(purchasingInvoices.supplierId, supplierId));
  }

  if (threeWayMatchStatus) {
    whereConditions.push(eq(purchasingInvoices.threeWayMatchStatus, threeWayMatchStatus as any));
  }

  if (search) {
    whereConditions.push(
      or(
        ilike(purchasingInvoices.code, `%${search}%`),
        ilike(purchasingInvoices.invoiceNumber, `%${search}%`)
      )!
    );
  }

  const invoices = await db
    .select()
    .from(purchasingInvoices)
    .where(and(...whereConditions))
    .orderBy(desc(purchasingInvoices.invoiceDate))
    .limit(limit);

  // Get lines
  const invoiceIds = invoices.map(inv => inv.id);
  const lines = invoiceIds.length > 0
    ? await db
        .select()
        .from(purchasingInvoiceLines)
        .where(and(
          eq(purchasingInvoiceLines.tenantId, tenantId),
          inArray(purchasingInvoiceLines.invoiceId, invoiceIds)
        ))
    : [];

  const invoicesWithLines = invoices.map(inv => ({
    ...inv,
    lines: lines.filter(l => l.invoiceId === inv.id),
  }));

  return {
    success: true,
    count: invoices.length,
    invoices: invoicesWithLines,
  };
}

async function handleProcessInvoiceOcr(
  args: {
    invoiceId: string;
    attachmentUrl: string;
    ocrEngine?: string;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { invoiceId, attachmentUrl } = args;

  // Verify invoice
  const invoice = await db
    .select()
    .from(purchasingInvoices)
    .where(and(
      eq(purchasingInvoices.id, invoiceId),
      eq(purchasingInvoices.tenantId, tenantId)
    ))
    .limit(1);

  if (invoice.length === 0) {
    return {
      success: false,
      error: "Invoice não encontrada",
    };
  }

  // Extract invoice data using OCR service
  try {
    // Convert URL to file path (assuming attachmentUrl is like "uploads/invoices/file.pdf")
    const filePath = path.join(process.cwd(), attachmentUrl);
    
    const ocrResult = await extractInvoiceData({
      filePath,
      tenantId,
      userId: context.userId,
      environment: context.environment
    });

    if (!ocrResult.success) {
      return {
        success: false,
        error: ocrResult.error || 'OCR extraction failed'
      };
    }

    // Update invoice with OCR data
    await db
      .update(purchasingInvoices)
      .set({
        ocrExtracted: true,
        ocrData: JSON.stringify(ocrResult.data),
        ocrConfidence: ocrResult.data!.confidence.toString(),
        invoiceNumber: invoice[0].invoiceNumber || ocrResult.data!.invoiceNumber,
        totalAmount: invoice[0].totalAmount || ocrResult.data!.totalAmount.toString(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(purchasingInvoices.id, invoiceId),
        eq(purchasingInvoices.tenantId, tenantId)
      ));

    return {
      success: true,
      message: `OCR processado com ${(ocrResult.data!.confidence * 100).toFixed(0)}% de confiança`,
      ocrData: ocrResult.data,
      engine: ocrResult.data!.extractionMethod,
    };

  } catch (error: any) {
    console.error('[OCR] Error processing invoice:', error);
    return {
      success: false,
      error: `OCR extraction failed: ${error.message}`
    };
  }
}

async function handleThreeWayMatchValidation(
  args: {
    invoiceId: string;
    tolerancePercent?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { invoiceId, tolerancePercent = 5 } = args;

  // Get invoice
  const invoice = await db
    .select()
    .from(purchasingInvoices)
    .where(and(
      eq(purchasingInvoices.id, invoiceId),
      eq(purchasingInvoices.tenantId, tenantId)
    ))
    .limit(1);

  if (invoice.length === 0) {
    return {
      success: false,
      error: "Invoice não encontrada",
    };
  }

  if (!invoice[0].poId) {
    return {
      success: false,
      error: "Invoice não está vinculada a um PO (3-way match impossível)",
    };
  }

  // Get PO
  const po = await db
    .select()
    .from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.id, invoice[0].poId),
      eq(purchaseOrders.tenantId, tenantId)
    ))
    .limit(1);

  if (po.length === 0) {
    return {
      success: false,
      error: "PO relacionado não encontrado",
    };
  }

  // Get Receipt (if exists)
  const receipt = invoice[0].receiptId
    ? await db
        .select()
        .from(receipts)
        .where(and(
          eq(receipts.id, invoice[0].receiptId),
          eq(receipts.tenantId, tenantId)
        ))
        .limit(1)
    : [];

  // Get invoice lines
  const invoiceLines = await db
    .select()
    .from(purchasingInvoiceLines)
    .where(and(
      eq(purchasingInvoiceLines.invoiceId, invoiceId),
      eq(purchasingInvoiceLines.tenantId, tenantId)
    ));

  // Get PO lines
  const poLines = await db
    .select()
    .from(purchaseOrderLines)
    .where(and(
      eq(purchaseOrderLines.poId, invoice[0].poId),
      eq(purchaseOrderLines.tenantId, tenantId)
    ));

  // 3-Way Match Validation
  const discrepancies = [];
  const invoiceTotal = parseFloat(invoice[0].totalAmount || '0');
  const poTotal = parseFloat(po[0].totalAmount || '0');
  const toleranceAmount = poTotal * (tolerancePercent / 100);

  // 1. PO vs Invoice Total
  const totalDiscrepancy = Math.abs(invoiceTotal - poTotal);
  if (totalDiscrepancy > toleranceAmount) {
    discrepancies.push({
      type: 'total_amount',
      severity: 'high',
      poAmount: poTotal,
      invoiceAmount: invoiceTotal,
      difference: totalDiscrepancy,
      toleranceExceeded: true,
    });
  }

  // 2. Line-level validation
  for (const invLine of invoiceLines) {
    if (!invLine.poLineId) continue;

    const poLine = poLines.find(pl => pl.id === invLine.poLineId);
    if (!poLine) {
      discrepancies.push({
        type: 'missing_po_line',
        severity: 'critical',
        invoiceLineId: invLine.id,
      });
      continue;
    }

    // Quantity check
    const invQty = parseFloat(invLine.quantity);
    const poQty = parseFloat(poLine.quantity);
    if (invQty > poQty) {
      discrepancies.push({
        type: 'quantity_over',
        severity: 'medium',
        lineId: invLine.id,
        invoiceQty: invQty,
        poQty: poQty,
        difference: invQty - poQty,
      });
    }

    // Price check
    const invPrice = parseFloat(invLine.unitPrice);
    const poPrice = parseFloat(poLine.unitPrice || '0');
    const priceDiff = Math.abs(invPrice - poPrice);
    const priceDiscrepancy = poPrice > 0 ? (priceDiff / poPrice) * 100 : 0;

    if (priceDiscrepancy > tolerancePercent) {
      discrepancies.push({
        type: 'price_discrepancy',
        severity: 'high',
        lineId: invLine.id,
        invoicePrice: invPrice,
        poPrice,
        percentDifference: priceDiscrepancy.toFixed(2),
      });
    }
  }

  // 3. Receipt validation (if exists)
  if (receipt.length > 0) {
    const receiptQty = parseFloat(receipt[0].acceptedQuantity || '0');
    const invoiceQty = invoiceLines.reduce((sum, line) => 
      sum + parseFloat(line.quantity), 0
    );

    if (invoiceQty > receiptQty) {
      discrepancies.push({
        type: 'quantity_not_received',
        severity: 'critical',
        invoiceQty,
        receiptQty,
        difference: invoiceQty - receiptQty,
      });
    }
  }

  // Determine match status
  const hasCritical = discrepancies.some(d => d.severity === 'critical');
  const hasHigh = discrepancies.some(d => d.severity === 'high');
  const matchStatus = discrepancies.length === 0 ? 'matched' :
                     (hasCritical || hasHigh) ? 'discrepancy' : 'matched';

  // Update invoice (WITH TENANT ISOLATION)
  await db
    .update(purchasingInvoices)
    .set({
      threeWayMatchStatus: matchStatus as any,
      poDiscrepancy: totalDiscrepancy > toleranceAmount,
      poDiscrepancyAmount: totalDiscrepancy.toString(),
      receiptDiscrepancy: discrepancies.some(d => d.type === 'quantity_not_received'),
      priceDiscrepancy: discrepancies.some(d => d.type === 'price_discrepancy'),
    })
    .where(and(
      eq(purchasingInvoices.id, invoiceId),
      eq(purchasingInvoices.tenantId, tenantId)
    ));

  return {
    success: true,
    matchStatus,
    discrepanciesCount: discrepancies.length,
    discrepancies,
    summary: {
      invoiceTotal,
      poTotal,
      receiptTotal: receipt.length > 0 ? parseFloat(receipt[0].acceptedQuantity || '0') : null,
      tolerancePercent,
      passed: matchStatus === 'matched',
    },
  };
}

async function handleApproveInvoice(
  args: {
    invoiceId: string;
    action: 'approve' | 'reject' | 'approve_with_override';
    overrideReason?: string;
    rejectionReason?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { invoiceId, action, overrideReason, rejectionReason } = args;

  // Verify invoice
  const invoice = await db
    .select()
    .from(purchasingInvoices)
    .where(and(
      eq(purchasingInvoices.id, invoiceId),
      eq(purchasingInvoices.tenantId, tenantId)
    ))
    .limit(1);

  if (invoice.length === 0) {
    return {
      success: false,
      error: "Invoice não encontrada",
    };
  }

  if (invoice[0].status === 'approved' || invoice[0].status === 'rejected') {
    return {
      success: false,
      error: `Invoice já está ${invoice[0].status}`,
    };
  }

  let newStatus: string;
  let message: string;
  const updates: any = {
    approvedBy: userId || nanoid(),
    approvalDate: new Date(),
    updatedAt: new Date(),
  };

  switch (action) {
    case 'approve':
      if (invoice[0].threeWayMatchStatus === 'discrepancy') {
        return {
          success: false,
          error: "Invoice tem discrepâncias no 3-way match. Use 'approve_with_override' com justificativa.",
        };
      }
      newStatus = 'approved';
      message = 'Invoice aprovada';
      break;

    case 'approve_with_override':
      if (!overrideReason) {
        return {
          success: false,
          error: "overrideReason é obrigatório para approve_with_override",
        };
      }
      newStatus = 'approved';
      message = `Invoice aprovada com override`;
      updates.threeWayMatchStatus = 'override';
      updates.overrideReason = overrideReason;
      updates.overrideApprovedBy = userId || nanoid();
      updates.overrideApprovedAt = new Date();
      break;

    case 'reject':
      if (!rejectionReason) {
        return {
          success: false,
          error: "rejectionReason é obrigatório para reject",
        };
      }
      newStatus = 'rejected';
      message = 'Invoice rejeitada';
      updates.rejectionReason = rejectionReason;
      break;

    default:
      return {
        success: false,
        error: "Ação inválida",
      };
  }

  updates.status = newStatus;

  const updated = await db
    .update(purchasingInvoices)
    .set(updates)
    .where(and(
      eq(purchasingInvoices.id, invoiceId),
      eq(purchasingInvoices.tenantId, tenantId)
    ))
    .returning();

  return {
    success: true,
    message,
    invoice: updated[0],
    overrideApplied: action === 'approve_with_override',
  };
}
