import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { candidates, recruitmentJobs } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class TrackCandidateTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'track_candidate',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Atualiza o status de um candidato no processo de recrutamento',
    parameters: [
      {
        name: 'candidateId',
        type: 'string',
        description: 'ID do candidato',
        required: true
      },
      {
        name: 'status',
        type: 'string',
        description: 'Novo status (Applied/Interview/Offer/Hired/Rejected)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas sobre a mudança de status',
        required: false
      }
    ],
    outputSchema: z.object({
      candidateId: z.string(),
      candidateName: z.string(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      candidateId: string;
      status: string;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    const candidate = await db.query.candidates.findFirst({
      where: and(
        eq(candidates.id, input.candidateId),
        eq(candidates.tenantId, context.tenantId)
      ),
      with: {
        job: true
      }
    });

    if (!candidate) {
      throw new Error('Candidato não encontrado ou sem permissão');
    }

    await db.update(candidates)
      .set({
        status: input.status,
        notes: input.notes
      })
      .where(and(
        eq(candidates.id, input.candidateId),
        eq(candidates.tenantId, context.tenantId)
      ));

    return {
      candidateId: candidate.id,
      candidateName: candidate.fullName,
      status: input.status,
      message: `Status de ${candidate.fullName} atualizado para ${input.status}`
    };
  }
}
