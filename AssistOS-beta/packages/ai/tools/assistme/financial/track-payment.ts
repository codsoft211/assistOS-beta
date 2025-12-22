import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { payments, invoices } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class TrackPaymentTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'track_payment',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Rastreia o estado de um pagamento',
    parameters: [
      {
        name: 'paymentId',
        type: 'string',
        description: 'ID do pagamento',
        required: false
      },
      {
        name: 'invoiceId',
        type: 'string',
        description: 'ID da fatura para verificar pagamentos',
        required: false
      }
    ],
    outputSchema: z.object({
      payments: z.array(z.object({
        id: z.string(),
        amount: z.string(),
        paymentDate: z.date(),
        status: z.string(),
        paymentMethod: z.string()
      })),
      totalPaid: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      paymentId?: string;
      invoiceId?: string;
    },
    context: ToolExecutionContext
  ) {
    let results;
    
    if (input.paymentId) {
      results = await db
        .select()
        .from(payments)
        .where(and(
          eq(payments.id, input.paymentId),
          eq(payments.tenantId, context.tenantId)
        ));
    } else if (input.invoiceId) {
      results = await db
        .select()
        .from(payments)
        .where(and(
          eq(payments.invoiceId, input.invoiceId),
          eq(payments.tenantId, context.tenantId)
        ));
    } else {
      throw new Error('Forneça paymentId ou invoiceId');
    }

    const totalPaid = results.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    return {
      payments: results.map(p => ({
        id: p.id,
        amount: p.amount,
        paymentDate: p.paymentDate,
        status: p.status,
        paymentMethod: p.paymentMethod
      })),
      totalPaid,
      message: `${results.length} pagamento(s) encontrado(s). Total: €${totalPaid.toFixed(2)}`
    };
  }
}
