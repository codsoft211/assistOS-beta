/**
 * ComprasModule - Receipts AI Tools
 * 2 tools for goods receipt and PO validation
 */

import { db } from "../../../../apps/api/db";
import { receipts, receiptLines, purchaseOrders, purchaseOrderLines, products } from "../../../../shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export const receiptTools = [
  {
    type: "function" as const,
    function: {
      name: "create_receipt",
      description: "Cria recebimento de mercadorias (GRN - Goods Receipt Note) para um PO. Valida quantidades, registra discrepâncias, atualiza status do PO. Retorna receipt criado.",
      parameters: {
        type: "object",
        properties: {
          poId: {
            type: "string",
            description: "ID do Purchase Order (obrigatório)",
          },
          receivedBy: {
            type: "string",
            description: "ID do usuário que recebeu",
          },
          warehouseId: {
            type: "string",
            description: "ID do armazém de destino (opcional)",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                poLineId: {
                  type: "string",
                  description: "ID da linha do PO",
                },
                receivedQuantity: {
                  type: "number",
                  description: "Quantidade recebida",
                },
                acceptedQuantity: {
                  type: "number",
                  description: "Quantidade aceita (pode ser < recebida se houver rejeição)",
                },
                discrepancyReason: {
                  type: "string",
                  description: "Motivo de discrepância (se houver)",
                },
                batchNumber: {
                  type: "string",
                  description: "Número de lote/batch (opcional)",
                },
              },
              required: ["poLineId", "receivedQuantity", "acceptedQuantity"],
            },
            description: "Itens recebidos (obrigatório)",
          },
          notes: {
            type: "string",
            description: "Notas do recebimento",
          },
        },
        required: ["poId", "items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "validate_receipt_vs_po",
      description: "Valida um receipt contra o PO original. Compara quantidades, identifica discrepâncias, sugere ações (aceitar, retornar, escalar). Retorna relatório de validação.",
      parameters: {
        type: "object",
        properties: {
          receiptId: {
            type: "string",
            description: "ID do receipt a validar (obrigatório)",
          },
          strictMode: {
            type: "boolean",
            description: "Modo estrito (falha em qualquer discrepância) (default: false)",
          },
        },
        required: ["receiptId"],
      },
    },
  },
];

/**
 * Execute a receipt tool based on tool call from AI
 */
