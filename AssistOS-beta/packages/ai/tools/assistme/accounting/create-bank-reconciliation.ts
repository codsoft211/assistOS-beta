import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  bankReconciliations,
  chartOfAccounts
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  bankName: z.string().min(1, "Nome do banco obrigatorio"),
  accountNumber: z.string().min(1, "Numero da conta obrigatorio"),
  statementDate: z.string().min(1, "Data do extrato obrigatoria"),
  openingBalance: z.number(),
  closingBalance: z.number(),
  notes: z.string().optional(),
  bankAccountCode: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const CreateBankReconciliationTool: ToolDefinition<Input> = {
  name: "create-bank-reconciliation",
  description: "Criar reconciliacao bancaria com validacao de conta bancaria",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // 1. Se bankAccountCode fornecido, validar que existe (TENANT FILTER)
      if (input.bankAccountCode) {
        const bankAccount = await tx.query.chartOfAccounts.findFirst({
          where: and(
            eq(chartOfAccounts.tenantId, context.tenantId),
            eq(chartOfAccounts.code, input.bankAccountCode),
            eq(chartOfAccounts.isActive, true)
          )
        });

        if (!bankAccount) {
          throw new Error(`Conta bancaria ${input.bankAccountCode} nao encontrada ou inativa`);
        }

        if (!bankAccount.accountType.toLowerCase().includes('bank') && 
            !bankAccount.accountType.toLowerCase().includes('caixa')) {
          throw new Error(`Conta ${input.bankAccountCode} nao e uma conta bancaria. Tipo: ${bankAccount.accountType}`);
        }
      }

      // 2. Criar bank reconciliation
      const [newReconciliation] = await tx.insert(bankReconciliations).values({
        tenantId: context.tenantId,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        statementDate: new Date(input.statementDate),
        openingBalance: input.openingBalance.toString(),
        closingBalance: input.closingBalance.toString(),
        status: 'pending',
        notes: input.notes,
      }).returning();

      return { newReconciliation };
    });

    return {
      success: true,
      data: {
        reconciliationId: result.newReconciliation.id,
        bankName: result.newReconciliation.bankName,
        accountNumber: result.newReconciliation.accountNumber,
        statementDate: result.newReconciliation.statementDate,
        openingBalance: result.newReconciliation.openingBalance,
        closingBalance: result.newReconciliation.closingBalance,
        status: result.newReconciliation.status,
        message: `Reconciliacao bancaria criada para ${result.newReconciliation.bankName} - ${result.newReconciliation.accountNumber}`
      }
    };
  },
};
