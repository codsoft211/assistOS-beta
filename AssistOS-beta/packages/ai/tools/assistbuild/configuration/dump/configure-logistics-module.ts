import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../../kernel';
import { executeStudioTool } from '../../../specialized/studio';
import { z } from 'zod';

const inputSchema = z.object({
  industryType: z.enum(['construction', 'events', 'retail', 'manufacturing', 'general']),
  warehouseName: z.string().optional(),
  createSampleProducts: z.boolean().optional(),
  enableAutoReorder: z.boolean().optional(),
});

export class ConfigureLogisticsModuleTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'configure_logistics_module',
    category: 'configuration',
    description: 'Activates and configures the Logistics/Inventory module with initial setup: central warehouse, base products, and reorder rules. Use when user requests "activate inventory management", "configure logistics", "manage stock", etc.',
    parameters: [
      { name: 'industryType', type: 'string', description: 'Industry type for appropriate template (construction, events, retail, manufacturing, general)', required: true },
      { name: 'warehouseName', type: 'string', description: 'Default central warehouse name (e.g.: Central Warehouse Lisbon)', required: false },
      { name: 'createSampleProducts', type: 'boolean', description: 'Whether to create sample products appropriate for the industry', required: false },
      { name: 'enableAutoReorder', type: 'boolean', description: 'Whether to configure automatic reorder rules', required: false }
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: any, context: ToolExecutionContext): Promise<any> {
    const validated = inputSchema.parse(input);

    const result = await executeStudioTool({
      toolName: 'configure_logistics_module',
      args: validated,
      tenantId: context.tenantId,
      userId: context.userId,
      environment: context.environment || 'sandbox'
    });

    if (!result.success) {
      throw new Error(result.error?.message || result.error || 'Failed to configure logistics module');
    }

    return result;
  }
}
