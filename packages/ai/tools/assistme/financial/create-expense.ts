import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchasingInvoices, suppliers } from 'shared/schema';
import { eq, and } from 'drizzle-orm';
import { SequenceService } from '../../../../../apps/api/services/sequence.service';

export class CreateExpenseTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_expense',
    category: 'financial' as const,
    scope: 'tenant' as const,
    description: 'Cria uma nova despesa no sistema. Se o fornecedor (NIF) já existir, usa a ficha existente. Se não, cria novo fornecedor.',
    parameters: [
      {
        name: 'supplierTaxId',
        type: 'string',
        description: 'NIF do fornecedor (obrigatório para identificação única)',
        required: true
      },
      {
        name: 'supplierName',
        type: 'string',
        description: 'Nome do fornecedor (usado apenas se for criar novo fornecedor)',
        required: true
      },
      {
        name: 'amount',
        type: 'number',
        description: 'Valor da despesa',
        required: true
      },
      {
        name: 'category',
        type: 'string',
        description: 'Categoria da despesa',
        required: false
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição da despesa',
        required: false
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'Data de vencimento (YYYY-MM-DD)',
        required: false
      }
    ],
    outputSchema: z.object({
      expenseId: z.string(),
      invoiceNumber: z.string(),
      amount: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      supplierTaxId: string;
      supplierName: string;
      amount: number;
      category?: string;
      description?: string;
      dueDate?: string;
    },
    context: ToolExecutionContext
  ) {
    // 🔍 PASSO 1: Procurar fornecedor existente pelo NIF
    let supplierId: string;
    let resolvedSupplierName: string;
    let resolvedSupplierNif: string;
    
    const existingSupplier = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, context.tenantId),
          eq(suppliers.taxId, input.supplierTaxId)
        )
      )
      .limit(1);

    if (existingSupplier.length > 0) {
      // ✅ Fornecedor já existe - usar dados da BD (fonte autoritativa)
      supplierId = existingSupplier[0].id;
      resolvedSupplierName = existingSupplier[0].name;
      resolvedSupplierNif = existingSupplier[0].taxId || input.supplierTaxId;
    } else {
      // ➕ Criar novo fornecedor com código sequencial
      const code = await SequenceService.getNextCode({
        tenantId: context.tenantId,
        entityType: 'supplier',
        prefix: 'SUP'
      });
      
      const [newSupplier] = await db.insert(suppliers).values({
        tenantId: context.tenantId,
        code,
        name: input.supplierName,
        legalName: input.supplierName,
        taxId: input.supplierTaxId,
        category: 'services',
        isActive: true,
        paymentTerms: '30 dias',
        currency: 'EUR'
      }).returning();
      
      supplierId = newSupplier.id;
      resolvedSupplierName = newSupplier.name;
      resolvedSupplierNif = newSupplier.taxId || input.supplierTaxId;
    }

    // 🧾 PASSO 2: Criar despesa com código sequencial
    const code = await SequenceService.getNextCode({
      tenantId: context.tenantId,
      entityType: 'expense',
      prefix: 'EXP'
    });
    
    const [expense] = await db.insert(purchasingInvoices).values({
      tenantId: context.tenantId,
      environment: context.environment || 'production',
      code,
      invoiceNumber: code, // Usa mesmo código sequencial
      invoiceDate: new Date().toISOString().split('T')[0], // Data de hoje (OBRIGATÓRIO)
      supplierId, // OBRIGATÓRIO - agora sempre válido
      supplierName: resolvedSupplierName, // Use authoritative DB data
      supplierNif: resolvedSupplierNif, // Use authoritative DB data
      submissionSource: 'manual',
      subtotal: input.amount.toString(), // OBRIGATÓRIO
      taxTotal: '0', // OBRIGATÓRIO (sem IVA em despesas simples)
      totalAmount: input.amount.toString(), // OBRIGATÓRIO
      currency: 'EUR',
      dueDate: input.dueDate || undefined,
      status: 'draft',
      threeWayMatchStatus: 'pending',
      paidAmount: '0',
      remainingAmount: input.amount.toString(),
      notes: input.description,
      createdBy: context.userId
    }).returning();

    return {
      expenseId: expense.id,
      invoiceNumber: expense.invoiceNumber!,
      amount: expense.totalAmount,
      message: `Despesa ${expense.invoiceNumber} criada! Fornecedor: ${resolvedSupplierName} (NIF: ${resolvedSupplierNif}), Valor: €${expense.totalAmount} (Rascunho - aguarda validação)`
    };
  }
}
