/**
 * ComprasModule - Payments AI Tools
 * 3 tools for supplier payment management and invoice allocation
 */

import { db } from "../../../../apps/api/db";
import { 
  purchasingPayments, 
  purchasingPaymentAllocations,
  purchasingInvoices,
  suppliers,
} from "../../../../shared/schema";
import { eq, and, desc, or, ilike, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const paymentTools = [
  {
    type: "function" as const,
    function: {
      name: "list_pending_payments",
      description: "Lista invoices pendentes de pagamento. Retorna invoices aprovadas mas não pagas, com aging, total due, prioridade por due date. Útil para Accounts Payable workflow.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "Filtrar por fornecedor específico (opcional)",
          },
          overdueOnly: {
            type: "boolean",
            description: "Mostrar apenas invoices vencidas (default: false)",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 50)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_payment",
      description: "Cria pagamento a fornecedor. Registra método, valor, referência bancária. Retorna payment criado pronto para alocação.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "ID do fornecedor (obrigatório)",
          },
          amount: {
            type: "number",
            description: "Valor do pagamento (obrigatório)",
          },
          paymentMethod: {
            type: "string",
            enum: ["bank_transfer", "check", "credit_card", "cash", "other"],
            description: "Método de pagamento (obrigatório)",
          },
          bankAccountId: {
            type: "string",
            description: "ID da conta bancária de origem (opcional)",
          },
          referenceNumber: {
            type: "string",
            description: "Número de referência bancária (opcional)",
          },
          notes: {
            type: "string",
            description: "Notas do pagamento",
          },
        },
        required: ["supplierId", "amount", "paymentMethod"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "allocate_payment_to_invoices",
      description: "Aloca um pagamento a uma ou mais invoices. Distribui valor do payment entre invoices, atualiza saldos, marca invoices como paid. Permite partial allocation.",
      parameters: {
        type: "object",
        properties: {
          paymentId: {
            type: "string",
            description: "ID do payment (obrigatório)",
          },
          allocations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                invoiceId: {
                  type: "string",
                  description: "ID da invoice",
                },
                amount: {
                  type: "number",
                  description: "Valor a alocar para esta invoice",
                },
              },
              required: ["invoiceId", "amount"],
            },
            description: "Lista de alocações invoice-valor (obrigatório)",
          },
        },
        required: ["paymentId", "allocations"],
      },
    },
  },
];

/**
 * Execute a payment tool based on tool call from AI
 */
