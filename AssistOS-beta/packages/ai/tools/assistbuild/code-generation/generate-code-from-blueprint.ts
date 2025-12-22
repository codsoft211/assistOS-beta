import { ToolBase } from '../../kernel/base';
import type { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { assistbuildQueue } from '../../../../../apps/worker/queues/assistbuild';

const inputSchema = z.object({
  blueprintId: z.string().describe('ID of the blueprint to compile'),
  environment: z.enum(['sandbox', 'production']).default('sandbox').describe('Destination environment')
});

export class GenerateCodeFromBlueprintTool extends ToolBase<z.infer<typeof inputSchema>, any> {
  manifest: ToolManifest = {
    name: 'generate_code_from_blueprint',
    category: 'creation',
    description: 'Generates executable code (schemas, routes, UI) from a blueprint. Processes in background and returns job ID for tracking.',
    parameters: [
      { 
        name: 'blueprintId', 
        type: 'string', 
        required: true, 
        description: 'ID of the blueprint template',
        schema: z.string()
      },
      { 
        name: 'environment', 
        type: 'string', 
        required: false, 
        description: 'sandbox or production (default: sandbox)',
        default: 'sandbox',
        schema: z.enum(['sandbox', 'production'])
      }
    ],
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: z.infer<typeof inputSchema>,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    onProgress?.(10, 'Enqueuing code generation job');

    if (!assistbuildQueue) {
      throw new Error('AssistBuild queue not available - Redis may be unavailable');
    }

    const job = await assistbuildQueue.add('generate-code', {
      type: 'generate_code',
      tenantId: context.tenantId,
      userId: context.userId,
      environment: input.environment,
      input: {
        blueprintId: input.blueprintId
      }
    });

    onProgress?.(100, 'Job enqueued successfully');

    return {
      success: true,
      jobId: job.id,
      message: `Code generation started. Job ID: ${job.id}. Code will be generated in background for environment ${input.environment}.`
    };
  }
}
