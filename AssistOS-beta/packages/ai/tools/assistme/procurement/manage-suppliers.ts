import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { suppliers } from 'shared/schema';
import { eq, and } from 'drizzle-orm';
import { SequenceService } from '../../../../../apps/api/services/sequence.service';

export class ManageSuppliersTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'manage_suppliers',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'CRUD de fornecedores (Create/Update/Read)',
    parameters: [
      {
        name: 'action',
        type: 'string',
        description: 'Acao: create, update, read',
        required: true
      },
      {
        name: 'supplierId',
        type: 'string',
        description: 'ID do fornecedor (obrigatorio para update/read)',
        required: false
      },
      {
        name: 'name',
        type: 'string',
        description: 'Nome do fornecedor',
        required: false
      },
      {
        name: 'taxId',
        type: 'string',
        description: 'NIF/Tax ID',
        required: false
      },
      {
        name: 'email',
        type: 'string',
        description: 'Email',
        required: false
      },
      {
        name: 'phone',
        type: 'string',
        description: 'Telefone',
        required: false
      },
      {
        name: 'address',
        type: 'string',
        description: 'Morada',
        required: false
      },
      {
        name: 'city',
        type: 'string',
        description: 'Cidade',
        required: false
      },
      {
        name: 'country',
        type: 'string',
        description: 'Pais (default: PT)',
        required: false
      },
      {
        name: 'category',
        type: 'string',
        description: 'Categoria (raw_materials, finished_goods, services, consumables)',
        required: false
      },
      {
        name: 'type',
        type: 'string',
        description: 'Tipo (preferred, approved, trial, blocked)',
        required: false
      },
      {
        name: 'paymentTerms',
        type: 'string',
        description: 'Termos de pagamento',
        required: false
      }
    ],
    outputSchema: z.object({
      action: z.string(),
      supplierId: z.string(),
      code: z.string(),
      name: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      action: 'create' | 'update' | 'read';
      supplierId?: string;
      name?: string;
      taxId?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
      category?: string;
      type?: string;
      paymentTerms?: string;
    },
    context: ToolExecutionContext
  ) {
    if (input.action === 'read') {
      // Ler fornecedor
      if (!input.supplierId) {
        throw new Error('supplierId e obrigatorio para read');
      }

      const supplier = await db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.tenantId, context.tenantId),
          eq(suppliers.id, input.supplierId)
        )
      });

      if (!supplier) {
        throw new Error('Fornecedor nao encontrado');
      }

      return {
        action: 'read',
        supplierId: supplier.id,
        code: supplier.code,
        name: supplier.name,
        message: `Fornecedor ${supplier.name} (${supplier.code}) encontrado`
      };
    }

    if (input.action === 'create') {
      // Criar fornecedor
      if (!input.name) {
        throw new Error('name e obrigatorio para create');
      }

      // Gerar código sequencial usando SequenceService (SUPP-001, SUPP-002, etc.)
      const code = await SequenceService.getNextCode({
        tenantId: context.tenantId,
        entityType: 'supplier',
        prefix: 'SUPP'
      });

      const [supplier] = await db.insert(suppliers).values({
        tenantId: context.tenantId,
        code,
        name: input.name,
        taxId: input.taxId,
        email: input.email,
        phone: input.phone,
        address: input.address,
        city: input.city,
        country: input.country || 'PT',
        category: input.category as any,
        type: (input.type as any) || 'approved',
        paymentTerms: input.paymentTerms,
        createdBy: context.userId
      }).returning();

      return {
        action: 'create',
        supplierId: supplier.id,
        code: supplier.code,
        name: supplier.name,
        message: `Fornecedor ${supplier.name} (${supplier.code}) criado com sucesso`
      };
    }

    if (input.action === 'update') {
      // Atualizar fornecedor
      if (!input.supplierId) {
        throw new Error('supplierId e obrigatorio para update');
      }

      // 1. Verificar se fornecedor existe
      const existing = await db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.tenantId, context.tenantId),
          eq(suppliers.id, input.supplierId)
        )
      });

      if (!existing) {
        throw new Error('Fornecedor nao encontrado');
      }

      // 2. Preparar dados de update
      const updateData: any = {
        updatedBy: context.userId,
        updatedAt: new Date()
      };

      if (input.name) updateData.name = input.name;
      if (input.taxId) updateData.taxId = input.taxId;
      if (input.email) updateData.email = input.email;
      if (input.phone) updateData.phone = input.phone;
      if (input.address) updateData.address = input.address;
      if (input.city) updateData.city = input.city;
      if (input.country) updateData.country = input.country;
      if (input.category) updateData.category = input.category;
      if (input.type) updateData.type = input.type;
      if (input.paymentTerms) updateData.paymentTerms = input.paymentTerms;

      // 3. Executar update
      await db.update(suppliers)
        .set(updateData)
        .where(eq(suppliers.id, input.supplierId));

      const updated = { ...existing, ...updateData };

      return {
        action: 'update',
        supplierId: updated.id,
        code: updated.code,
        name: updated.name,
        message: `Fornecedor ${updated.name} (${updated.code}) atualizado com sucesso`
      };
    }

    throw new Error('Acao invalida. Use: create, update ou read');
  }
}
