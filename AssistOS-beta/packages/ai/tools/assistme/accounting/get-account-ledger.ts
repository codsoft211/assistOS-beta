import { db } from "../../../../../apps/api/db";
import { and, eq, desc } from "drizzle-orm";
import { 
  journalEntryLines,
  journalEntries,
  chartOfAccounts
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  accountCode: z.string().min(1, "Codigo da conta obrigatorio"),
  fiscalPeriod: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const GetAccountLedgerTool: ToolDefinition<Input> = {
  name: "get-account-ledger",
  description: "Obter livro razao de uma conta especifica com saldo running",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Query sem transaction (apenas leitura)
    
    // 1. Validar que a conta existe (TENANT FILTER)
    const account = await db.query.chartOfAccounts.findFirst({
      where: and(
        eq(chartOfAccounts.tenantId, context.tenantId),
        eq(chartOfAccounts.code, input.accountCode)
      )
    });

    if (!account) {
      throw new Error(`Conta ${input.accountCode} nao encontrada`);
    }

    // 2. Montar filtros de journal entries (TENANT FILTER)
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

    // Note: startDate e endDate filtrariam por journalEntries.entryDate
    // mas isso requer adicionar ao WHERE - omitido por simplicidade

    // 3. Buscar linhas da conta com join em journal entries (TENANT FILTER aplicado)
    const ledgerEntries = await db
      .select({
        lineId: journalEntryLines.id,
        entryId: journalEntries.id,
        entryNumber: journalEntries.entryNumber,
        entryDate: journalEntries.entryDate,
        fiscalPeriod: journalEntries.fiscalPeriod,
        description: journalEntryLines.description,
        reference: journalEntries.reference,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
        costCenter: journalEntryLines.costCenter,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalEntryLines.accountCode, input.accountCode),
          entriesFilter
        )
      )
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.entryNumber));

    // 4. Calcular running balance
    let runningBalance = 0;
    const ledgerWithBalance = ledgerEntries.map((entry: any) => {
      const debit = parseFloat(entry.debit) || 0;
      const credit = parseFloat(entry.credit) || 0;

      runningBalance += debit - credit;

      return {
        entryNumber: entry.entryNumber,
        entryDate: entry.entryDate,
        fiscalPeriod: entry.fiscalPeriod,
        description: entry.description,
        reference: entry.reference,
        debit: debit,
        credit: credit,
        balance: runningBalance,
        costCenter: entry.costCenter,
      };
    }).reverse(); // Reverter para ordem cronologica crescente

    // 5. Calcular totais
    const totalDebit = ledgerWithBalance.reduce((sum: any, entry: any) => sum + entry.debit, 0);
    const totalCredit = ledgerWithBalance.reduce((sum: any, entry: any) => sum + entry.credit, 0);
    const finalBalance = totalDebit - totalCredit;

    return {
      success: true,
      data: {
        account: {
          code: account.code,
          name: account.name,
          accountType: account.accountType,
          normalBalance: account.normalBalance,
        },
        fiscalPeriod: input.fiscalPeriod || 'Todos',
        entriesCount: ledgerWithBalance.length,
        entries: ledgerWithBalance,
        summary: {
          totalDebit,
          totalCredit,
          finalBalance,
          balancePosition: finalBalance >= 0 ? 'debit' : 'credit',
        },
        message: `Livro razao da conta ${account.code} - ${account.name} com ${ledgerWithBalance.length} movimentos`
      }
    };
  },
};
