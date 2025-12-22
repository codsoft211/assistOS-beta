import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { rfqs, rfqLines } from 'shared/schema';

export class RequestQuotationTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'request_quotation',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Cria RFQ (Request for Quotation) para multiplos fornecedores',
    parameters: [
      {
        name: 'rfqDate',
        type: 'string',
        description: 'Data do RFQ (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'supplierIds',
        type: 'array',
        description: 'Array de IDs de fornecedores',
        required: true,
        items: {
          type: 'string',
          description: 'ID do fornecedor'
        }
      },
      {
        name: 'requisitionId',
        type: 'string',
        description: 'ID da requisicao (se aplicavel)',
        required: false
      },
      {
        name: 'responseDeadline',
        type: 'string',
        description: 'Prazo para resposta (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'lines',
        type: 'array',
        description: 'Linhas do RFQ [{productId, quantity, specifications}]',
        required: true,
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'ID do produto' },
            quantity: { type: 'number', description: 'Quantidade' },
            specifications: { type: 'string', description: 'Especificações (opcional)' },
            description: { type: 'string', description: 'Descrição (opcional)' },
            uom: { type: 'string', description: 'Unidade de medida (opcional)' },
            neededByDate: { type: 'string', description: 'Data necessária (opcional)' }
          },
          required: ['productId', 'quantity']
        }
      }
    ],
    outputSchema: z.object({
      rfqId: z.string(),
      code: z.string(),
      supplierCount: z.number(),
      linesCount: z.number(),
      responseDeadline: z.string().optional(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      rfqDate: string;
      supplierIds: string[];
      requisitionId?: string;
      responseDeadline?: string;
      lines: Array<{ productId: string; quantity: number; specifications?: string; description?: string; uom?: string; neededByDate?: string }>;
    },
    context: ToolExecutionContext
  ) {
    const supplierIds = Array.isArray(input.supplierIds) ? input.supplierIds : [];
    const lines = Array.isArray(input.lines) ? input.lines : [];
    
    if (supplierIds.length === 0) {
      throw new Error('Deve especificar pelo menos um fornecedor');
    }

    if (lines.length === 0) {
      throw new Error('RFQ deve conter pelo menos uma linha de produto');
    }

    const timestamp = Date.now();
    const code = `RFQ-${timestamp}`;

    // Criar RFQ em transacao atomica
    const result = await db.transaction(async (tx) => {
      // 1. Inserir RFQ
      const [rfq] = await tx.insert(rfqs).values({
        tenantId: context.tenantId,
        code,
        rfqDate: input.rfqDate,
        requisitionId: input.requisitionId,
        supplierIds: supplierIds,
        responseDeadline: input.responseDeadline,
        status: 'draft',
        createdBy: context.userId
      }).returning();

      // 2. Inserir linhas do RFQ
      for (const line of lines) {
        await tx.insert(rfqLines).values({
          tenantId: context.tenantId,
          rfqId: rfq.id,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity.toString(),
          uom: line.uom,
          specifications: line.specifications,
          neededByDate: line.neededByDate
        });
      }

      return rfq;
    });

    return {
      rfqId: result.id,
      code: result.code,
      supplierCount: supplierIds.length,
      linesCount: lines.length,
      responseDeadline: input.responseDeadline,
      message: `RFQ ${result.code} criado com ${lines.length} linha(s) para ${supplierIds.length} fornecedor(es)${input.responseDeadline ? `. Prazo: ${input.responseDeadline}` : ''}`
    };
  }
}
