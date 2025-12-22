import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../../kernel';
import { executeStudioTool } from '../../../specialized/studio';
import { z } from 'zod';

const inputSchema = z.object({
  productId: z.string().optional(),
  productIds: z.array(z.string()).optional(),
  warehouseId: z.string().optional(),
  minQuantity: z.number(),
  maxQuantity: z.number(),
  leadTimeDays: z.number().optional(),
}).refine(data => data.productId || (data.productIds && data.productIds.length > 0), {
  message: 'Either productId or productIds must be provided'
});

export class SetupReorderRulesTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'setup_reorder_rules',
    category: 'configuration',
    description: 'Configures automatic reorder rules for a specific product or multiple products. Use when user requests "configure automatic reorder", "low stock alerts", "reorder when below X", etc.',
    parameters: [
      { name: 'productId', type: 'string', description: 'Product ID (if configuring 1 specific rule)', required: false },
      { name: 'productIds', type: 'array', description: 'Product IDs (if configuring multiple rules at once)', required: false, items: { type: 'string' } },
      { name: 'warehouseId', type: 'string', description: 'Warehouse ID where to apply rule (optional, if omitted applies to all)', required: false },
      { name: 'minQuantity', type: 'number', description: 'Minimum quantity that triggers reorder', required: true },
      { name: 'maxQuantity', type: 'number', description: 'Maximum quantity to order', required: true },
      { name: 'leadTimeDays', type: 'number', description: 'Lead time in days (default: 7)', required: false }
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: any, context: ToolExecutionContext): Promise<any> {
    const validated = inputSchema.parse(input);

    const result = await executeStudioTool(
      'setup_reorder_rules',
      validated,
      context.tenantId,
      context.environment || 'sandbox',
      context.userId
    );

    if (!result.success) {
      throw new Error(result.error || result.message || 'Failed to setup reorder rules');
    }

    return result;
  }
}
