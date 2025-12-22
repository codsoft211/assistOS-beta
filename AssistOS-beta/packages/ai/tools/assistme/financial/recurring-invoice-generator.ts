import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class GenerateRecurringInvoicesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_recurring_invoices',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Gera faturas recorrentes automaticamente (mensal, trimestral, anual)',
    parameters: [
      {
        name: 'templateInvoiceId',
        type: 'string',
        description: 'ID da fatura template a clonar',
        required: true
      },
      {
        name: 'frequency',
        type: 'string',
        description: 'Frequência: monthly, quarterly, yearly',
        required: true
      },
      {
        name: 'occurrences',
        type: 'number',
        description: 'Número de faturas a gerar',
        required: true
      }
    ],
    outputSchema: z.object({
      generatedInvoices: z.number(),
      invoiceIds: z.array(z.string()),
      nextGenerationDate: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { templateInvoiceId: string; frequency: 'monthly' | 'quarterly' | 'yearly'; occurrences: number },
    context: ToolExecutionContext
  ) {
    // Get template invoice
    const [templateInvoice] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, input.templateInvoiceId),
          eq(invoices.tenantId, context.tenantId)
        )
      );

    if (!templateInvoice) {
      throw new Error('Fatura template não encontrada');
    }

    const frequencyMonths: Record<string, number> = {
      monthly: 1,
      quarterly: 3,
      yearly: 12
    };

    const monthsIncrement = frequencyMonths[input.frequency];
    const generatedIds: string[] = [];
    const baseDate = templateInvoice.issueDate ? new Date(templateInvoice.issueDate) : new Date();
    const baseDueDate = templateInvoice.dueDate ? new Date(templateInvoice.dueDate) : new Date();
    
    // Calculate payment terms (days between issue and due)
    const paymentTerms = templateInvoice.dueDate && templateInvoice.issueDate
      ? Math.floor((baseDueDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    for (let i = 1; i <= input.occurrences; i++) {
      const newIssueDate = new Date(baseDate);
      newIssueDate.setMonth(baseDate.getMonth() + (i * monthsIncrement));
      
      const newDueDate = new Date(newIssueDate);
      newDueDate.setDate(newIssueDate.getDate() + paymentTerms);

      // Generate new invoice number (template number + sequence)
      const newInvoiceNumber = `${templateInvoice.invoiceNumber}-R${i.toString().padStart(3, '0')}`;

      // Clone invoice
      const [newInvoice] = await db.insert(invoices).values({
        tenantId: context.tenantId,
        invoiceType: templateInvoice.invoiceType,
        invoiceNumber: newInvoiceNumber,
        clientId: templateInvoice.clientId,
        clientName: templateInvoice.clientName,
        clientNif: templateInvoice.clientNif,
        clientAddress: templateInvoice.clientAddress,
        supplierId: templateInvoice.supplierId,
        supplierName: templateInvoice.supplierName,
        supplierNif: templateInvoice.supplierNif,
        supplierIban: templateInvoice.supplierIban,
        issueDate: newIssueDate,
        dueDate: newDueDate,
        status: 'draft',
        paymentStatus: 'pending',
        paymentMethod: templateInvoice.paymentMethod,
        currency: templateInvoice.currency,
        exchangeRate: templateInvoice.exchangeRate,
        baseCurrency: templateInvoice.baseCurrency,
        netAmount: templateInvoice.netAmount,
        discountAmount: templateInvoice.discountAmount,
        subtotal: templateInvoice.subtotal,
        taxAmount: templateInvoice.taxAmount,
        totalAmount: templateInvoice.totalAmount,
        paidAmount: '0',
        withholdingTaxRate: templateInvoice.withholdingTaxRate,
        withholdingTaxAmount: templateInvoice.withholdingTaxAmount,
        documentType: templateInvoice.documentType,
      }).returning();

      generatedIds.push(newInvoice.id);
    }

    // Calculate next generation date
    const nextDate = new Date(baseDate);
    nextDate.setMonth(baseDate.getMonth() + ((input.occurrences + 1) * monthsIncrement));
    const nextGenerationDate = nextDate.toISOString().split('T')[0];

    const frequencyLabel = {
      monthly: 'mensais',
      quarterly: 'trimestrais',
      yearly: 'anuais'
    }[input.frequency];

    return {
      generatedInvoices: generatedIds.length,
      invoiceIds: generatedIds,
      nextGenerationDate,
      message: `✅ ${generatedIds.length} faturas ${frequencyLabel} geradas. Próxima geração: ${nextGenerationDate}`
    };
  }
}
