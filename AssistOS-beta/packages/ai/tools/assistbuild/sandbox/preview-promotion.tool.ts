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

type PreviewPromotionInput = z.infer<typeof inputSchema>;

export class PreviewPromotionTool extends ToolBase<PreviewPromotionInput, any> {
  private promotionService: SandboxPromotionService;

  constructor() {
    super();
    this.promotionService = new SandboxPromotionService();
  }

  manifest: ToolManifest = {
    name: 'preview_promotion',
    category: 'validation',
    description: 'Simulates promotion of records from sandbox to production WITHOUT APPLYING changes. Shows preview of what will be promoted: new records, existing records that will be ignored, and potential conflicts. Use to validate before executing promote_to_production.',
    parameters: [
      { 
        name: 'entities', 
        type: 'array', 
        description: 'Array of entities for preview. Each entity must have tableName (table name) and recordIds (array of record IDs).', 
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
    input: PreviewPromotionInput,
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

      // Step 1: Snapshot sandbox records
      const recordsMap = await this.promotionService.snapshot(manifest);

      // Step 2: Diff against production
      const newRecordsMap = await this.promotionService.diff(recordsMap, tenantId);

      // Calculate stats
      const preview = {
        totalRecords: 0,
        newRecords: 0,
        existingRecords: 0,
        byTable: [] as any[]
      };

      for (const [tableName, allRecords] of Array.from(recordsMap.entries())) {
        const newRecords = newRecordsMap.get(tableName) || [];
        const existingRecords = allRecords.length - newRecords.length;

        preview.totalRecords += allRecords.length;
        preview.newRecords += newRecords.length;
        preview.existingRecords += existingRecords;

        preview.byTable.push({
          tableName,
          total: allRecords.length,
          new: newRecords.length,
          existing: existingRecords,
          willPromote: newRecords.length,
          willSkip: existingRecords
        });
      }

      return {
        success: true,
        preview,
        message: `Preview: ${preview.newRecords} record(s) will be promoted, ${preview.existingRecords} already exist in production`,
        recommendation: preview.newRecords > 0 
          ? 'Confirm the records and execute promote_to_production to apply'
          : 'No new records to promote'
      };
    } catch (error: any) {
      console.error('[preview_promotion] Error:', error);
      
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
        error: error.message || 'Error generating promotion preview',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
