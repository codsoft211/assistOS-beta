import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { commercialPipeline } from 'shared/schema';

export class CreatePipelineTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_pipeline',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Cria um novo stage no pipeline comercial',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do stage',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição',
        required: false
      },
      {
        name: 'stageOrder',
        type: 'number',
        description: 'Ordem do stage (1, 2, 3...)',
        required: true
      },
      {
        name: 'winProbability',
        type: 'number',
        description: 'Probabilidade de ganhar (0-100)',
        required: false,
        default: 50
      },
      {
        name: 'color',
        type: 'string',
        description: 'Cor do stage (hex)',
        required: false
      },
      {
        name: 'isWinStage',
        type: 'boolean',
        description: 'É stage de vitória?',
        required: false,
        default: false
      },
      {
        name: 'isLostStage',
        type: 'boolean',
        description: 'É stage de perda?',
        required: false,
        default: false
      }
    ],
    outputSchema: z.object({
      pipelineId: z.string(),
      name: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      name: string;
      description?: string;
      stageOrder: number;
      winProbability?: number;
      color?: string;
      isWinStage?: boolean;
      isLostStage?: boolean;
    },
    context: ToolExecutionContext
  ) {
    const [newStage] = await db.insert(commercialPipeline).values({
      tenantId: context.tenantId,
      name: input.name,
      description: input.description,
      stageOrder: input.stageOrder,
      winProbability: input.winProbability || 50,
      color: input.color,
      isWinStage: input.isWinStage || false,
      isLostStage: input.isLostStage || false,
      isActive: true
    }).returning();

    return {
      pipelineId: newStage.id,
      name: newStage.name,
      message: `✅ Stage "${newStage.name}" criado no pipeline!`
    };
  }
}
