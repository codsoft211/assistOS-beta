import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  budgetQuotes,
  commercialActivities
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  quoteId: z.string().min(1, "ID do orcamento obrigatorio"),
  newStatus: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired'], {
    errorMap: () => ({ message: "Status deve ser: draft, sent, approved, rejected ou expired" })
  }),
  notes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const UpdateQuoteStatusTool: ToolDefinition<Input> = {
  name: "update-quote-status",
  description: "Aprova, rejeita ou atualiza status de um orcamento comercial",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Atualizar status em transacao atomica com row-level locking
    const result = await db.transaction(async (tx) => {
      // 1. Ler orcamento com lock exclusivo (forUpdate) DENTRO do transaction
      const quote = await tx.query.budgetQuotes.findFirst({
        where: and(
          eq(budgetQuotes.tenantId, context.tenantId),
          eq(budgetQuotes.id, input.quoteId)
        )
      }).for('update');

      // 2. Validar orcamento existe
      if (!quote) {
        throw new Error(`Orcamento ${input.quoteId} nao encontrado`);
      }

      const oldStatus = quote.status;

      // 3. Preparar campos a atualizar baseado no novo status
      const updateData: any = {
        status: input.newStatus,
        updatedAt: new Date()
      };

      // Se status for 'sent', registar data de envio
      if (input.newStatus === 'sent' && !quote.sentAt) {
        updateData.sentAt = new Date();
      }

      // Se status for 'approved', registar data de aprovacao
      if (input.newStatus === 'approved' && !quote.approvedAt) {
        updateData.approvedAt = new Date();
      }

      // 4. Atualizar status do orcamento
      const [updatedQuote] = await tx.update(budgetQuotes)
        .set(updateData)
        .where(
          and(
            eq(budgetQuotes.id, input.quoteId),
            eq(budgetQuotes.tenantId, context.tenantId)
          )
        )
        .returning();

      // 5. Registar atividade de mudanca de status no lead associado
      if (quote.leadId) {
        await tx.insert(commercialActivities).values({
          tenantId: context.tenantId,
          leadId: quote.leadId,
          activityType: 'quote_status_change',
          subject: `Orcamento ${quote.quoteNumber}: ${oldStatus} → ${input.newStatus}`,
          description: input.notes || `Status do orcamento alterado de "${oldStatus}" para "${input.newStatus}"`,
          outcome: 'completed',
          completedAt: new Date(),
          createdBy: context.userId,
          assignedTo: context.userId,
          metadata: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            oldStatus,
            newStatus: input.newStatus,
            changedBy: context.userId,
            changedAt: new Date().toISOString()
          }
        });
      }

      return { updatedQuote, oldStatus };
    });

    return {
      success: true,
      data: {
        quoteId: result.updatedQuote.id,
        quoteNumber: result.updatedQuote.quoteNumber,
        oldStatus: result.oldStatus,
        newStatus: result.updatedQuote.status,
        sentAt: result.updatedQuote.sentAt?.toISOString(),
        approvedAt: result.updatedQuote.approvedAt?.toISOString(),
        message: `Orcamento ${result.updatedQuote.quoteNumber} atualizado de "${result.oldStatus}" para "${result.updatedQuote.status}"`
      }
    };
  },
};