export async function executeReceiptTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Receipt Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "create_receipt":
      return await handleCreateReceipt(args, context);
      
    case "validate_receipt_vs_po":
      return await handleValidateReceiptVsPo(args, context);
      
    default:
      throw new Error(`Unknown receipt tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCreateReceipt(
  args: {
    poId: string;
    receivedBy?: string;
    warehouseId?: string;
    items: Array<{
      poLineId: string;
      receivedQuantity: number;
      acceptedQuantity: number;
      discrepancyReason?: string;
      batchNumber?: string;
    }>;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { poId, receivedBy, warehouseId, items, notes } = args;

  // Validate PO
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

  // Get PO lines
  const poLineIds = items.map(i => i.poLineId);
  const poLines = await db
    .select()
    .from(purchaseOrderLines)
    .where(and(
      eq(purchaseOrderLines.tenantId, tenantId),
      inArray(purchaseOrderLines.id, poLineIds)
    ));

  if (poLines.length !== items.length) {
    return {
      success: false,
      error: "Algumas linhas do PO não foram encontradas",
    };
  }

  // Create receipt
  const receiptCode = `REC-${Date.now()}`;
  const totalReceived = items.reduce((sum, item) => sum + item.receivedQuantity, 0);
  const totalAccepted = items.reduce((sum, item) => sum + item.acceptedQuantity, 0);

  const receipt = await db.insert(receipts).values({
    id: nanoid(),
    tenantId,
    code: receiptCode,
    receiptDate: new Date(),
    poId,
    warehouseId,
    receivedBy: receivedBy || userId || nanoid(),
    receivedQuantity: totalReceived.toString(),
    acceptedQuantity: totalAccepted.toString(),
    status: totalAccepted === totalReceived ? 'completed' : 'partially_accepted',
    discrepancyReported: totalAccepted !== totalReceived,
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create receipt lines
  const receiptLinesList = [];
  for (const item of items) {
    const poLine = poLines.find(pl => pl.id === item.poLineId);
    if (!poLine) continue;

    const rejectedQuantity = item.receivedQuantity - item.acceptedQuantity;

    const line = await db.insert(receiptLines).values({
      id: nanoid(),
      tenantId,
      receiptId: receipt[0].id,
      poLineId: item.poLineId,
      productId: poLine.productId,
      orderedQuantity: poLine.quantity,
      receivedQuantity: item.receivedQuantity.toString(),
      acceptedQuantity: item.acceptedQuantity.toString(),
      rejectedQuantity: rejectedQuantity.toString(),
      uom: poLine.uom,
      discrepancyReason: item.discrepancyReason,
      batchNumber: item.batchNumber,
    }).returning();

    receiptLinesList.push(line[0]);

    // Update PO line received quantity (WITH TENANT ISOLATION)
    const newReceivedQty = parseFloat(poLine.receivedQuantity || '0') + item.acceptedQuantity;
    const ordered = parseFloat(poLine.quantity);
    const remaining = Math.max(0, ordered - newReceivedQty);

    await db
      .update(purchaseOrderLines)
      .set({
        receivedQuantity: newReceivedQty.toString(),
        remainingQuantity: remaining.toString(),
      })
      .where(and(
        eq(purchaseOrderLines.id, item.poLineId),
        eq(purchaseOrderLines.tenantId, tenantId)
      ));
  }

  // Update PO status
  const allLines = await db
    .select()
    .from(purchaseOrderLines)
    .where(and(
      eq(purchaseOrderLines.poId, poId),
      eq(purchaseOrderLines.tenantId, tenantId)
    ));

  const allFullyReceived = allLines.every(line => 
    parseFloat(line.remainingQuantity || '0') === 0
  );

  const newPoStatus = allFullyReceived ? 'fully_received' : 'partially_received';

  await db
    .update(purchaseOrders)
    .set({
      status: newPoStatus as any,
      updatedAt: new Date(),
    })
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenantId, tenantId)
    ));

  return {
    success: true,
    message: `Receipt ${receiptCode} criado - ${receiptLinesList.length} itens recebidos`,
    receipt: {
      ...receipt[0],
      lines: receiptLinesList,
    },
    poStatus: newPoStatus,
  };
}

async function handleValidateReceiptVsPo(
  args: {
    receiptId: string;
    strictMode?: boolean;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { receiptId, strictMode = false } = args;

  // Get receipt
  const receipt = await db
    .select()
    .from(receipts)
    .where(and(
      eq(receipts.id, receiptId),
      eq(receipts.tenantId, tenantId)
    ))
    .limit(1);

  if (receipt.length === 0) {
    return {
      success: false,
      error: "Receipt não encontrado",
    };
  }

  // Get receipt lines
  const receiptLinesList = await db
    .select()
    .from(receiptLines)
    .where(and(
      eq(receiptLines.receiptId, receiptId),
      eq(receiptLines.tenantId, tenantId)
    ));

  // Get PO
  const po = await db
    .select()
    .from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.id, receipt[0].poId!),
      eq(purchaseOrders.tenantId, tenantId)
    ))
    .limit(1);

  if (po.length === 0) {
    return {
      success: false,
      error: "PO relacionado não encontrado",
    };
  }

  // Get PO lines for comparison
  const poLineIds = receiptLinesList.map(rl => rl.poLineId!).filter(Boolean);
  const poLines = await db
    .select()
    .from(purchaseOrderLines)
    .where(and(
      eq(purchaseOrderLines.tenantId, tenantId),
      inArray(purchaseOrderLines.id, poLineIds)
    ));

  const poLineMap = new Map(poLines.map(pl => [pl.id, pl]));

  // Validation
  const discrepancies = [];
  const warnings = [];

  for (const receiptLine of receiptLinesList) {
    const poLine = poLineMap.get(receiptLine.poLineId!);
    if (!poLine) {
      discrepancies.push({
        lineId: receiptLine.id,
        issue: "PO line não encontrada",
        severity: "critical",
      });
      continue;
    }

    const ordered = parseFloat(poLine.quantity);
    const received = parseFloat(receiptLine.receivedQuantity);
    const accepted = parseFloat(receiptLine.acceptedQuantity);
    const rejected = parseFloat(receiptLine.rejectedQuantity || '0');

    // Quantity discrepancy
    if (received > ordered) {
      discrepancies.push({
        lineId: receiptLine.id,
        issue: `Over-received: Ordered ${ordered}, Received ${received}`,
        severity: "high",
        action: "Retornar excesso ao fornecedor",
      });
    }

    if (received < ordered) {
      warnings.push({
        lineId: receiptLine.id,
        issue: `Under-received: Ordered ${ordered}, Received ${received}`,
        severity: "medium",
        action: "Follow-up com fornecedor para saldo",
      });
    }

    // Quality issues
    if (rejected > 0) {
      discrepancies.push({
        lineId: receiptLine.id,
        issue: `Quality issue: ${rejected} units rejected`,
        reason: receiptLine.discrepancyReason || 'Não especificado',
        severity: "high",
        action: "Criar supplier return",
      });
    }
  }

  const validationPassed = discrepancies.length === 0 && (!strictMode || warnings.length === 0);

  return {
    success: true,
    validation: {
      passed: validationPassed,
      receiptCode: receipt[0].code,
      poCode: po[0].code,
      discrepanciesCount: discrepancies.length,
      warningsCount: warnings.length,
      discrepancies,
      warnings,
      overallStatus: validationPassed ? 'APPROVED' : 
                     discrepancies.length > 0 ? 'REJECTED' : 'APPROVED_WITH_WARNINGS',
    },
  };
}