export async function executePaymentTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Payment Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "list_pending_payments":
      return await handleListPendingPayments(args, context);
      
    case "create_payment":
      return await handleCreatePayment(args, context);
      
    case "allocate_payment_to_invoices":
      return await handleAllocatePaymentToInvoices(args, context);
      
    default:
      throw new Error(`Unknown payment tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleListPendingPayments(
  args: {
    supplierId?: string;
    overdueOnly?: boolean;
    limit?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { supplierId, overdueOnly = false, limit = 50 } = args;

  const whereConditions: any[] = [
    eq(purchasingInvoices.tenantId, tenantId),
    eq(purchasingInvoices.status, 'approved'),
  ];

  if (supplierId) {
    whereConditions.push(eq(purchasingInvoices.supplierId, supplierId));
  }

  if (overdueOnly) {
    whereConditions.push(sql`${purchasingInvoices.dueDate} < CURRENT_DATE`);
  }

  // Get approved invoices with remaining amount
  const invoices = await db
    .select()
    .from(purchasingInvoices)
    .where(and(...whereConditions))
    .orderBy(purchasingInvoices.dueDate) // Oldest due date first
    .limit(limit);

  // Filter only those with remaining amount > 0
  const pendingInvoices = invoices.filter(inv => {
    const total = parseFloat(inv.totalAmount);
    const paid = parseFloat(inv.paidAmount || '0');
    return total > paid;
  });

  // Calculate aging
  const now = new Date();
  const invoicesWithAging = pendingInvoices.map(inv => {
    const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
    const daysOverdue = dueDate 
      ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const total = parseFloat(inv.totalAmount);
    const paid = parseFloat(inv.paidAmount || '0');
    const remaining = total - paid;

    return {
      ...inv,
      remainingAmount: remaining,
      daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
      overdue: daysOverdue > 0,
    };
  });

  const totalPending = invoicesWithAging.reduce((sum, inv) => sum + inv.remainingAmount, 0);

  return {
    success: true,
    count: invoicesWithAging.length,
    totalPending,
    invoices: invoicesWithAging,
  };
}

async function handleCreatePayment(
  args: {
    supplierId: string;
    amount: number;
    paymentMethod: string;
    bankAccountId?: string;
    referenceNumber?: string;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { supplierId, amount, paymentMethod, bankAccountId, referenceNumber, notes } = args;

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

  if (amount <= 0) {
    return {
      success: false,
      error: "Valor do pagamento deve ser positivo",
    };
  }

  // Create payment
  const paymentCode = `PAY-${Date.now()}`;
  const payment = await db.insert(purchasingPayments).values({
    id: nanoid(),
    tenantId,
    code: paymentCode,
    paymentDate: new Date(),
    supplierId,
    amount: amount.toString(),
    currency: 'EUR',
    paymentMethod: paymentMethod as any,
    bankAccountId,
    referenceNumber,
    status: 'draft',
    allocatedAmount: '0',
    unappliedAmount: amount.toString(),
    notes,
    createdBy: userId || nanoid(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return {
    success: true,
    message: `Pagamento ${paymentCode} criado - €${amount.toFixed(2)}`,
    payment: payment[0],
  };
}

async function handleAllocatePaymentToInvoices(
  args: {
    paymentId: string;
    allocations: Array<{
      invoiceId: string;
      amount: number;
    }>;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { paymentId, allocations } = args;

  // Validate payment
  const payment = await db
    .select()
    .from(purchasingPayments)
    .where(and(
      eq(purchasingPayments.id, paymentId),
      eq(purchasingPayments.tenantId, tenantId)
    ))
    .limit(1);

  if (payment.length === 0) {
    return {
      success: false,
      error: "Pagamento não encontrado",
    };
  }

  const paymentAmount = parseFloat(payment[0].amount);
  const alreadyAllocated = parseFloat(payment[0].allocatedAmount || '0');
  const available = paymentAmount - alreadyAllocated;
  const totalToAllocate = allocations.reduce((sum, a) => sum + a.amount, 0);

  if (totalToAllocate > available) {
    return {
      success: false,
      error: `Valor total de alocação (${totalToAllocate.toFixed(2)}) excede disponível (${available.toFixed(2)})`,
    };
  }

  // Validate all invoices
  const invoiceIds = allocations.map(a => a.invoiceId);
  const invoices = await db
    .select()
    .from(purchasingInvoices)
    .where(and(
      eq(purchasingInvoices.tenantId, tenantId),
      inArray(purchasingInvoices.id, invoiceIds)
    ));

  if (invoices.length !== allocations.length) {
    return {
      success: false,
      error: "Algumas invoices não foram encontradas",
    };
  }

  // Check supplier match
  const allSameSupplier = invoices.every(inv => inv.supplierId === payment[0].supplierId);
  if (!allSameSupplier) {
    return {
      success: false,
      error: "Todas as invoices devem ser do mesmo fornecedor do pagamento",
    };
  }

  // Create allocations
  const createdAllocations = [];
  for (const allocation of allocations) {
    const invoice = invoices.find(inv => inv.id === allocation.invoiceId)!;
    const totalInvoice = parseFloat(invoice.totalAmount);
    const paidBefore = parseFloat(invoice.paidAmount || '0');
    const remainingBefore = parseFloat(invoice.remainingAmount || (totalInvoice - paidBefore).toString());

    if (allocation.amount > remainingBefore) {
      return {
        success: false,
        error: `Valor de alocação (${allocation.amount}) excede saldo da invoice ${invoice.code} (${remainingBefore})`,
      };
    }

    // Create allocation
    const alloc = await db.insert(purchasingPaymentAllocations).values({
      id: nanoid(),
      tenantId,
      paymentId,
      invoiceId: allocation.invoiceId,
      allocatedAmount: allocation.amount.toString(),
      allocationDate: new Date(),
      createdBy: userId || nanoid(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    createdAllocations.push(alloc[0]);

    // Update invoice (WITH TENANT ISOLATION)
    const newPaid = paidBefore + allocation.amount;
    const newRemaining = totalInvoice - newPaid;
    const newStatus = newRemaining === 0 ? 'paid' : 'partially_paid';

    await db
      .update(purchasingInvoices)
      .set({
        paidAmount: newPaid.toString(),
        remainingAmount: newRemaining.toString(),
        status: newStatus as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(purchasingInvoices.id, allocation.invoiceId),
        eq(purchasingInvoices.tenantId, tenantId)
      ));
  }

  // Update payment (WITH TENANT ISOLATION)
  const newAllocated = alreadyAllocated + totalToAllocate;
  const newUnapplied = paymentAmount - newAllocated;

  await db
    .update(purchasingPayments)
    .set({
      allocatedAmount: newAllocated.toString(),
      unappliedAmount: newUnapplied.toString(),
      status: newUnapplied === 0 ? 'completed' : 'processed',
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(purchasingPayments.id, paymentId),
      eq(purchasingPayments.tenantId, tenantId)
    ));

  return {
    success: true,
    message: `${allocations.length} alocações criadas - Total: €${totalToAllocate.toFixed(2)}`,
    allocations: createdAllocations,
    paymentStatus: newUnapplied === 0 ? 'completed' : 'processed',
  };
}
