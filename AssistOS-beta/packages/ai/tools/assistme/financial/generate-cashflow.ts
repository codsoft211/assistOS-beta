import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices, purchasingInvoices } from 'shared/schema';
import { eq, and, gte, lte, ne } from 'drizzle-orm';

export class GenerateCashflowTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_cashflow',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Gera previsão de cashflow baseada em faturas pendentes',
    parameters: [
      {
        name: 'forecastDays',
        type: 'number',
        description: 'Número de dias para previsão',
        required: false,
        default: 30
      }
    ],
    outputSchema: z.object({
      forecastDays: z.number(),
      expectedInflows: z.number(),
      expectedOutflows: z.number(),
      netCashflow: z.number(),
      inflowsCount: z.number(),
      outflowsCount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { forecastDays?: number },
    context: ToolExecutionContext
  ) {
    const forecastDays = input.forecastDays || 30;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + forecastDays);

    const pendingReceivables = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, context.tenantId),
        eq(invoices.invoiceType, 'receivable'),
        ne(invoices.paymentStatus, 'paid'),
        lte(invoices.dueDate, endDate)
      ));

    const pendingPayables = await db
      .select()
      .from(purchasingInvoices)
      .where(and(
        eq(purchasingInvoices.tenantId, context.tenantId),
        eq(purchasingInvoices.paymentStatus, 'pending'),
        lte(purchasingInvoices.dueDate, endDate)
      ));

    const expectedInflows = pendingReceivables.reduce((sum, inv) => 
      sum + (parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount || '0')), 0
    );

    const expectedOutflows = pendingPayables.reduce((sum, inv) => 
      sum + parseFloat(inv.totalAmount), 0
    );

    const netCashflow = expectedInflows - expectedOutflows;

    return {
      forecastDays,
      expectedInflows,
      expectedOutflows,
      netCashflow,
      inflowsCount: pendingReceivables.length,
      outflowsCount: pendingPayables.length,
      message: `Previsão ${forecastDays} dias: Entradas €${expectedInflows.toFixed(2)} - Saídas €${expectedOutflows.toFixed(2)} = Cashflow €${netCashflow.toFixed(2)}`
    };
  }
}
