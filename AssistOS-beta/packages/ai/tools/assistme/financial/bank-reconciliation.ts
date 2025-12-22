import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { payments } from 'shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

export class BankReconciliationTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'bank_reconciliation',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Reconciliação bancária - match de pagamentos com transações bancárias',
    parameters: [
      {
        name: 'bankAccountId',
        type: 'string',
        description: 'ID da conta bancária',
        required: false
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data inicial (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data final (YYYY-MM-DD)',
        required: false
      }
    ],
    outputSchema: z.object({
      reconciledCount: z.number(),
      unreconciledCount: z.number(),
      reconciledAmount: z.number(),
      unreconciledAmount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      bankAccountId?: string;
      startDate?: string;
      endDate?: string;
    },
    context: ToolExecutionContext
  ) {
    const allPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.tenantId, context.tenantId));

    const reconciled = allPayments.filter(p => p.reconciledAt !== null);
    const unreconciled = allPayments.filter(p => p.reconciledAt === null);

    const reconciledAmount = reconciled.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const unreconciledAmount = unreconciled.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    return {
      reconciledCount: reconciled.length,
      unreconciledCount: unreconciled.length,
      reconciledAmount,
      unreconciledAmount,
      message: `Reconciliação: ${reconciled.length} reconciliado(s) (€${reconciledAmount.toFixed(2)}), ${unreconciled.length} pendente(s) (€${unreconciledAmount.toFixed(2)})`
    };
  }
}
