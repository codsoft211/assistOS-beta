import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export class ListInvoicesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_invoices',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Lista todas as faturas com filtros opcionais',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status (draft/sent/paid/cancelled)',
        required: false
      },
      {
        name: 'paymentStatus',
        type: 'string',
        description: 'Filtrar por status de pagamento (pending/partial/paid)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    outputSchema: z.object({
      invoices: z.array(z.object({
        id: z.string(),
        invoiceNumber: z.string(),
        clientName: z.string().nullable(),
        totalAmount: z.string(),
        status: z.string(),
        paymentStatus: z.string(),
        dueDate: z.date().nullable()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      status?: string;
      paymentStatus?: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const conditions = [eq(invoices.tenantId, context.tenantId)];
    
    if (input.status) {
      conditions.push(eq(invoices.status, input.status));
    }
    
    if (input.paymentStatus) {
      conditions.push(eq(invoices.paymentStatus, input.paymentStatus));
    }

    const results = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientName: invoices.clientName,
        totalAmount: invoices.totalAmount,
        status: invoices.status,
        paymentStatus: invoices.paymentStatus,
        dueDate: invoices.dueDate
      })
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.issueDate))
      .limit(limit);

    return {
      invoices: results,
      total: results.length,
      message: `Listadas ${results.length} fatura(s)`
    };
  }
}
