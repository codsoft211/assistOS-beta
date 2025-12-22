import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchasingInvoices } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ApproveExpenseTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'approve_expense',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Aprova uma despesa pendente',
    parameters: [
      {
        name: 'expenseId',
        type: 'string',
        description: 'ID da despesa',
        required: true
      },
      {
        name: 'approved',
        type: 'boolean',
        description: 'Aprovado (true) ou rejeitado (false)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas da aprovação/rejeição',
        required: false
      }
    ],
    outputSchema: z.object({
      expenseId: z.string(),
      invoiceNumber: z.string(),
      newStatus: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      expenseId: string;
      approved: boolean;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    const [expense] = await db
      .select()
      .from(purchasingInvoices)
      .where(and(
        eq(purchasingInvoices.id, input.expenseId),
        eq(purchasingInvoices.tenantId, context.tenantId)
      ))
      .limit(1);

    if (!expense) {
      throw new Error('Despesa não encontrada');
    }

    const newStatus = input.approved ? 'approved' : 'rejected';
    
    const [updated] = await db
      .update(purchasingInvoices)
      .set({
        status: newStatus,
        approvalNotes: input.notes,
        approvedBy: context.userId,
        approvedAt: new Date()
      })
      .where(eq(purchasingInvoices.id, input.expenseId))
      .returning();

    const action = input.approved ? 'aprovada' : 'rejeitada';

    return {
      expenseId: updated.id,
      invoiceNumber: updated.invoiceNumber,
      newStatus,
      message: `Despesa ${updated.invoiceNumber} ${action}!`
    };
  }
}
