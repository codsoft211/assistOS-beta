import { db } from "../../../../../apps/api/db";
import { and, eq, sql } from "drizzle-orm";
import { 
  journalEntryLines,
  journalEntries,
  chartOfAccounts
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  fiscalPeriod: z.string().optional(),
  includeInactive: z.boolean().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const GetTrialBalanceTool: ToolDefinition<Input> = {
  name: "get-trial-balance",
  description: "Obter balancete de verificacao agrupado por conta",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Query sem transaction (apenas leitura)
    
    // 1. Buscar todas as contas ativas (TENANT FILTER)
    let accountsQuery = and(
      eq(chartOfAccounts.tenantId, context.tenantId)
    );

    if (!input.includeInactive) {
      accountsQuery = and(
        accountsQuery!,
        eq(chartOfAccounts.isActive, true)
      );
    }

    const accounts = await db.query.chartOfAccounts.findMany({
      where: accountsQuery,
      orderBy: (accounts, { asc }) => [asc(accounts.code)]
    });

    // 2. Buscar journal entry lines com filtro de fiscal period se fornecido (TENANT FILTER)
    let entriesFilter = and(
      eq(journalEntries.tenantId, context.tenantId),
      eq(journalEntries.status, 'posted')
    );

    if (input.fiscalPeriod) {
      entriesFilter = and(
        entriesFilter!,
        eq(journalEntries.fiscalPeriod, input.fiscalPeriod)
      );
    }

    const lines = await db
      .select({
        accountCode: journalEntryLines.accountCode,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
      .where(entriesFilter);

    // 3. Agrupar por account code e calcular saldos
    const balancesByAccount = new Map<string, { totalDebit: number; totalCredit: number }>();

    for (const line of lines) {
      const current = balancesByAccount.get(line.accountCode) || { totalDebit: 0, totalCredit: 0 };
      current.totalDebit += parseFloat(line.debit as any) || 0;
      current.totalCredit += parseFloat(line.credit as any) || 0;
      balancesByAccount.set(line.accountCode, current);
    }

    // 4. Montar trial balance
    const trialBalanceLines = accounts.map((account: any) => {
      const balance = balancesByAccount.get(account.code) || { totalDebit: 0, totalCredit: 0 };
      const netBalance = balance.totalDebit - balance.totalCredit;

      return {
        accountCode: account.code,
        accountName: account.name,
        accountType: account.accountType,
        normalBalance: account.normalBalance,
        totalDebit: balance.totalDebit,
        totalCredit: balance.totalCredit,
        netBalance: netBalance,
        balancePosition: netBalance >= 0 ? 'debit' : 'credit',
        balanceAmount: Math.abs(netBalance)
      };
    }).filter((line: any) => line.totalDebit !== 0 || line.totalCredit !== 0);

    // 5. Calcular totais gerais
    const grandTotalDebit = trialBalanceLines.reduce((sum: any, line: any) => sum + line.totalDebit, 0);
    const grandTotalCredit = trialBalanceLines.reduce((sum: any, line: any) => sum + line.totalCredit, 0);
    const isBalanced = Math.abs(grandTotalDebit - grandTotalCredit) < 0.01;

    return {
      success: true,
      data: {
        fiscalPeriod: input.fiscalPeriod || 'Todos',
        linesCount: trialBalanceLines.length,
        lines: trialBalanceLines,
        totals: {
          totalDebit: grandTotalDebit,
          totalCredit: grandTotalCredit,
          difference: grandTotalDebit - grandTotalCredit,
          isBalanced
        },
        message: `Balancete gerado com ${trialBalanceLines.length} contas${isBalanced ? ' (balanceado)' : ' (DESBALANCEADO!)'}`
      }
    };
  },
};
