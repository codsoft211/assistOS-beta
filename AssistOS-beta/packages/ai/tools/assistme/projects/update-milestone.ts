import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projectPhases } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class UpdateMilestoneTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'update_milestone',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Atualiza o status e progresso de uma fase ou milestone do projeto',
    parameters: [
      {
        name: 'phaseId',
        type: 'string',
        description: 'ID da fase/milestone',
        required: true
      },
      {
        name: 'status',
        type: 'string',
        description: 'Novo status (pending/in_progress/completed/on_hold)',
        required: false
      },
      {
        name: 'percentComplete',
        type: 'number',
        description: 'Percentagem de conclusão (0-100)',
        required: false
      },
      {
        name: 'actualCost',
        type: 'number',
        description: 'Custo real até ao momento',
        required: false
      }
    ],
    outputSchema: z.object({
      phaseId: z.string(),
      name: z.string(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      phaseId: string;
      status?: string;
      percentComplete?: number;
      actualCost?: number;
    },
    context: ToolExecutionContext
  ) {
    const updateData: any = {
      updatedAt: new Date()
    };

    if (input.status) {
      updateData.status = input.status;
    }

    if (input.percentComplete !== undefined) {
      updateData.percentComplete = input.percentComplete.toString();
    }

    if (input.actualCost !== undefined) {
      updateData.actualCost = input.actualCost.toString();
    }

    // SECURITY: Update only phases that belong to tenant
    const [updatedPhase] = await db
      .update(projectPhases)
      .set(updateData)
      .where(
        and(
          eq(projectPhases.id, input.phaseId),
          eq(projectPhases.tenantId, context.tenantId)
        )
      )
      .returning();

    if (!updatedPhase) {
      throw new Error('Fase do projeto não encontrada ou sem permissão');
    }

    return {
      phaseId: updatedPhase.id,
      name: updatedPhase.name,
      status: updatedPhase.status,
      message: `Fase "${updatedPhase.name}" atualizada com sucesso!`
    };
  }
}
