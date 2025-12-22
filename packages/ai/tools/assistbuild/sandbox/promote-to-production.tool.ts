import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { SandboxPromotionService } from '../../../../../apps/api/services/sandbox-promotion.service';
import type { PromotionManifest } from '../../../../../apps/api/types/promotion.types';
import { z } from 'zod';

const inputSchema = z.object({
  entities: z.array(z.object({
    tableName: z.string(),
    recordIds: z.array(z.string())
  }))
});

type PromoteToProductionInput = z.infer<typeof inputSchema>;

export class PromoteToProductionTool extends ToolBase<PromoteToProductionInput, any> {
  private promotionService: SandboxPromotionService;

  constructor() {
    super();
    this.promotionService = new SandboxPromotionService();
  }

  manifest: ToolManifest = {
    name: 'promote_to_production',
    category: 'deployment',
    description: 'Promotes specific records from sandbox environment to production. WARNING: Critical operation that moves data to production. Use only after explicit user confirmation and record validation. Returns promotion status and number of records promoted.',
    parameters: [
      { 
        name: 'entities', 
        type: 'array', 
        description: 'Array of entities to promote. Each entity must have tableName (table name) and recordIds (array of record IDs).', 
        required: true,
        items: {
          type: 'object',
          description: 'Entity with tableName and recordIds',
          properties: {
            tableName: { type: 'string', description: 'Table name' },
            recordIds: { type: 'string', description: 'Array of record IDs' }
          }
        }
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: PromoteToProductionInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const { tenantId, userId } = context;

      const manifest: PromotionManifest = {
        tenantId,
        environment: 'sandbox',
        entities: validated.entities,
        createdAt: new Date(),
        createdBy: userId
      };

      // Call SandboxPromotionService directly (in-process)
      const result = await this.promotionService.promote(manifest);

      if (!result.success) {
        return {
          success: false,
          error: result.errors?.join(', ') || 'Promotion failed',
          details: result
        };
      }

      return {
        success: true,
        promotedCount: result.promotedCount || 0,
        skippedCount: result.skippedCount || 0,
        errors: result.errors || [],
        message: `${result.promotedCount || 0} record(s) promoted successfully to production`
      };
    } catch (error: any) {
      console.error('[promote_to_production] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Validation error',
          details: error.errors,
          suggestion: 'Check the provided parameters'
        };
      }

      if (error.response) {
        return {
          success: false,
          error: error.response.data?.error || 'Promotion error',
          details: error.response.data?.details
        };
      }
      
      return {
        success: false,
        error: error.message || 'Error promoting to production',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
