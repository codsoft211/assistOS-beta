import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { invoices } from 'shared/schema';

export class CreateInvoiceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_invoice',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Cria uma nova fatura no sistema financeiro',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description: 'ID do cliente',
        required: true
      },
      {
        name: 'invoiceType',
        type: 'string',
        description: 'Tipo de fatura (receivable/payable)',
        required: false,
        default: 'receivable'
      },
      {
        name: 'totalAmount',
        type: 'number',
        description: 'Valor total da fatura',
        required: true
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'Data de vencimento (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição dos serviços/produtos',
        required: false
      }
    ],
    outputSchema: z.object({
      invoiceId: z.string(),
      invoiceNumber: z.string(),
      totalAmount: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      clientId: string; 
      invoiceType?: string;
      totalAmount: number; 
      dueDate: string;
      description?: string;
    },
    context: ToolExecutionContext
  ) {
    const invoiceNumber = `INV-${Date.now()}`;
    
    // Use the environment from context (sandbox or production)
    const environment = context.environment || 'sandbox';
    
    const [newInvoice] = await db.insert(invoices).values({
      tenantId: context.tenantId,
      invoiceType: input.invoiceType || 'receivable',
      invoiceNumber,
      clientId: input.clientId,
      issueDate: new Date(),
      dueDate: new Date(input.dueDate),
      status: 'draft',
      paymentStatus: 'pending',
      totalAmount: input.totalAmount.toString(),
      subtotal: input.totalAmount.toString(),
      taxAmount: '0',
      paidAmount: '0',
      notes: input.description,
      environment,
    }).returning();

    return {
      invoiceId: newInvoice.id,
      invoiceNumber: newInvoice.invoiceNumber,
      totalAmount: newInvoice.totalAmount,
      message: `Fatura ${newInvoice.invoiceNumber} criada com sucesso! Valor: €${newInvoice.totalAmount}`
    };
  }
}
