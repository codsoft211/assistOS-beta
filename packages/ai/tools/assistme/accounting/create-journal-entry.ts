import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
  fiscalPeriods
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  entryDate: z.string().min(1, "Data do lancamento obrigatoria"),
  fiscalPeriod: z.string().min(1, "Periodo fiscal obrigatorio"),
  description: z.string().min(1, "Descricao obrigatoria"),
  reference: z.string().optional(),
  sourceType: z.string().min(1, "Tipo de origem obrigatorio"),
  sourceId: z.string().optional(),
  lines: z.array(z.object({
    accountCode: z.string().min(1, "Codigo da conta obrigatorio"),
    description: z.string().min(1, "Descricao da linha obrigatoria"),
    debit: z.number().min(0, "Debito deve ser >= 0"),
    credit: z.number().min(0, "Credito deve ser >= 0"),
    costCenter: z.string().optional(),
    projectId: z.string().optional(),
  })).min(2, "Minimo 2 linhas necessarias"),
});

type Input = z.infer<typeof inputSchema>;

export const CreateJournalEntryTool: ToolDefinition<Input> = {
  name: "create-journal-entry",
  description: "Criar lancamento contabil com validacao de balance e contas",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // 1. Validar que fiscal period existe e esta aberto (TENANT FILTER)
      const fiscalPeriod = await tx.query.fiscalPeriods.findFirst({
        where: and(
          eq(fiscalPeriods.tenantId, context.tenantId),
          eq(fiscalPeriods.periodCode, input.fiscalPeriod)
        )
      });

      if (!fiscalPeriod) {
        throw new Error(`Periodo fiscal ${input.fiscalPeriod} nao encontrado`);
      }

      if (fiscalPeriod.status !== 'open') {
        throw new Error(`Periodo fiscal ${input.fiscalPeriod} esta ${fiscalPeriod.status}. Apenas periodos abertos permitem lancamentos`);
      }

      // 2. Validar que TODAS as contas existem (TENANT FILTER)
      const accountCodes = Array.from(new Set(input.lines.map((line: any) => line.accountCode)));
      const accounts = await tx.query.chartOfAccounts.findMany({
        where: and(
          eq(chartOfAccounts.tenantId, context.tenantId),
          eq(chartOfAccounts.isActive, true)
        )
      });

      const accountCodesInDB = new Set(accounts.map((acc: any) => acc.code));
      const missingAccounts = accountCodes.filter((code: any) => !accountCodesInDB.has(code));

      if (missingAccounts.length > 0) {
        throw new Error(`Contas nao encontradas: ${missingAccounts.join(', ')}`);
      }

      // 3. Calcular totais e validar balance (debit == credit)
      let totalDebit = 0;
      let totalCredit = 0;

      for (const line of input.lines) {
        totalDebit += line.debit;
        totalCredit += line.credit;

        if (line.debit > 0 && line.credit > 0) {
          throw new Error(`Linha da conta ${line.accountCode} nao pode ter debito E credito simultaneamente`);
        }

        if (line.debit === 0 && line.credit === 0) {
          throw new Error(`Linha da conta ${line.accountCode} deve ter debito OU credito > 0`);
        }
      }

      const difference = Math.abs(totalDebit - totalCredit);
      if (difference > 0.01) {
        throw new Error(`Lancamento desbalanceado: Debito=${totalDebit.toFixed(2)}, Credito=${totalCredit.toFixed(2)}, Diferenca=${difference.toFixed(2)}`);
      }

      // 4. Gerar entry number unico
      const entryNumber = `JE-${Date.now()}`;

      // 5. Criar journal entry
      const [newEntry] = await tx.insert(journalEntries).values({
        tenantId: context.tenantId,
        entryNumber,
        entryDate: new Date(input.entryDate),
        fiscalPeriod: input.fiscalPeriod,
        description: input.description,
        reference: input.reference,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: 'draft',
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        createdBy: context.userId,
      }).returning();

      // 6. Criar linhas do journal entry
      const lineValues = input.lines.map((line: any) => ({
        entryId: newEntry.id,
        accountCode: line.accountCode,
        description: line.description,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
        costCenter: line.costCenter,
        projectId: line.projectId,
      }));

      const createdLines = await tx.insert(journalEntryLines).values(lineValues).returning();

      return { newEntry, createdLines, totalDebit, totalCredit };
    });

    return {
      success: true,
      data: {
        entryId: result.newEntry.id,
        entryNumber: result.newEntry.entryNumber,
        entryDate: result.newEntry.entryDate,
        fiscalPeriod: result.newEntry.fiscalPeriod,
        description: result.newEntry.description,
        status: result.newEntry.status,
        totalDebit: result.totalDebit,
        totalCredit: result.totalCredit,
        linesCount: result.createdLines.length,
        message: `Lancamento contabil ${result.newEntry.entryNumber} criado com sucesso em rascunho`
      }
    };
  },
};
