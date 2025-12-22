import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { RollbackService } from '../../../../../apps/api/services/rollback.service';
import { db } from '../../../../../apps/api/db';
import { rollbackPoints } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Environment } from '../../../../../shared/types/environment';
import { z } from 'zod';

const inputSchema = z.object({
  rollbackPointId: z.string(),
  components: z.array(z.enum(['schemas', 'modules', 'patterns', 'codeGeneration', 'workflows'])).optional()
});

type ExecuteRollbackInput = z.infer<typeof inputSchema>;

export class ExecuteRollbackTool extends ToolBase<ExecuteRollbackInput, any> {
  private rollbackService: RollbackService;

  constructor() {
    super();
    this.rollbackService = new RollbackService();
  }

  manifest: ToolManifest = {
    name: 'execute_rollback',
    category: 'validation',
    description: 'Executes rollback to a specific point, restoring the system to the state captured in the snapshot. WARNING: Destructive operation that reverts schemas, modules, workflows, and code. Use only when user explicitly confirms. Components can be optionally filtered. Returns execution status.',
    parameters: [
      { 
        name: 'rollbackPointId', 
        type: 'string', 
        description: 'ID of the rollback point (snapshot) to restore the system to. Use list_rollback_points to get available IDs.', 
        required: true 
      },
      { 
        name: 'components', 
        type: 'array', 
        description: 'Optional array of specific components for rollback. If omitted, all snapshot components are restored. Use for partial rollback (e.g.: only schemas).', 
        required: false,
        items: {
          type: 'string',
          description: 'Component name (schemas, modules, patterns, codeGeneration, workflows)'
        }
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: ExecuteRollbackInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const { tenantId, environment, userId } = context;

      // Verify rollback point exists (tenant + environment scoping)
      const [point] = await db
        .select()
        .from(rollbackPoints)
        .where(and(
          eq(rollbackPoints.id, validated.rollbackPointId),
          eq(rollbackPoints.tenantId, tenantId),
          eq(rollbackPoints.environment, environment as Environment)
        ))
        .limit(1);

      if (!point) {
        return {
          success: false,
          error: `Rollback point ${validated.rollbackPointId} not found`
        };
      }

      const result = await this.rollbackService.executeRollback({
        rollbackPointId: validated.rollbackPointId,
        tenantId,
        environment: environment as Environment,
        userId,
        componentsToRollback: validated.components as any,
        async: false
      });

      return {
        success: result.status === 'completed',
        execution: {
          id: result.executionId,
          status: result.status,
          message: result.message
        },
        rollbackPoint: {
          id: point.id,
          description: point.description,
          createdAt: point.createdAt
        },
        message: result.status === 'completed'
          ? `Rollback executed successfully for snapshot from ${new Date(point.createdAt).toLocaleString('en-US')}`
          : `Rollback failed: ${result.message}`
      };
    } catch (error: any) {
      console.error('[execute_rollback] Error:', error);
      
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
        error: error.message || 'Error executing rollback',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
