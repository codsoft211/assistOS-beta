import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { RollbackService } from '../../../../../apps/api/services/rollback.service';
import type { Environment } from '../../../../../shared/types/environment';
import { z } from 'zod';

const inputSchema = z.object({
  executionId: z.string()
});

type GetRollbackStatusInput = z.infer<typeof inputSchema>;

export class GetRollbackStatusTool extends ToolBase<GetRollbackStatusInput, any> {
  private rollbackService: RollbackService;

  constructor() {
    super();
    this.rollbackService = new RollbackService();
  }

  manifest: ToolManifest = {
    name: 'get_rollback_status',
    category: 'validation',
    description: 'Checks the status of a rollback execution. Returns progress (0-100%), status (pending/in_progress/completed/failed), current step, and error messages if any. Use to monitor asynchronous rollbacks or check execution history.',
    parameters: [
      { 
        name: 'executionId', 
        type: 'string', 
        description: 'Rollback execution ID (returned by execute_rollback)', 
        required: true 
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: GetRollbackStatusInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const { tenantId, environment } = context;

      const execution = await this.rollbackService.getRollbackExecutionStatus(
        validated.executionId,
        tenantId,
        environment as Environment
      );

      if (!execution) {
        return {
          success: false,
          error: `Execution ${validated.executionId} not found`
        };
      }

      return {
        success: true,
        execution: {
          id: execution.id,
          status: execution.status,
          progress: execution.progress,
          currentStep: execution.currentStep,
          totalSteps: execution.totalSteps,
          initiatedAt: execution.initiatedAt,
          completedAt: execution.completedAt,
          componentsRolledBack: execution.componentsRolledBack,
          errorMessage: execution.errorMessage
        },
        message: `Status: ${execution.status} (${execution.progress}% completed)`
      };
    } catch (error: any) {
      console.error('[get_rollback_status] Error:', error);
      
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
        error: error.message || 'Error checking status',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
