import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchaseRequisitions } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ApproveRequisitionTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'approve_requisition',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Aprova ou rejeita uma requisicao de compra',
    parameters: [
      {
        name: 'requisitionId',
        type: 'string',
        description: 'ID da requisicao',
        required: true
      },
      {
        name: 'action',
        type: 'string',
        description: 'Acao: approve ou reject',
        required: true
      },
      {
        name: 'rejectionReason',
        type: 'string',
        description: 'Motivo da rejeicao (obrigatorio se action=reject)',
        required: false
      }
    ],
    outputSchema: z.object({
      requisitionId: z.string(),
      code: z.string(),
      action: z.string(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      requisitionId: string;
      action: 'approve' | 'reject';
      rejectionReason?: string;
    },
    context: ToolExecutionContext
  ) {
    // Validar acao
    if (!['approve', 'reject'].includes(input.action)) {
      throw new Error('Acao deve ser approve ou reject');
    }

    // Se rejeitar, motivo e obrigatorio
    if (input.action === 'reject' && !input.rejectionReason) {
      throw new Error('Motivo de rejeicao e obrigatorio');
    }

    // Usar transacao com forUpdate para evitar race conditions
    const result = await db.transaction(async (tx) => {
      // 1. Lock da requisicao DENTRO do transaction
      const requisition = await tx.query.purchaseRequisitions.findFirst({
        where: and(
          eq(purchaseRequisitions.tenantId, context.tenantId),
          eq(purchaseRequisitions.id, input.requisitionId)
        )
      }).forUpdate();

      // 2. Validar com dados locked
      if (!requisition) {
        throw new Error('Requisicao nao encontrada');
      }

      if (requisition.status !== 'draft' && requisition.status !== 'pending_approval') {
        throw new Error(`Requisicao ja foi processada. Status atual: ${requisition.status}`);
      }

      // 3. Update atomicamente
      const newStatus = input.action === 'approve' ? 'approved' : 'rejected';
      const now = new Date();

      await tx.update(purchaseRequisitions)
        .set({
          status: newStatus,
          approvedBy: context.userId,
          approvalDate: now,
          rejectionReason: input.action === 'reject' ? input.rejectionReason : null
        })
        .where(eq(purchaseRequisitions.id, input.requisitionId));

      return { ...requisition, status: newStatus };
    });

    const actionLabel = input.action === 'approve' ? 'aprovada' : 'rejeitada';
    const extraInfo = input.action === 'reject' ? `. Motivo: ${input.rejectionReason}` : '';

    return {
      requisitionId: result.id,
      code: result.code,
      action: input.action,
      status: result.status,
      message: `Requisicao ${result.code} ${actionLabel} com sucesso${extraInfo}`
    };
  }
}
