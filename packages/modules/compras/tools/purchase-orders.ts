/**
 * ComprasModule - Purchase Orders AI Tools
 * 4 tools for PO management, tracking, and lifecycle
 */

import { db } from "../../../../apps/api/db";
import { purchaseOrders, purchaseOrderLines, receipts, suppliers } from "../../../../shared/schema";
import { eq, and, desc, or, ilike, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const purchaseOrderTools = [
  {
    type: "function" as const,
    function: {
      name: "list_purchase_orders",
      description: "Lista Purchase Orders do tenant. Permite filtrar por status, supplier, período. Retorna POs com linhas e tracking info.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "pending_approval", "approved", "sent_to_supplier", "acknowledged_by_supplier", "partially_received", "fully_received", "completed", "cancelled"],
            description: "Filtrar por status",
          },
          supplierId: {
            type: "string",
            description: "ID do fornecedor",
          },
          search: {
            type: "string",
            description: "Buscar por código ou notas",
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
      name: "create_purchase_order",
      description: "Cria novo Purchase Order para um fornecedor. Valida supplier, calcula totais, define termos. Retorna PO criado.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "ID do fornecedor (obrigatório)",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: {
                  type: "string",
                  description: "ID do produto",
                },
                quantity: {
                  type: "number",
                  description: "Quantidade",
                },
                unitPrice: {
                  type: "number",
                  description: "Preço unitário",
                },
                notes: {
                  type: "string",
                  description: "Notas do item",
                },
              },
              required: ["productId", "quantity", "unitPrice"],
            },
            description: "Itens do PO (obrigatório)",
          },
          paymentTerms: {
            type: "string",
            description: "Termos de pagamento (ex: 'Net 30')",
          },
          deliveryAddress: {
            type: "string",
            description: "Endereço de entrega",
          },
          notes: {
            type: "string",
            description: "Notas gerais",
          },
        },
        required: ["supplierId", "items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "track_po_delivery",
      description: "Rastreia status de entrega de um PO. Retorna info de recebimentos, quantidade pendente, ETA estimado. Útil para follow-up.",
      parameters: {
        type: "object",
        properties: {
          poId: {
            type: "string",
            description: "ID do Purchase Order (obrigatório)",
          },
        },
        required: ["poId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancel_po",
      description: "Cancela um Purchase Order. Valida se pode ser cancelado (não recebido), atualiza status, registra motivo.",
      parameters: {
        type: "object",
        properties: {
          poId: {
            type: "string",
            description: "ID do Purchase Order (obrigatório)",
          },
          reason: {
            type: "string",
            description: "Motivo do cancelamento (obrigatório)",
          },
        },
        required: ["poId", "reason"],
      },
    },
  },
];

/**
 * Execute a purchase order tool based on tool call from AI
 */
