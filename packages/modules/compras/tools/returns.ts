/**
 * ComprasModule - Returns AI Tools
 * 2 tools for supplier return management
 */

import { db } from "../../../../apps/api/db";
import { 
  supplierReturns, 
  supplierReturnLines,
  purchaseOrders,
  receipts,
  receiptLines,
} from "../../../../shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export const returnTools = [
  {
    type: "function" as const,
    function: {
      name: "create_return",
      description: "Cria devolução de mercadorias ao fornecedor (RMA - Return Merchandise Authorization). Registra itens defeituosos/incorretos, motivo, tracking. Retorna return criado.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "ID do fornecedor (obrigatório)",
          },
          receiptId: {
            type: "string",
            description: "ID do receipt original (opcional)",
          },
          poId: {
            type: "string",
            description: "ID do PO original (opcional)",
          },
          returnReason: {
            type: "string",
            enum: ["defective", "wrong_item", "excess_quantity", "damaged", "expired", "other"],
            description: "Motivo da devolução (obrigatório)",
          },
          returnReasonDetails: {
            type: "string",
            description: "Detalhes do motivo",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                receiptLineId: {
                  type: "string",
                  description: "ID da linha do receipt (se aplicável)",
                },
                productId: {
                  type: "string",
                  description: "ID do produto",
                },
                quantity: {
                  type: "number",
                  description: "Quantidade a devolver",
                },
                returnReason: {
                  type: "string",
                  description: "Motivo específico do item",
                },
                batchNumber: {
                  type: "string",
                  description: "Número de lote (se aplicável)",
                },
              },
              required: ["productId", "quantity"],
            },
            description: "Itens a devolver (obrigatório)",
          },
          notes: {
            type: "string",
            description: "Notas da devolução",
          },
        },
        required: ["supplierId", "returnReason", "items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "process_return",
      description: "Processa uma devolução: atualiza status, registra aprovação do fornecedor, tracking de envio, credit note. Retorna return atualizado.",
      parameters: {
        type: "object",
        properties: {
          returnId: {
            type: "string",
            description: "ID do return (obrigatório)",
          },
          action: {
            type: "string",
            enum: ["approve_by_supplier", "ship_back", "mark_received_by_supplier", "issue_credit_note", "complete"],
            description: "Ação a executar (obrigatório)",
          },
          trackingNumber: {
            type: "string",
            description: "Número de rastreio (para ship_back)",
          },
          shippingMethod: {
            type: "string",
            description: "Método de envio (para ship_back)",
          },
          creditNoteNumber: {
            type: "string",
            description: "Número da credit note (para issue_credit_note)",
          },
          creditNoteAmount: {
            type: "number",
            description: "Valor da credit note (para issue_credit_note)",
          },
        },
        required: ["returnId", "action"],
      },
    },
  },
];

/**
 * Execute a return tool based on tool call from AI
 */
export async function executeReturnTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Return Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "create_return":
      return await handleCreateReturn(args, context);
      
    case "process_return":
      return await handleProcessReturn(args, context);
      
    default:
      throw new Error(`Unknown return tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCreateReturn(
  args: {
    supplierId: string;
    receiptId?: string;
    poId?: string;
    returnReason: string;
    returnReasonDetails?: string;
    items: Array<{
      receiptLineId?: string;
      productId: string;
      quantity: number;
      returnReason?: string;
      batchNumber?: string;
    }>;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { 
    supplierId, 
    receiptId, 
    poId, 
    returnReason, 
    returnReasonDetails, 
    items, 
    notes 
  } = args;

  // Calculate total return value (simplified - would need prices)
  const totalReturnValue = items.reduce((sum, item) => sum + (item.quantity * 100), 0); // Placeholder

  // Create return
  const returnCode = `RET-${Date.now()}`;
  const returnData = await db.insert(supplierReturns).values({
    id: nanoid(),
    tenantId,
    code: returnCode,
    returnDate: new Date(),
    supplierId,
    poId,
    receiptId,
    returnReason: returnReason as any,
    returnReasonDetails,
    totalReturnValue: totalReturnValue.toString(),
    currency: 'EUR',
    status: 'draft',
    notes,
    createdBy: userId || nanoid(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create return lines
  const returnLines = [];
  for (const item of items) {
    const line = await db.insert(supplierReturnLines).values({
      id: nanoid(),
      tenantId,
      returnId: returnData[0].id,
      receiptLineId: item.receiptLineId,
      productId: item.productId,
      quantity: item.quantity.toString(),
      returnReason: item.returnReason,
      batchNumber: item.batchNumber,
    }).returning();

    returnLines.push(line[0]);
  }

  return {
    success: true,
    message: `Return ${returnCode} criado com ${returnLines.length} itens`,
    return: {
      ...returnData[0],
      lines: returnLines,
    },
  };
}

async function handleProcessReturn(
  args: {
    returnId: string;
    action: string;
    trackingNumber?: string;
    shippingMethod?: string;
    creditNoteNumber?: string;
    creditNoteAmount?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { 
    returnId, 
    action, 
    trackingNumber, 
    shippingMethod, 
    creditNoteNumber, 
    creditNoteAmount 
  } = args;

  // Get return
  const returnData = await db
    .select()
    .from(supplierReturns)
    .where(and(
      eq(supplierReturns.id, returnId),
      eq(supplierReturns.tenantId, tenantId)
    ))
    .limit(1);

  if (returnData.length === 0) {
    return {
      success: false,
      error: "Return não encontrado",
    };
  }

  let newStatus: string | null = null;
  let updates: any = {
    updatedAt: new Date(),
  };
  let message: string;

  switch (action) {
    case 'approve_by_supplier':
      if (returnData[0].status !== 'draft') {
        return {
          success: false,
          error: "Return não está em draft",
        };
      }
      newStatus = 'approved_by_supplier';
      updates.supplierApprovedAt = new Date();
      message = 'Return aprovado pelo fornecedor';
      break;

    case 'ship_back':
      if (!trackingNumber || !shippingMethod) {
        return {
          success: false,
          error: "trackingNumber e shippingMethod são obrigatórios para ship_back",
        };
      }
      newStatus = 'shipped_back';
      updates.trackingNumber = trackingNumber;
      updates.shippingMethod = shippingMethod;
      updates.shippedAt = new Date();
      message = `Return enviado - Tracking: ${trackingNumber}`;
      break;

    case 'mark_received_by_supplier':
      newStatus = 'received_by_supplier';
      updates.receivedBySupplierAt = new Date();
      message = 'Return recebido pelo fornecedor';
      break;

    case 'issue_credit_note':
      if (!creditNoteNumber || !creditNoteAmount) {
        return {
          success: false,
          error: "creditNoteNumber e creditNoteAmount são obrigatórios",
        };
      }
      newStatus = 'credit_issued';
      updates.creditNoteNumber = creditNoteNumber;
      updates.creditNoteDate = new Date();
      updates.creditNoteAmount = creditNoteAmount.toString();
      message = `Credit note ${creditNoteNumber} emitida - €${creditNoteAmount.toFixed(2)}`;
      break;

    case 'complete':
      newStatus = 'completed';
      message = 'Return completado';
      break;

    default:
      return {
        success: false,
        error: "Ação inválida",
      };
  }

  if (newStatus) {
    updates.status = newStatus;
  }

  const updated = await db
    .update(supplierReturns)
    .set(updates)
    .where(and(
      eq(supplierReturns.id, returnId),
      eq(supplierReturns.tenantId, tenantId)
    ))
    .returning();

  return {
    success: true,
    message,
    return: updated[0],
  };
}
