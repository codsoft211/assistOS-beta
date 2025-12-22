import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchaseRequisitions, purchaseRequisitionLines } from 'shared/schema';

export class CreatePurchaseRequisitionTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_purchase_requisition',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Cria uma requisicao de compra com linhas de produtos',
    parameters: [
      {
        name: 'requestDate',
        type: 'string',
        description: 'Data da requisicao (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'departmentId',
        type: 'string',
        description: 'ID do departamento requisitante',
        required: false
      },
      {
        name: 'projectId',
        type: 'string',
        description: 'ID do projeto (se aplicavel)',
        required: false
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Prioridade: low, normal, high, urgent',
        required: false
      },
      {
        name: 'neededByDate',
        type: 'string',
        description: 'Data necessaria (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'justification',
        type: 'string',
        description: 'Justificacao da requisicao',
        required: false
      },
      {
        name: 'lines',
        type: 'array',
        description: 'Linhas da requisicao com produtos e quantidades',
        required: true,
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'ID do produto' },
            quantity: { type: 'number', description: 'Quantidade' },
            estimatedPrice: { type: 'number', description: 'Preco estimado unitario (opcional)' },
            description: { type: 'string', description: 'Descricao do item (opcional)' },
            uom: { type: 'string', description: 'Unidade de medida (opcional)' }
          },
          required: ['productId', 'quantity']
        }
      }
    ],
    outputSchema: z.object({
      requisitionId: z.string(),
      code: z.string(),
      status: z.string(),
      estimatedTotal: z.number(),
      linesCount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      requestDate: string;
      departmentId?: string;
      projectId?: string;
      priority?: string;
      neededByDate?: string;
      justification?: string;
      lines: Array<{ productId: string; quantity: number; estimatedPrice?: number; description?: string; uom?: string }>;
    },
    context: ToolExecutionContext
  ) {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    
    if (lines.length === 0) {
      throw new Error('Requisicao deve conter pelo menos uma linha de produto');
    }

    // Gerar codigo unico
    const timestamp = Date.now();
    const code = `REQ-${timestamp}`;

    // Calcular total estimado
    let estimatedTotal = 0;
    for (const line of lines) {
      const lineTotal = line.quantity * (line.estimatedPrice || 0);
      estimatedTotal += lineTotal;
    }

    // Criar requisicao e linhas em transacao atomica
    const result = await db.transaction(async (tx) => {
      // 1. Inserir requisicao
      const [requisition] = await tx.insert(purchaseRequisitions).values({
        tenantId: context.tenantId,
        code,
        requestDate: input.requestDate,
        requestedBy: context.userId,
        departmentId: input.departmentId,
        projectId: input.projectId,
        source: 'manual',
        priority: (input.priority as any) || 'normal',
        neededByDate: input.neededByDate,
        justification: input.justification,
        status: 'draft',
        estimatedTotal: estimatedTotal.toString()
      }).returning();

      // 2. Inserir linhas da requisicao
      for (const line of lines) {
        const lineTotal = line.quantity * (line.estimatedPrice || 0);
        
        await tx.insert(purchaseRequisitionLines).values({
          tenantId: context.tenantId,
          requisitionId: requisition.id,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity.toString(),
          uom: line.uom,
          estimatedPrice: line.estimatedPrice?.toString(),
          estimatedTotal: lineTotal.toString()
        });
      }

      return requisition;
    });

    return {
      requisitionId: result.id,
      code: result.code,
      status: result.status,
      estimatedTotal,
      linesCount: lines.length,
      message: `Requisicao ${result.code} criada com ${lines.length} linha(s). Total estimado: ${estimatedTotal.toFixed(2)}. Status: ${result.status}`
    };
  }
}
