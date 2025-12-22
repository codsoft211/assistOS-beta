import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { timeOffRequests, employees } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class ApproveTimeoffTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'approve_timeoff',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Aprova ou rejeita um pedido de férias/ausência',
    parameters: [
      {
        name: 'requestId',
        type: 'string',
        description: 'ID do pedido',
        required: true
      },
      {
        name: 'decision',
        type: 'string',
        description: 'Decisão (Aprovado/Rejeitado)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas da revisão',
        required: false
      }
    ],
    outputSchema: z.object({
      requestId: z.string(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      requestId: string;
      decision: string;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    const request = await db.query.timeOffRequests.findFirst({
      where: and(
        eq(timeOffRequests.id, input.requestId),
        eq(timeOffRequests.tenantId, context.tenantId)
      ),
      with: {
        employee: true
      }
    });

    if (!request) {
      throw new Error('Pedido não encontrado ou sem permissão');
    }

    await db.update(timeOffRequests)
      .set({
        status: input.decision,
        reviewedBy: context.userId,
        reviewedAt: new Date(),
        reviewNotes: input.notes
      })
      .where(and(
        eq(timeOffRequests.id, input.requestId),
        eq(timeOffRequests.tenantId, context.tenantId)
      ));

    return {
      requestId: request.id,
      status: input.decision,
      message: `Pedido ${input.decision.toLowerCase()} com sucesso`
    };
  }
}
