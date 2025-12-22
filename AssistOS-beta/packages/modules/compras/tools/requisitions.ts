/**
 * ComprasModule - Requisitions AI Tools
 * 3 tools for purchase requisition management and approval workflow
 */

import { db } from "../../../../apps/api/db";
import { purchaseRequisitions, purchaseRequisitionLines, products } from "../../../../shared/schema";
import { eq, and, desc, or, ilike, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export const requisitionTools = [
  {
    type: "function" as const,
    function: {
      name: "list_requisitions",
      description: "Lista requisições de compra do tenant. Permite filtrar por status, prioridade, período. Retorna dados completos incluindo linhas.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "pending_approval", "approved", "rejected", "partially_approved", "converted_to_po"],
            description: "Filtrar por status",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Filtrar por prioridade",
          },
          requestedBy: {
            type: "string",
            description: "ID do usuário que criou (filtro opcional)",
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
      name: "create_requisition",
      description: "Cria uma nova requisição de compra com múltiplos itens. Valida produtos, calcula totais estimados, define prioridade. Retorna requisição criada com linhas.",
      parameters: {
        type: "object",
        properties: {
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
                  description: "Quantidade a requisitar",
                },
                notes: {
                  type: "string",
                  description: "Notas específicas do item",
                },
              },
              required: ["productId", "quantity"],
            },
            description: "Lista de itens da requisição (obrigatório)",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Prioridade da requisição (default: normal)",
          },
          departmentId: {
            type: "string",
            description: "ID do departamento solicitante",
          },
          projectId: {
            type: "string",
            description: "ID do projeto relacionado (opcional)",
          },
          notes: {
            type: "string",
            description: "Notas gerais da requisição",
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "approve_requisition",
      description: "Aprova (ou rejeita) uma requisição de compra. Atualiza status, registra aprovador, timestamp. Permite aprovação parcial de linhas específicas.",
      parameters: {
        type: "object",
        properties: {
          requisitionId: {
            type: "string",
            description: "ID da requisição a aprovar/rejeitar (obrigatório)",
          },
          action: {
            type: "string",
            enum: ["approve", "reject", "approve_partial"],
            description: "Ação a executar (obrigatório)",
          },
          approvedLineIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs das linhas aprovadas (apenas para approve_partial)",
          },
          comments: {
            type: "string",
            description: "Comentários da aprovação/rejeição",
          },
        },
        required: ["requisitionId", "action"],
      },
    },
  },
];

/**
 * Execute a requisition tool based on tool call from AI
 */
