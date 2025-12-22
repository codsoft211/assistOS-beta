import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchasingInvoices } from 'shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export class ListExpensesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_expenses',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Lista todas as despesas com filtros opcionais',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status (pending_approval/approved/rejected)',
        required: false
      },
      {
        name: 'category',
        type: 'string',
        description: 'Filtrar por categoria',
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
      expenses: z.array(z.object({
        id: z.string(),
        invoiceNumber: z.string(),
        supplierName: z.string().nullable(),
        totalAmount: z.string(),
        status: z.string().nullable(),
        category: z.string().nullable()
      })),
      total: z.number(),
      totalAmount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      status?: string;
      category?: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    const conditions = [eq(purchasingInvoices.tenantId, context.tenantId)];
    
    if (input.status) {
      conditions.push(eq(purchasingInvoices.status, input.status));
    }
    
    if (input.category) {
      conditions.push(eq(purchasingInvoices.category, input.category));
    }

    const results = await db
      .select({
        id: purchasingInvoices.id,
        invoiceNumber: purchasingInvoices.invoiceNumber,
        supplierName: purchasingInvoices.supplierName,
        totalAmount: purchasingInvoices.totalAmount,
        status: purchasingInvoices.status,
        category: purchasingInvoices.category
      })
      .from(purchasingInvoices)
      .where(and(...conditions))
      .orderBy(desc(purchasingInvoices.receiptDate))
      .limit(limit);

    const totalAmount = results.reduce((sum, exp) => sum + parseFloat(exp.totalAmount), 0);

    return {
      expenses: results,
      total: results.length,
      totalAmount,
      message: `Listadas ${results.length} despesa(s). Total: €${totalAmount.toFixed(2)}`
    };
  }
}
