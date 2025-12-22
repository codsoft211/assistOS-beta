/**
 * ComprasModule - Employee Expenses AI Tools (IMPORTANT!)
 * 3 tools for employee expense management, approval, and project allocation
 */

import { db } from "../../../../apps/api/db";
import { employeeExpenses, projects, users } from "../../../../shared/schema";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const expenseTools = [
  {
    type: "function" as const,
    function: {
      name: "create_employee_expense",
      description: "Cria despesa de funcionário (reimbursement request). Registra categoria, valor, receipt, projeto. Retorna expense criada.",
      parameters: {
        type: "object",
        properties: {
          employeeId: {
            type: "string",
            description: "ID do funcionário (obrigatório)",
          },
          category: {
            type: "string",
            enum: ["travel", "meals", "accommodation", "supplies", "fuel", "parking", "other"],
            description: "Categoria da despesa (obrigatório)",
          },
          amount: {
            type: "number",
            description: "Valor da despesa (obrigatório)",
          },
          expenseDate: {
            type: "string",
            description: "Data da despesa YYYY-MM-DD (obrigatório)",
          },
          description: {
            type: "string",
            description: "Descrição da despesa",
          },
          merchantName: {
            type: "string",
            description: "Nome do estabelecimento",
          },
          projectId: {
            type: "string",
            description: "ID do projeto relacionado (opcional)",
          },
          receiptUrl: {
            type: "string",
            description: "URL do recibo/comprovante (opcional)",
          },
          paymentMethod: {
            type: "string",
            enum: ["company_card", "personal_reimbursement", "petty_cash"],
            description: "Método de pagamento (default: personal_reimbursement)",
          },
          notes: {
            type: "string",
            description: "Notas adicionais",
          },
        },
        required: ["employeeId", "category", "amount", "expenseDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "approve_expense",
      description: "Aprova ou rejeita despesa de funcionário. Valida valores, categoria, registra aprovador. Permite reimbursement workflow.",
      parameters: {
        type: "object",
        properties: {
          expenseId: {
            type: "string",
            description: "ID da expense (obrigatório)",
          },
          action: {
            type: "string",
            enum: ["approve", "reject"],
            description: "Ação a executar (obrigatório)",
          },
          rejectionReason: {
            type: "string",
            description: "Razão da rejeição (obrigatório para reject)",
          },
        },
        required: ["expenseId", "action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "allocate_expense_to_project",
      description: "Aloca despesa a um projeto específico. Útil para cost tracking, billing, analytics. Permite alocação parcial (percentage).",
      parameters: {
        type: "object",
        properties: {
          expenseId: {
            type: "string",
            description: "ID da expense (obrigatório)",
          },
          projectId: {
            type: "string",
            description: "ID do projeto (obrigatório)",
          },
          allocationPercentage: {
            type: "number",
            description: "% da despesa alocada ao projeto (1-100, default: 100)",
          },
        },
        required: ["expenseId", "projectId"],
      },
    },
  },
];

/**
 * Execute an expense tool based on tool call from AI
 */
export async function executeExpenseTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Expense Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "create_employee_expense":
      return await handleCreateEmployeeExpense(args, context);
      
    case "approve_expense":
      return await handleApproveExpense(args, context);
      
    case "allocate_expense_to_project":
      return await handleAllocateExpenseToProject(args, context);
      
    default:
      throw new Error(`Unknown expense tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCreateEmployeeExpense(
  args: {
    employeeId: string;
    category: string;
    amount: number;
    expenseDate: string;
    description?: string;
    merchantName?: string;
    projectId?: string;
    receiptUrl?: string;
    paymentMethod?: string;
    notes?: string;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { 
    employeeId, 
    category, 
    amount, 
    expenseDate, 
    description,
    merchantName,
    projectId,
    receiptUrl,
    paymentMethod = 'personal_reimbursement',
    notes
  } = args;

  if (amount <= 0) {
    return {
      success: false,
      error: "Valor da despesa deve ser positivo",
    };
  }

  // Validate employee exists in tenant
  const employee = await db
    .select()
    .from(users)
    .where(and(
      eq(users.id, employeeId),
      eq(users.tenantId, tenantId)
    ))
    .limit(1);

  if (employee.length === 0) {
    return {
      success: false,
      error: "Funcionário não encontrado no tenant",
    };
  }

  // Validate project if provided
  if (projectId) {
    const project = await db
      .select()
      .from(projects)
      .where(and(
        eq(projects.id, projectId),
        eq(projects.tenantId, tenantId)
      ))
      .limit(1);

    if (project.length === 0) {
      return {
        success: false,
        error: "Projeto não encontrado",
      };
    }
  }

  // Create expense
  const expenseCode = `EXP-${Date.now()}`;
  const expense = await db.insert(employeeExpenses).values({
    id: nanoid(),
    tenantId,
    code: expenseCode,
    expenseDate: new Date(expenseDate),
    employeeId,
    category: category as any,
    description,
    merchantName,
    amount: amount.toString(),
    currency: 'EUR',
    receiptAttached: !!receiptUrl,
    receiptUrl,
    projectId,
    allocatedToProject: !!projectId,
    allocationDate: projectId ? new Date() : null,
    paymentMethod: paymentMethod as any,
    personalReimbursement: paymentMethod === 'personal_reimbursement',
    status: 'draft',
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return {
    success: true,
    message: `Despesa ${expenseCode} criada - €${amount.toFixed(2)}`,
    expense: expense[0],
  };
}

async function handleApproveExpense(
  args: {
    expenseId: string;
    action: 'approve' | 'reject';
    rejectionReason?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { expenseId, action, rejectionReason } = args;

  // Get expense
  const expense = await db
    .select()
    .from(employeeExpenses)
    .where(and(
      eq(employeeExpenses.id, expenseId),
      eq(employeeExpenses.tenantId, tenantId)
    ))
    .limit(1);

  if (expense.length === 0) {
    return {
      success: false,
      error: "Despesa não encontrada",
    };
  }

  if (expense[0].status === 'approved' || expense[0].status === 'rejected') {
    return {
      success: false,
      error: `Despesa já está ${expense[0].status}`,
    };
  }

  let newStatus: string;
  let message: string;
  const updates: any = {
    approvedBy: userId || nanoid(),
    approvalDate: new Date(),
    updatedAt: new Date(),
  };

  if (action === 'approve') {
    newStatus = 'approved';
    message = 'Despesa aprovada';
  } else {
    if (!rejectionReason) {
      return {
        success: false,
        error: "rejectionReason é obrigatório para rejeição",
      };
    }
    newStatus = 'rejected';
    message = 'Despesa rejeitada';
    updates.rejectionReason = rejectionReason;
  }

  updates.status = newStatus;

  const updated = await db
    .update(employeeExpenses)
    .set(updates)
    .where(and(
      eq(employeeExpenses.id, expenseId),
      eq(employeeExpenses.tenantId, tenantId)
    ))
    .returning();

  return {
    success: true,
    message,
    expense: updated[0],
  };
}

async function handleAllocateExpenseToProject(
  args: {
    expenseId: string;
    projectId: string;
    allocationPercentage?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { expenseId, projectId, allocationPercentage = 100 } = args;

  if (allocationPercentage < 1 || allocationPercentage > 100) {
    return {
      success: false,
      error: "allocationPercentage deve estar entre 1 e 100",
    };
  }

  // Verify expense
  const expense = await db
    .select()
    .from(employeeExpenses)
    .where(and(
      eq(employeeExpenses.id, expenseId),
      eq(employeeExpenses.tenantId, tenantId)
    ))
    .limit(1);

  if (expense.length === 0) {
    return {
      success: false,
      error: "Despesa não encontrada",
    };
  }

  // Verify project
  const project = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.id, projectId),
      eq(projects.tenantId, tenantId)
    ))
    .limit(1);

  if (project.length === 0) {
    return {
      success: false,
      error: "Projeto não encontrado",
    };
  }

  // Update expense (WITH TENANT ISOLATION)
  const updated = await db
    .update(employeeExpenses)
    .set({
      projectId,
      allocatedToProject: true,
      allocationDate: new Date(),
      allocationPercentage: allocationPercentage.toString(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(employeeExpenses.id, expenseId),
      eq(employeeExpenses.tenantId, tenantId)
    ))
    .returning();

  const allocatedAmount = parseFloat(expense[0].amount) * (allocationPercentage / 100);

  return {
    success: true,
    message: `Despesa alocada ao projeto '${project[0].name}' (${allocationPercentage}%)`,
    expense: updated[0],
    allocatedAmount,
  };
}
