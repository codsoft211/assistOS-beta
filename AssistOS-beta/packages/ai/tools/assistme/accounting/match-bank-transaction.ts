import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  bankStatementTransactions,
  payments
} from "shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  transactionId: z.string().min(1, "ID da transacao obrigatorio"),
  paymentId: z.string().min(1, "ID do pagamento obrigatorio"),
  matchConfidence: z.number().min(0).max(100).optional(),
});

type Input = z.infer<typeof inputSchema>;

export const MatchBankTransactionTool: ToolDefinition<Input> = {
  name: "match-bank-transaction",
  description: "Fazer matching de transacao bancaria com pagamento",
  category: "accounting",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const result = await db.transaction(async (tx: any) => {
      // 1. Validar que payment existe (TENANT FILTER)
      const payment = await tx.query.payments.findFirst({
        where: and(
          eq(payments.id, input.paymentId),
          eq(payments.tenantId, context.tenantId)
        )
      });

      if (!payment) {
        throw new Error(`Pagamento ${input.paymentId} nao encontrado`);
      }

      // 2. Ler bank transaction com lock exclusivo (forUpdate) DENTRO do transaction (TENANT FILTER)
      const [transaction] = await tx
        .select()
        .from(bankStatementTransactions)
        .where(
          and(
            eq(bankStatementTransactions.id, input.transactionId),
            eq(bankStatementTransactions.tenantId, context.tenantId)
          )
        )
        .for('update');

      // 3. Validar transaction existe
      if (!transaction) {
        throw new Error(`Transacao bancaria ${input.transactionId} nao encontrada`);
      }

      // 4. Validar se ja esta matched
      if (transaction.matchedPaymentId) {
        throw new Error(`Transacao ${input.transactionId} ja esta associada ao pagamento ${transaction.matchedPaymentId}`);
      }

      // 5. Fazer matching (TENANT FILTER OBRIGATORIO)
      const [matchedTransaction] = await tx.update(bankStatementTransactions)
        .set({
          matchedPaymentId: input.paymentId,
          matchConfidence: input.matchConfidence || 100,
          matchedManually: true,
        })
        .where(
          and(
            eq(bankStatementTransactions.id, input.transactionId),
            eq(bankStatementTransactions.tenantId, context.tenantId)
          )
        )
        .returning();

      return { matchedTransaction, payment };
    });

    return {
      success: true,
      data: {
        transactionId: result.matchedTransaction.id,
        paymentId: result.matchedTransaction.matchedPaymentId,
        transactionDescription: result.matchedTransaction.description,
        transactionAmount: result.matchedTransaction.creditAmount || result.matchedTransaction.debitAmount,
        paymentAmount: result.payment.amount,
        matchConfidence: result.matchedTransaction.matchConfidence,
        message: `Transacao bancaria associada com sucesso ao pagamento`
      }
    };
  },
};
