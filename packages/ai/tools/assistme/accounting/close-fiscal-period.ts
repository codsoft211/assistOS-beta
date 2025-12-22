import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  fiscalPeriods,
  journalEntries
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  periodId: z.string().min(1, "ID do periodo obrigatorio"),
});

type Input = z.infer<typeof inputSchema>;

export const CloseFiscalPeriodTool: ToolDefinition<Input> = {
  name: "close-fiscal-period",
  description: "Fechar periodo fiscal apos validar ausencia de lancamentos em rascunho",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // 1. Ler fiscal period com lock exclusivo (forUpdate) DENTRO do transaction (TENANT FILTER)
      const [period] = await tx
        .select()
        .from(fiscalPeriods)
        .where(
          and(
            eq(fiscalPeriods.id, input.periodId),
            eq(fiscalPeriods.tenantId, context.tenantId)
          )
        )
        .for('update');

      // 2. Validar period existe
      if (!period) {
        throw new Error(`Periodo fiscal ${input.periodId} nao encontrado`);
      }

      // 3. Validar status atual
      if (period.status === 'closed') {
        throw new Error(`Periodo fiscal ${period.periodCode} ja esta fechado desde ${period.closedAt}`);
      }

      // 4. Verificar se ha journal entries em draft neste periodo (TENANT FILTER)
      const draftEntries = await tx.query.journalEntries.findMany({
        where: and(
          eq(journalEntries.tenantId, context.tenantId),
          eq(journalEntries.fiscalPeriod, period.periodCode),
          eq(journalEntries.status, 'draft')
        ),
        limit: 1
      });

      if (draftEntries.length > 0) {
        throw new Error(`Nao e possivel fechar periodo ${period.periodCode}. Existem lancamentos em rascunho. Publique ou remova todos os rascunhos antes de fechar`);
      }

      const now = new Date();

      // 5. Fechar periodo (TENANT FILTER OBRIGATORIO)
      const [closedPeriod] = await tx.update(fiscalPeriods)
        .set({
          status: 'closed',
          closedAt: now,
          closedBy: context.userId,
        })
        .where(
          and(
            eq(fiscalPeriods.id, input.periodId),
            eq(fiscalPeriods.tenantId, context.tenantId)
          )
        )
        .returning();

      return { closedPeriod };
    });

    return {
      success: true,
      data: {
        periodId: result.closedPeriod.id,
        periodCode: result.closedPeriod.periodCode,
        fiscalYear: result.closedPeriod.fiscalYear,
        status: result.closedPeriod.status,
        closedAt: result.closedPeriod.closedAt,
        closedBy: result.closedPeriod.closedBy,
        message: `Periodo fiscal ${result.closedPeriod.periodCode} fechado com sucesso`
      }
    };
  },
};
