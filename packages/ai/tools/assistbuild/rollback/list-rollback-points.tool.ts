import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { RollbackService } from '../../../../../apps/api/services/rollback.service';
import type { Environment } from '../../../../../shared/types/environment';
import { z } from 'zod';

const inputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(20),
  includeProtected: z.boolean().optional().default(true)
});

type ListRollbackPointsInput = z.infer<typeof inputSchema>;

export class ListRollbackPointsTool extends ToolBase<ListRollbackPointsInput, any> {
  private rollbackService: RollbackService;

  constructor() {
    super();
    this.rollbackService = new RollbackService();
  }

  manifest: ToolManifest = {
    name: 'list_rollback_points',
    category: 'validation',
    description: 'Lists all available rollback points (snapshots) for the tenant. Each point represents a saved system state including schemas, modules, workflows, patterns and generated code. Returns ID, label, trigger type/source, creation date, size, and included components. Use to see which snapshots are available for restoration.',
    parameters: [
      { 
        name: 'limit', 
        type: 'number', 
        description: 'Maximum number of points to list (default: 20, max: 50)', 
        required: false 
      },
      { 
        name: 'includeProtected', 
        type: 'boolean', 
        description: 'Include protected (non-deletable) points in listing (default: true)', 
        required: false 
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: ListRollbackPointsInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const { tenantId, environment } = context;

      const points = await this.rollbackService.listRollbackPoints(
        tenantId,
        environment as Environment,
        { 
          limit: validated.limit,
          status: 'active'
        }
      );

      // Filter out protected points if requested
      const filteredPoints = validated.includeProtected
        ? points
        : points.filter(p => !p.isProtected);

      return {
        success: true,
        totalPoints: filteredPoints.length,
        points: filteredPoints.map(p => ({
          id: p.id,
          label: p.label,
          description: p.description || 'No description',
          triggerType: p.triggerType,
          triggerSource: p.triggerSource,
          createdAt: p.createdAt,
          createdBy: p.createdBy,
          snapshotSizeBytes: p.snapshotSizeBytes,
          componentsIncluded: Object.keys(p.snapshotData || {}),
          isProtected: p.isProtected,
          status: p.status,
          canBeDeleted: !p.isProtected
        })),
        message: `Found ${filteredPoints.length} available rollback points`
      };
    } catch (error: any) {
      console.error('[list_rollback_points] Error:', error);
      
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
        error: error.message || 'Error listing rollback points',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
