import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  journalEntries,
  fiscalPeriods
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  entryId: z.string().min(1, "ID do lancamento obrigatorio"),
});

type Input = z.infer<typeof inputSchema>;

export const PostJournalEntryTool: ToolDefinition<Input> = {
  name: "post-journal-entry",
  description: "Publicar lancamento contabil de rascunho para posted",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // 1. Ler journal entry com lock exclusivo (forUpdate) DENTRO do transaction (TENANT FILTER)
      const [entry] = await tx
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.id, input.entryId),
            eq(journalEntries.tenantId, context.tenantId)
          )
        )
        .for('update');

      // 2. Validar entry existe
      if (!entry) {
        throw new Error(`Lancamento contabil ${input.entryId} nao encontrado`);
      }

      // 3. Validar status atual
      if (entry.status !== 'draft') {
        throw new Error(`Lancamento ${entry.entryNumber} ja esta com status "${entry.status}". Apenas rascunhos podem ser publicados`);
      }

      // 4. Validar que fiscal period ainda esta aberto (TENANT FILTER)
      const fiscalPeriod = await tx.query.fiscalPeriods.findFirst({
        where: and(
          eq(fiscalPeriods.tenantId, context.tenantId),
          eq(fiscalPeriods.periodCode, entry.fiscalPeriod)
        )
      });

      if (!fiscalPeriod) {
        throw new Error(`Periodo fiscal ${entry.fiscalPeriod} nao encontrado`);
      }

      if (fiscalPeriod.status !== 'open') {
        throw new Error(`Periodo fiscal ${entry.fiscalPeriod} esta ${fiscalPeriod.status}. Nao e possivel publicar lancamentos`);
      }

      // 5. Atualizar status para posted (TENANT FILTER OBRIGATORIO)
      const [updatedEntry] = await tx.update(journalEntries)
        .set({
          status: 'posted',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(journalEntries.id, input.entryId),
            eq(journalEntries.tenantId, context.tenantId)
          )
        )
        .returning();

      return { updatedEntry };
    });

    return {
      success: true,
      data: {
        entryId: result.updatedEntry.id,
        entryNumber: result.updatedEntry.entryNumber,
        fiscalPeriod: result.updatedEntry.fiscalPeriod,
        status: result.updatedEntry.status,
        totalDebit: result.updatedEntry.totalDebit,
        totalCredit: result.updatedEntry.totalCredit,
        message: `Lancamento ${result.updatedEntry.entryNumber} publicado com sucesso`
      }
    };
  },
};
