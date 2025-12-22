import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { RollbackService } from '../../../../../apps/api/services/rollback.service';
import type { Environment } from '../../../../../shared/types/environment';
import { z } from 'zod';

const inputSchema = z.object({
  description: z.string().optional()
});

type CreateManualSnapshotInput = z.infer<typeof inputSchema>;

export class CreateManualSnapshotTool extends ToolBase<CreateManualSnapshotInput, any> {
  private rollbackService: RollbackService;

  constructor() {
    super();
    this.rollbackService = new RollbackService();
  }

  manifest: ToolManifest = {
    name: 'create_manual_snapshot',
    category: 'validation',
    description: 'Creates a manual snapshot of the current system state. Captures all components (schemas, installed modules, workflows, patterns, generated code) in a rollback point. Use before risky operations or when user requests backup of current state. Returns ID of created snapshot.',
    parameters: [
      { 
        name: 'description', 
        type: 'string', 
        description: 'Optional snapshot description to facilitate future identification (e.g.: "Before critical migration", "Stable state after tests")', 
        required: false 
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: CreateManualSnapshotInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const { tenantId, environment, userId } = context;

      const point = await this.rollbackService.createRollbackPoint({
        tenantId,
        environment: environment as Environment,
        label: validated.description || 'Manual snapshot',
        description: validated.description || 'Manual snapshot created via AssistBuild',
        triggerType: 'manual',
        triggerSource: 'user_request',
        userId
      });

      return {
        success: true,
        point: {
          id: point.id,
          label: point.label,
          description: point.description,
          createdAt: point.createdAt,
          snapshotSizeBytes: point.snapshotSizeBytes,
          componentsIncluded: Object.keys(point.snapshotData || {})
        },
        message: `Snapshot created successfully. ID: ${point.id}`
      };
    } catch (error: any) {
      console.error('[create_manual_snapshot] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Validation error',
          details: error.errors,
          suggestion: 'Check the provided parameters'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Error creating snapshot',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
