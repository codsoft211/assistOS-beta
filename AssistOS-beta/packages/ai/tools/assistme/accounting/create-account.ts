import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  chartOfAccounts
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  code: z.string().min(1, "Codigo da conta obrigatorio"),
  name: z.string().min(1, "Nome da conta obrigatorio"),
  accountType: z.string().min(1, "Tipo de conta obrigatorio"),
  normalBalance: z.enum(['debit', 'credit'], { errorMap: () => ({ message: "Normal balance deve ser 'debit' ou 'credit'" }) }),
  parentCode: z.string().optional(),
  description: z.string().optional(),
  taxonomyReference: z.string().optional(),
  groupingCode: z.string().optional(),
  groupingCategory: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const CreateAccountTool: ToolDefinition<Input> = {
  name: "create-account",
  description: "Criar conta no plano de contas com validacao de parent account",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // 1. Verificar se codigo ja existe para este tenant
      const existingAccount = await tx.query.chartOfAccounts.findFirst({
        where: and(
          eq(chartOfAccounts.tenantId, context.tenantId),
          eq(chartOfAccounts.code, input.code)
        )
      });

      if (existingAccount) {
        throw new Error(`Conta com codigo ${input.code} ja existe`);
      }

      // 2. Se parent code fornecido, validar que existe (TENANT FILTER)
      let level = 1;
      if (input.parentCode) {
        const parentAccount = await tx.query.chartOfAccounts.findFirst({
          where: and(
            eq(chartOfAccounts.tenantId, context.tenantId),
            eq(chartOfAccounts.code, input.parentCode)
          )
        });

        if (!parentAccount) {
          throw new Error(`Conta pai ${input.parentCode} nao encontrada`);
        }

        if (!parentAccount.isActive) {
          throw new Error(`Conta pai ${input.parentCode} esta inativa. Nao e possivel criar subcontas`);
        }

        level = parentAccount.level + 1;
      }

      // 3. Criar conta
      const [newAccount] = await tx.insert(chartOfAccounts).values({
        tenantId: context.tenantId,
        code: input.code,
        name: input.name,
        accountType: input.accountType,
        parentCode: input.parentCode,
        level,
        normalBalance: input.normalBalance,
        description: input.description,
        taxonomyReference: input.taxonomyReference,
        groupingCode: input.groupingCode,
        groupingCategory: input.groupingCategory,
      }).returning();

      return { newAccount };
    });

    return {
      success: true,
      data: {
        accountId: result.newAccount.id,
        code: result.newAccount.code,
        name: result.newAccount.name,
        accountType: result.newAccount.accountType,
        level: result.newAccount.level,
        parentCode: result.newAccount.parentCode,
        normalBalance: result.newAccount.normalBalance,
        message: `Conta ${result.newAccount.code} - ${result.newAccount.name} criada com sucesso`
      }
    };
  },
};