export async function executeRequisitionTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Requisitions Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "list_requisitions":
      return await handleListRequisitions(args, context);
      
    case "create_requisition":
      return await handleCreateRequisition(args, context);
      
    case "approve_requisition":
      return await handleApproveRequisition(args, context);
      
    default:
      throw new Error(`Unknown requisition tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleListRequisitions(
  args: {
    status?: string;
    priority?: string;
    requestedBy?: string;
    search?: string;
    limit?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { status, priority, requestedBy, search, limit = 20 } = args;

  const whereConditions: any[] = [eq(purchaseRequisitions.tenantId, tenantId)];

  if (status) {
    whereConditions.push(eq(purchaseRequisitions.status, status as any));
  }

  if (priority) {
    whereConditions.push(eq(purchaseRequisitions.priority, priority as any));
  }

  if (requestedBy) {
    whereConditions.push(eq(purchaseRequisitions.requestedBy, requestedBy));
  }

  if (search) {
    whereConditions.push(
      or(
        ilike(purchaseRequisitions.code, `%${search}%`),
        ilike(purchaseRequisitions.notes, `%${search}%`)
      )!
    );
  }

  const requisitions = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(...whereConditions))
    .orderBy(desc(purchaseRequisitions.requestDate))
    .limit(limit);

  // Get lines for each requisition
  const requisitionIds = requisitions.map(r => r.id);
  const lines = requisitionIds.length > 0
    ? await db
        .select()
        .from(purchaseRequisitionLines)
        .where(and(
          eq(purchaseRequisitionLines.tenantId, tenantId),
          inArray(purchaseRequisitionLines.requisitionId, requisitionIds)
        ))
    : [];

  const requisitionsWithLines = requisitions.map(req => ({
    ...req,
    lines: lines.filter(l => l.requisitionId === req.id),
  }));

  return {
    success: true,
    count: requisitions.length,
    requisitions: requisitionsWithLines,
  };
}

async function handleCreateRequisition(
  args: {
    items: Array<{
      productId: string;
      quantity: number;
      notes?: string;
    }>;
    priority?: string;
    departmentId?: string;
    projectId?: string;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { items, priority = 'normal', departmentId, projectId, notes } = args;

  // Validate products exist in tenant
  const productIds = items.map(i => i.productId);
  const productsData = await db
    .select()
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      inArray(products.id, productIds)
    ));

  if (productsData.length !== items.length) {
    return {
      success: false,
      error: `Alguns produtos não foram encontrados. Esperados: ${items.length}, Encontrados: ${productsData.length}`,
    };
  }

  const productMap = new Map(productsData.map(p => [p.id, p]));

  // Create requisition
  const requisitionCode = `REQ-${Date.now()}`;
  const requisition = await db.insert(purchaseRequisitions).values({
    id: nanoid(),
    tenantId,
    code: requisitionCode,
    requestDate: new Date(),
    requestedBy: userId || nanoid(),
    departmentId,
    projectId,
    priority: priority as any,
    status: 'draft',
    notes: notes || `Requisição de ${items.length} itens`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create lines
  const lines = [];
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    const estimatedPrice = parseFloat(product.price || '0');
    const estimatedTotal = estimatedPrice * item.quantity;

    const line = await db.insert(purchaseRequisitionLines).values({
      id: nanoid(),
      tenantId,
      requisitionId: requisition[0].id,
      productId: item.productId,
      quantity: item.quantity.toString(),
      uom: product.uom || 'UN',
      estimatedPrice: estimatedPrice.toString(),
      estimatedTotal: estimatedTotal.toString(),
      notes: item.notes,
    }).returning();

    lines.push(line[0]);
  }

  return {
    success: true,
    message: `Requisição ${requisitionCode} criada com ${lines.length} itens`,
    requisition: {
      ...requisition[0],
      lines,
    },
  };
}

async function handleApproveRequisition(
  args: {
    requisitionId: string;
    action: 'approve' | 'reject' | 'approve_partial';
    approvedLineIds?: string[];
    comments?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { requisitionId, action, approvedLineIds, comments } = args;

  // Verify requisition belongs to tenant
  const requisition = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(
      eq(purchaseRequisitions.id, requisitionId),
      eq(purchaseRequisitions.tenantId, tenantId)
    ))
    .limit(1);

  if (requisition.length === 0) {
    return {
      success: false,
      error: "Requisição não encontrada",
    };
  }

  if (requisition[0].status === 'approved' || requisition[0].status === 'rejected') {
    return {
      success: false,
      error: `Requisição já está ${requisition[0].status}`,
    };
  }

  let newStatus: string;
  let message: string;

  switch (action) {
    case 'approve':
      newStatus = 'approved';
      message = 'Requisição aprovada com sucesso';
      break;
    case 'reject':
      newStatus = 'rejected';
      message = 'Requisição rejeitada';
      break;
    case 'approve_partial':
      if (!approvedLineIds || approvedLineIds.length === 0) {
        return {
          success: false,
          error: "Para aprovação parcial, forneça approvedLineIds",
        };
      }
      newStatus = 'partially_approved';
      message = `Requisição parcialmente aprovada (${approvedLineIds.length} linhas)`;
      break;
    default:
      return {
        success: false,
        error: "Ação inválida",
      };
  }

  const updated = await db
    .update(purchaseRequisitions)
    .set({
      status: newStatus as any,
      approvedBy: userId || nanoid(),
      approvalDate: new Date(),
      notes: comments 
        ? `${requisition[0].notes || ''}\n\nApproval: ${comments}`
        : requisition[0].notes,
      updatedAt: new Date(),
    })
    .where(and(
      eq(purchaseRequisitions.id, requisitionId),
      eq(purchaseRequisitions.tenantId, tenantId)
    ))
    .returning();

  return {
    success: true,
    message,
    requisition: updated[0],
    approvedLineIds: action === 'approve_partial' ? approvedLineIds : null,
  };
}
