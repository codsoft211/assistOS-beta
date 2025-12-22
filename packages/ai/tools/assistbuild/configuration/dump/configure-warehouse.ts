import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../../kernel';
import { executeStudioTool } from '../../../specialized/studio';
import { z } from 'zod';

const inputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['central', 'project', 'rental', 'virtual']),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  linkedProjectId: z.string().optional(),
  capacity: z.number().optional(),
});

export class ConfigureWarehouseTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'configure_warehouse',
    category: 'configuration',
    description: 'Configures a new warehouse (central, project, rental) via AssistBuild. Use when user requests "create warehouse", "add warehouse" in initial setup, etc.',
    parameters: [
      { name: 'name', type: 'string', description: 'Warehouse name (e.g.: Warehouse Porto, Project #45 - Site)', required: true },
      { name: 'type', type: 'string', description: 'Warehouse type: central (permanent), project (temporary construction site), rental (equipment rental), virtual (logical)', required: true },
      { name: 'address', type: 'string', description: 'Full address (optional)', required: false },
      { name: 'city', type: 'string', description: 'City (optional)', required: false },
      { name: 'postalCode', type: 'string', description: 'Postal code (optional)', required: false },
      { name: 'linkedProjectId', type: 'string', description: 'ID of the linked project (only for type=project)', required: false },
      { name: 'capacity', type: 'number', description: 'Total capacity (m² or pallets, optional)', required: false }
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: any, context: ToolExecutionContext): Promise<any> {
    const validated = inputSchema.parse(input);

    const result = await executeStudioTool({
      toolName: 'create_warehouse',
      args: validated,
      tenantId: context.tenantId,
      userId: context.userId,
      environment: context.environment || 'sandbox'
    });

    if (!result.success) {
      throw new Error(result.error?.message || result.error || 'Failed to create warehouse');
    }

    return result;
  }
}