export async function executePurchaseOrderTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Purchase Order Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "list_purchase_orders":
      return await handleListPurchaseOrders(args, context);
      
    case "create_purchase_order":
      return await handleCreatePurchaseOrder(args, context);
      
    case "track_po_delivery":
      return await handleTrackPoDelivery(args, context);
      
    case "cancel_po":
      return await handleCancelPo(args, context);
      
    default:
      throw new Error(`Unknown purchase order tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleListPurchaseOrders(
  args: {
    status?: string;
    supplierId?: string;
    search?: string;
    limit?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { status, supplierId, search, limit = 20 } = args;

  const whereConditions: any[] = [eq(purchaseOrders.tenantId, tenantId)];

  if (status) {
    whereConditions.push(eq(purchaseOrders.status, status as any));
  }

  if (supplierId) {
    whereConditions.push(eq(purchaseOrders.supplierId, supplierId));
  }

  if (search) {
    whereConditions.push(
      or(
        ilike(purchaseOrders.code, `%${search}%`),
        ilike(purchaseOrders.notes, `%${search}%`)
      )!
    );
  }

  const pos = await db
    .select()
    .from(purchaseOrders)
    .where(and(...whereConditions))
    .orderBy(desc(purchaseOrders.orderDate))
    .limit(limit);

  // Get lines
  const poIds = pos.map(po => po.id);
  const lines = poIds.length > 0
    ? await db
        .select()
        .from(purchaseOrderLines)
        .where(and(
          eq(purchaseOrderLines.tenantId, tenantId),
          inArray(purchaseOrderLines.poId, poIds)
        ))
    : [];

  const posWithLines = pos.map(po => ({
    ...po,
    lines: lines.filter(l => l.poId === po.id),
  }));

  return {
    success: true,
    count: pos.length,
    purchaseOrders: posWithLines,
  };
}

async function handleCreatePurchaseOrder(
  args: {
    supplierId: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      notes?: string;
    }>;
    paymentTerms?: string;
    deliveryAddress?: string;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { supplierId, items, paymentTerms, deliveryAddress, notes } = args;

  // Validate supplier
  const supplier = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.id, supplierId),
      eq(suppliers.tenantId, tenantId)
    ))
    .limit(1);

  if (supplier.length === 0) {
    return {
      success: false,
      error: "Fornecedor não encontrado",
    };
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const taxTotal = subtotal * 0.23; // 23% VAT
  const totalAmount = subtotal + taxTotal;

  // Create PO
  const poCode = `PO-${Date.now()}`;
  const po = await db.insert(purchaseOrders).values({
    id: nanoid(),
    tenantId,
    code: poCode,
    orderDate: new Date(),
    supplierId,
    subtotal: subtotal.toString(),
    taxTotal: taxTotal.toString(),
    totalAmount: totalAmount.toString(),
    currency: 'EUR',
    paymentTerms: paymentTerms || supplier[0].paymentTerms || 'Net 30',
    deliveryAddress,
    status: 'draft',
    notes,
    createdBy: userId || nanoid(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create lines
  const poLines = [];
  for (const item of items) {
    const lineTotal = item.quantity * item.unitPrice;

    const line = await db.insert(purchaseOrderLines).values({
      id: nanoid(),
      tenantId,
      poId: po[0].id,
      productId: item.productId,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: lineTotal.toString(),
      remainingQuantity: item.quantity.toString(),
      notes: item.notes,
    }).returning();

    poLines.push(line[0]);
  }

  return {
    success: true,
    message: `PO ${poCode} criado com ${poLines.length} itens`,
    purchaseOrder: {
      ...po[0],
      lines: poLines,
    },
  };
}

async function handleTrackPoDelivery(
  args: {
    poId: string;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { poId } = args;

  // Get PO
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
  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(and(
      eq(purchaseOrderLines.poId, poId),
      eq(purchaseOrderLines.tenantId, tenantId)
    ));

  // Get receipts
  const receiptsList = await db
    .select()
    .from(receipts)
    .where(and(
      eq(receipts.poId, poId),
      eq(receipts.tenantId, tenantId)
    ))
    .orderBy(desc(receipts.receiptDate));

  // Calculate tracking info
  const totalOrdered = lines.reduce((sum, line) => 
    sum + parseFloat(line.quantity), 0
  );

  const totalReceived = lines.reduce((sum, line) => 
    sum + parseFloat(line.receivedQuantity || '0'), 0
  );

  const percentReceived = totalOrdered > 0 
    ? ((totalReceived / totalOrdered) * 100).toFixed(2)
    : '0';

  return {
    success: true,
    tracking: {
      poCode: po[0].code,
      status: po[0].status,
      supplier: po[0].supplierId,
      orderDate: po[0].orderDate,
      expectedDeliveryDate: po[0].expectedDeliveryDate,
      totalOrdered,
      totalReceived,
      percentReceived,
      receipts: receiptsList,
      pendingLines: lines.filter(l => 
        parseFloat(l.remainingQuantity || '0') > 0
      ),
    },
  };
}

async function handleCancelPo(
  args: {
    poId: string;
    reason: string;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { poId, reason } = args;

  // Get PO
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

  if (po[0].status === 'cancelled') {
    return {
      success: false,
      error: "PO já está cancelado",
    };
  }

  if (po[0].status === 'fully_received' || po[0].status === 'completed') {
    return {
      success: false,
      error: "PO já foi recebido/completado, não pode ser cancelado",
    };
  }

  // Cancel PO (WITH TENANT ISOLATION)
  const updated = await db
    .update(purchaseOrders)
    .set({
      status: 'cancelled',
      notes: `${po[0].notes || ''}\n\nCANCELLED: ${reason}`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenantId, tenantId)
    ))
    .returning();

  return {
    success: true,
    message: `PO ${po[0].code} cancelado`,
    purchaseOrder: updated[0],
    reason,
  };
}
